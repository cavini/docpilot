# Deployment

How to run this somewhere other than a laptop, and what it costs.

> **Status:** written in M9, alongside the code it describes. Documentation is
> committed with the feature, never batched at the end, so nothing here
> describes behaviour that does not exist yet.

## Before exposing it to the internet

The rest of this page is written in M9. This checklist is not, because the
settings it names exist now and the deploy comes first.

| Set                             | To                                                            |
| ------------------------------- | ------------------------------------------------------------- |
| `DEMO_API_KEY`                  | A long random string. Empty leaves the API open               |
| `NEXT_PUBLIC_DEMO_KEY_REQUIRED` | `true`, wherever the key above is set                         |
| `DAILY_BUDGET_USD`              | A real number. `0` means no ceiling                           |
| `MAX_DOCUMENTS`                 | A real number. `0` means unlimited                            |
| `RATE_LIMIT_ENABLED`            | `true` (the default; do not turn it off)                      |
| `TRUST_PROXY`                   | `true` **only** if a proxy you control sets `X-Forwarded-For` |
| `CORS_ORIGIN`                   | The web app's real origin, not `*`                            |

`NEXT_PUBLIC_` values are read at build time, so changing one needs a rebuild
rather than a restart.

Then check the first lines of the log. Every guard is named there, and the
dangerous states are the loud ones:

```
guards: demo key required, spend ceiling $0.50/day, rate limits on, corpus <= 50 documents, uploads <= 20 MB
```

If that line says `OPEN` or `NONE`, the deployment is not configured.

**Outside the application:** set a budget limit in the provider's own dashboard.
It is free, it cannot be bypassed by a bug in this code, and it is the only one
of these that still works when the application is wrong.

→ [Security and guardrails](./security-and-guardrails.md).

## Planned contents

- Hosts considered, and why.
- Environment per environment.
- Migrations on deploy.
- Seeding the demo corpus idempotently.
- Rollback.
- Monitoring and spending caps.
- Reproducing the whole setup from scratch.
