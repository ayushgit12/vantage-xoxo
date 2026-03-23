"""Single-command full workflow validation runner.

Flow (always-on):
1. Purge old live DB data (one-time pre-step)
2. Fast deterministic integration tests
3. Live workflow E2E scenarios (2 and 3 goals)
4. Live Ryuk chatbot E2E tests
5. LLM insights report generation (advisory)
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _run_step(name: str, cmd: list[str], *, required: bool = True) -> int:
    started = time.monotonic()
    print(f"\n=== {name} ===")
    print("Running command:")
    print("$ " + " ".join(cmd))
    proc = subprocess.run(cmd, cwd=BACKEND_ROOT, check=False)
    elapsed = round(time.monotonic() - started, 2)
    if proc.returncode != 0:
        print(f"Result: FAILED | step={name} | exit={proc.returncode} | duration={elapsed}s")
        if required:
            return proc.returncode
    else:
        print(f"Result: PASSED | step={name} | duration={elapsed}s")
    return 0


def main() -> int:
    overall_started = time.monotonic()
    parser = argparse.ArgumentParser(description="Run full non-dummy workflow validation")
    parser.add_argument(
        "--skip-insights",
        action="store_true",
        help="Skip advisory insights generation",
    )
    args = parser.parse_args()

    python_cmd = sys.executable
    print("Starting full validation run")
    print(f"Workspace: {BACKEND_ROOT}")
    print(f"Python: {python_cmd}")
    print(f"Skip insights: {args.skip_insights}")

    # 0) Purge old live data once so this run's artifacts remain visible.
    rc = _run_step(
        "Purge Old Live Data",
        [python_cmd, "scripts/purge_live_data.py"],
        required=True,
    )
    if rc:
        return rc

    # 1) Deterministic guard tests.
    rc = _run_step(
        "Fast Baseline Integration",
        [python_cmd, "-m", "pytest", "tests/test_workflow_full_integration.py", "-vv", "-s"],
        required=True,
    )
    if rc:
        return rc

    # 2) Live E2E workflow scenarios.
    rc = _run_step(
        "Live Workflow E2E (2 and 3 goals)",
        [python_cmd, "-m", "pytest", "tests/test_workflow_live_e2e.py", "-vv", "-s"],
        required=True,
    )
    if rc:
        return rc

    # 3) Live Ryuk chatbot validation.
    rc = _run_step(
        "Live Ryuk E2E",
        [python_cmd, "-m", "pytest", "tests/test_ryuk_live_e2e.py", "-vv", "-s"],
        required=True,
    )
    if rc:
        return rc

    # 4) Advisory insights only (must not fail full run).
    if not args.skip_insights:
        _run_step(
            "LLM Insights (advisory)",
            [
                python_cmd,
                "scripts/llm_test_insights.py",
                "--pytest-target",
                "tests/test_workflow_live_e2e.py",
                "tests/test_ryuk_live_e2e.py",
            ],
            required=False,
        )

    total_elapsed = round(time.monotonic() - overall_started, 2)
    print("\nFull validation completed successfully.")
    print(f"Total duration: {total_elapsed}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
