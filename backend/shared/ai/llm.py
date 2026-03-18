"""Shared LLM access layer using LangChain + LangGraph.

This centralizes model/provider wiring so callers can keep prompts/logic unchanged
while switching model names and keys from settings.
"""

import importlib
from typing import Any, TypedDict

from shared.config import get_settings


class _GraphState(TypedDict):
    messages: list[Any]
    temperature: float
    json_mode: bool
    response_text: str


def _imports() -> dict[str, Any]:
    try:
        messages_mod = importlib.import_module("langchain_core.messages")
        openai_mod = importlib.import_module("langchain_openai")
        graph_mod = importlib.import_module("langgraph.graph")
    except ImportError as exc:
        raise RuntimeError(
            "LangChain/LangGraph packages are required. Install backend dependencies first."
        ) from exc

    return {
        "AIMessage": getattr(messages_mod, "AIMessage"),
        "AIMessageChunk": getattr(messages_mod, "AIMessageChunk"),
        "HumanMessage": getattr(messages_mod, "HumanMessage"),
        "SystemMessage": getattr(messages_mod, "SystemMessage"),
        "ChatOpenAI": getattr(openai_mod, "ChatOpenAI"),
        "AzureChatOpenAI": getattr(openai_mod, "AzureChatOpenAI"),
        "StateGraph": getattr(graph_mod, "StateGraph"),
        "END": getattr(graph_mod, "END"),
    }


def _resolve_llm_credentials() -> tuple[str, str]:
    settings = get_settings()
    api_key = settings.azure_openai_api_key or settings.llm_api_key
    model = settings.llm_model
    return api_key, model


def _use_azure_openai() -> bool:
    settings = get_settings()
    return bool(settings.azure_openai_endpoint and settings.azure_openai_deployment)


def _validate_llm_settings() -> None:
    settings = get_settings()
    if _use_azure_openai():
        endpoint = (settings.azure_openai_endpoint or "").strip()
        if "your-resource-name" in endpoint:
            raise RuntimeError("Azure OpenAI endpoint is still a placeholder; set AZURE_OPENAI_ENDPOINT")
        if not endpoint.startswith("https://"):
            raise RuntimeError("AZURE_OPENAI_ENDPOINT must start with https://")
        if not (settings.azure_openai_api_key or settings.llm_api_key):
            raise RuntimeError("Azure OpenAI API key missing; set AZURE_OPENAI_API_KEY or LLM_API_KEY")
    else:
        if not settings.llm_api_key:
            raise RuntimeError("LLM_API_KEY is required for non-Azure LLM mode")


def _build_chat_model(temperature: float, json_mode: bool) -> Any:
    imported = _imports()
    chat_openai_cls = imported["ChatOpenAI"]
    azure_chat_openai_cls = imported["AzureChatOpenAI"]
    settings = get_settings()
    _validate_llm_settings()
    api_key, model = _resolve_llm_credentials()
    model_kwargs: dict[str, Any] = {}
    if json_mode:
        model_kwargs["response_format"] = {"type": "json_object"}

    if _use_azure_openai():
        return azure_chat_openai_cls(
            azure_endpoint=settings.azure_openai_endpoint,
            api_key=api_key,
            api_version=settings.azure_openai_api_version,
            azure_deployment=settings.azure_openai_deployment,
            temperature=temperature,
            model_kwargs=model_kwargs,
        )

    return chat_openai_cls(
        model=model,
        api_key=api_key,
        temperature=temperature,
        model_kwargs=model_kwargs,
    )


def _invoke_node(state: _GraphState) -> _GraphState:
    imported = _imports()
    ai_message_cls = imported["AIMessage"]
    llm = _build_chat_model(temperature=state["temperature"], json_mode=state["json_mode"])
    resp = llm.invoke(state["messages"])
    if isinstance(resp, ai_message_cls):
        text = resp.content if isinstance(resp.content, str) else str(resp.content)
    else:
        text = str(resp)
    state["response_text"] = text.strip()
    return state


def run_prompt_via_graph(
    user_prompt: str,
    *,
    system_prompt: str | None = None,
    temperature: float = 0.0,
    json_mode: bool = False,
) -> str:
    """Run a prompt through a one-node LangGraph workflow and return text output."""
    imported = _imports()
    human_msg_cls = imported["HumanMessage"]
    system_msg_cls = imported["SystemMessage"]
    state_graph_cls = imported["StateGraph"]
    end_node = imported["END"]

    messages: list[Any] = []
    if system_prompt:
        messages.append(system_msg_cls(content=system_prompt))
    messages.append(human_msg_cls(content=user_prompt))

    graph = state_graph_cls(_GraphState)
    graph.add_node("invoke", _invoke_node)
    graph.set_entry_point("invoke")
    graph.add_edge("invoke", end_node)
    app = graph.compile()

    state: _GraphState = {
        "messages": messages,
        "temperature": temperature,
        "json_mode": json_mode,
        "response_text": "",
    }
    result = app.invoke(state)
    return result["response_text"]


def stream_chat_via_langchain(
    *,
    system_prompt: str,
    history: list[dict[str, Any]],
    user_message: str,
    temperature: float = 0.2,
):
    """Yield chat response chunks from LangChain streaming API."""
    imported = _imports()
    ai_message_cls = imported["AIMessage"]
    ai_message_chunk_cls = imported["AIMessageChunk"]
    human_msg_cls = imported["HumanMessage"]
    system_msg_cls = imported["SystemMessage"]

    messages: list[Any] = [system_msg_cls(content=system_prompt)]
    for msg in history:
        role = msg.get("role")
        content = str(msg.get("content", ""))
        if role == "user":
            messages.append(human_msg_cls(content=content))
        else:
            messages.append(ai_message_cls(content=content))
    messages.append(human_msg_cls(content=user_message))

    llm = _build_chat_model(temperature=temperature, json_mode=False)
    for chunk in llm.stream(messages):
        if isinstance(chunk, ai_message_chunk_cls):
            part = chunk.content if isinstance(chunk.content, str) else str(chunk.content)
            if part:
                yield part
