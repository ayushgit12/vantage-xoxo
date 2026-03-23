"""Run pytest, summarize results, and ask an LLM for quality insights.

Usage:
  cd backend
  source .venv/bin/activate
  python scripts/llm_test_insights.py --pytest-target tests/test_workflow_full_integration.py

Environment:
    LLM_INSIGHTS_MODEL=gpt-4.1  # optional override
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

# Make backend package imports work when running this file directly.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from shared.ai.llm import run_prompt_via_graph


@dataclass
class PytestSummary:
    command: list[str]
    exit_code: int
    tests: int
    failures: int
    errors: int
    skipped: int
    duration_s: float
    stdout_tail: str
    failure_details: list[dict]


def _redact_secrets(text: str) -> str:
    if not text:
        return text

    patterns = [
        r"(?i)(api[_-]?key\s*[=:]\s*)([^\s,;]+)",
        r"(?i)(secret\s*[=:]\s*)([^\s,;]+)",
        r"(?i)(token\s*[=:]\s*)([^\s,;]+)",
        r"(?i)(password\s*[=:]\s*)([^\s,;]+)",
    ]

    out = text
    for pattern in patterns:
        out = re.sub(pattern, r"\1<REDACTED>", out)
    return out


def _parse_junit_xml(xml_path: Path) -> tuple[int, int, int, int, float, list[dict]]:
    tree = ET.parse(xml_path)
    root = tree.getroot()

    # JUnit output can be either <testsuite> or <testsuites>
    suites = [root] if root.tag == "testsuite" else list(root.findall("testsuite"))

    tests = 0
    failures = 0
    errors = 0
    skipped = 0
    duration_s = 0.0
    details: list[dict] = []

    for suite in suites:
        tests += int(suite.attrib.get("tests", 0))
        failures += int(suite.attrib.get("failures", 0))
        errors += int(suite.attrib.get("errors", 0))
        skipped += int(suite.attrib.get("skipped", 0))
        duration_s += float(suite.attrib.get("time", 0.0))

        for case in suite.findall("testcase"):
            failure = case.find("failure")
            error = case.find("error")
            if failure is None and error is None:
                continue

            node = failure if failure is not None else error
            message = node.attrib.get("message", "") if node is not None else ""
            trace = (node.text or "") if node is not None else ""
            details.append(
                {
                    "name": case.attrib.get("name", ""),
                    "classname": case.attrib.get("classname", ""),
                    "time": float(case.attrib.get("time", 0.0)),
                    "kind": "failure" if failure is not None else "error",
                    "message": _redact_secrets(message),
                    "trace": _redact_secrets(trace)[:4000],
                }
            )

    return tests, failures, errors, skipped, duration_s, details


def _run_pytest(pytest_targets: list[str]) -> PytestSummary:
    with tempfile.TemporaryDirectory(prefix="pytest-junit-") as tmp_dir:
        junit_path = Path(tmp_dir) / "junit.xml"

        cmd = [
            sys.executable,
            "-m",
            "pytest",
            *pytest_targets,
            "-q",
            f"--junitxml={junit_path}",
        ]

        print("Running pytest for insights...")
        print("$ " + " ".join(cmd))
        started = time.monotonic()
        proc = subprocess.run(cmd, text=True, capture_output=True, check=False)
        elapsed = round(time.monotonic() - started, 2)
        print(f"Pytest finished with exit={proc.returncode} in {elapsed}s")
        stdout = proc.stdout or ""
        stderr = proc.stderr or ""
        merged = f"{stdout}\n{stderr}".strip()

        if not junit_path.exists():
            # Fallback when pytest crashes before writing XML
            return PytestSummary(
                command=cmd,
                exit_code=proc.returncode,
                tests=0,
                failures=0,
                errors=1,
                skipped=0,
                duration_s=0.0,
                stdout_tail=_redact_secrets(merged)[-5000:],
                failure_details=[
                    {
                        "name": "pytest bootstrap failure",
                        "classname": "pytest",
                        "time": 0.0,
                        "kind": "error",
                        "message": "Pytest failed before producing JUnit XML",
                        "trace": _redact_secrets(merged)[-4000:],
                    }
                ],
            )

        tests, failures, errors, skipped, duration_s, details = _parse_junit_xml(junit_path)
        return PytestSummary(
            command=cmd,
            exit_code=proc.returncode,
            tests=tests,
            failures=failures,
            errors=errors,
            skipped=skipped,
            duration_s=duration_s,
            stdout_tail=_redact_secrets(merged)[-5000:],
            failure_details=details,
        )


def _build_llm_prompt(summary: PytestSummary, notes: str | None = None) -> str:
    payload = {
        "tests": summary.tests,
        "failures": summary.failures,
        "errors": summary.errors,
        "skipped": summary.skipped,
        "duration_s": round(summary.duration_s, 3),
        "exit_code": summary.exit_code,
        "failure_details": summary.failure_details,
        "stdout_tail": summary.stdout_tail,
        "notes": notes or "",
    }

    return (
        "You are a senior test-quality reviewer for an LLM-heavy planner product.\n"
        "Analyze the pytest summary and return strict JSON with these keys:\n"
        "{\n"
        '  "health_verdict": "healthy|attention|critical",\n'
        '  "likely_root_causes": ["..."],\n'
        '  "risk_signals": ["..."],\n'
        '  "missing_scenarios": ["..."],\n'
        '  "action_plan": ["..."],\n'
        '  "confidence": 0.0\n'
        "}\n"
        "Guidelines:\n"
        "- If all tests passed, still look for blind spots and weak assertions.\n"
        "- Focus on deterministic reliability, state transitions, isolation, and metadata integrity.\n"
        "- Keep each list item concise and concrete.\n\n"
        f"Pytest summary JSON:\n{json.dumps(payload, indent=2)}"
    )


def _maybe_get_llm_insights(summary: PytestSummary, model: str | None, notes: str | None) -> dict:
    try:
        print(f"Requesting LLM insights with model={model}...")
        prompt = _build_llm_prompt(summary, notes=notes)
        started = time.monotonic()
        response = run_prompt_via_graph(
            prompt,
            temperature=0.1,
            json_mode=True,
            model=model,
        )
        elapsed = round(time.monotonic() - started, 2)
        print(f"LLM insights generated in {elapsed}s")
        return {
            "enabled": True,
            "reason": "ok",
            "insights": json.loads(response),
            "raw": response,
        }
    except Exception as exc:
        print(f"LLM insights failed: {exc}")
        return {
            "enabled": True,
            "reason": f"LLM call failed: {exc}",
            "insights": None,
        }


def main() -> int:
    overall_started = time.monotonic()
    parser = argparse.ArgumentParser(description="Run pytest and generate optional LLM insights report")
    parser.add_argument(
        "--pytest-target",
        nargs="+",
        default=["tests/test_workflow_full_integration.py"],
        help="One or more pytest target paths/expressions",
    )
    parser.add_argument(
        "--model",
        default=os.getenv("LLM_INSIGHTS_MODEL", "gpt-4.1"),
        help="Model override for insights LLM",
    )
    parser.add_argument(
        "--notes",
        default="",
        help="Optional run notes to include in the LLM prompt",
    )
    parser.add_argument(
        "--output-dir",
        default="tests/artifacts",
        help="Where to write summary and insights files",
    )
    args = parser.parse_args()
    print("Starting test insights run")
    print(f"Pytest targets: {args.pytest_target}")
    print(f"Output dir: {args.output_dir}")
    print(f"LLM model: {args.model}")

    summary = _run_pytest(args.pytest_target)
    print(
        "Pytest summary: "
        f"tests={summary.tests}, failures={summary.failures}, "
        f"errors={summary.errors}, skipped={summary.skipped}, "
        f"exit={summary.exit_code}"
    )
    llm = _maybe_get_llm_insights(summary, model=args.model, notes=args.notes)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    now = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    report_base = output_dir / f"llm-test-insights-{now}"

    result = {
        "timestamp_utc": now,
        "pytest": {
            "command": summary.command,
            "exit_code": summary.exit_code,
            "tests": summary.tests,
            "failures": summary.failures,
            "errors": summary.errors,
            "skipped": summary.skipped,
            "duration_s": round(summary.duration_s, 3),
            "failure_details": summary.failure_details,
            "stdout_tail": summary.stdout_tail,
        },
        "llm": llm,
    }

    json_path = report_base.with_suffix(".json")
    json_path.write_text(json.dumps(result, indent=2), encoding="utf-8")

    md_lines = [
        "# Test Insights Report",
        "",
        f"- Timestamp UTC: {now}",
        f"- Tests: {summary.tests}",
        f"- Failures: {summary.failures}",
        f"- Errors: {summary.errors}",
        f"- Skipped: {summary.skipped}",
        f"- Duration (s): {round(summary.duration_s, 3)}",
        f"- Exit code: {summary.exit_code}",
        "",
    ]

    if llm.get("enabled") and llm.get("insights"):
        insights = llm["insights"]
        md_lines.extend(
            [
                "## LLM Verdict",
                "",
                f"- Health: {insights.get('health_verdict')}",
                f"- Confidence: {insights.get('confidence')}",
                "",
                "## Action Plan",
                "",
            ]
        )
        for item in insights.get("action_plan", []):
            md_lines.append(f"- {item}")
    else:
        md_lines.extend(
            [
                "## LLM",
                "",
                f"- {llm.get('reason', 'not available')}",
            ]
        )

    md_path = report_base.with_suffix(".md")
    md_path.write_text("\n".join(md_lines) + "\n", encoding="utf-8")

    print(f"Wrote JSON report: {json_path}")
    print(f"Wrote Markdown report: {md_path}")
    total_elapsed = round(time.monotonic() - overall_started, 2)
    print(f"Insights run completed in {total_elapsed}s")

    return summary.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
