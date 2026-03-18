from pydantic_settings import BaseSettings
from functools import lru_cache
from pathlib import Path


class Settings(BaseSettings):
    # Azure Cosmos DB
    cosmos_connection_string: str = ""
    cosmos_database_name: str = "vantage"

    # Azure Blob Storage
    azure_storage_connection_string: str = ""
    azure_storage_container: str = "vantage-files"

    # Azure Service Bus
    service_bus_connection_string: str = ""
    service_bus_queue_retriever: str = "retriever-jobs"
    service_bus_queue_planner: str = "planner-jobs"
    service_bus_queue_executor: str = "executor-jobs"

    # LLM settings (model/provider-agnostic)
    llm_api_key: str = ""
    llm_model: str = "gpt-4.1"

    # Azure OpenAI (optional; when set, LangChain uses AzureChatOpenAI)
    azure_openai_api_key: str = ""
    azure_openai_endpoint: str = ""
    azure_openai_api_version: str = "2024-12-01-preview"
    azure_openai_deployment: str = ""

    # SentenceTransformers (local embeddings for retriever)
    embedding_model: str = "all-MiniLM-L6-v2"

    # Microsoft Graph
    graph_client_id: str = ""
    graph_client_secret: str = ""
    graph_tenant_id: str = ""
    graph_user_id: str = ""
    graph_redirect_uri: str = "http://localhost:8000/auth/callback"

    # App Insights
    applicationinsights_connection_string: str = ""

    # App Config
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    frontend_url: str = "http://localhost:3000"
    log_level: str = "INFO"
    environment: str = "development"

    # Auth
    azure_ad_tenant_id: str = ""
    azure_ad_client_id: str = ""
    azure_ad_client_secret: str = ""

    # Calendar
    use_mock_calendar: bool = True

    model_config = {"env_file": str(Path(__file__).resolve().parent.parent / ".env"), "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
