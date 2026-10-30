# Observability

What to look at when something is slow or wrong in production.

> **Status:** written in M7, alongside the code it describes. Documentation is
> committed with the feature, never batched at the end, so nothing here
> describes behaviour that does not exist yet.

## Planned contents

- The log format and how to search it.
- Request ids, and following one request across services.
- Enabling Datadog tracing, and running without it.
- Custom spans for retrieval, model calls and ingestion.
- Correlating logs with traces.
- Shipping the same logs somewhere other than Datadog.
