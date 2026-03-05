"""OpenTelemetry tracing setup for Azure Application Insights."""

import logging
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanExporter
from opentelemetry.sdk.resources import Resource

from shared.config import get_settings

logger = logging.getLogger(__name__)
_initialized = False


def init_tracing(service_name: str = "vantage") -> None:
    global _initialized
    if _initialized:
        return

    settings = get_settings()
    resource = Resource.create({"service.name": service_name})
    provider = TracerProvider(resource=resource)

    if settings.applicationinsights_connection_string:
        from azure.monitor.opentelemetry.exporter import AzureMonitorTraceExporter

        exporter = AzureMonitorTraceExporter(
            connection_string=settings.applicationinsights_connection_string
        )
        provider.add_span_processor(BatchSpanExporter(exporter))
        logger.info("Azure Application Insights tracing enabled")
    else:
        logger.info("No App Insights connection string; tracing to console only")

    trace.set_tracer_provider(provider)
    _initialized = True


def get_tracer(name: str = "vantage") -> trace.Tracer:
    return trace.get_tracer(name)
