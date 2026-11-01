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

### What one client can do

Two limits on every route. The burst limit bounds how fast; the daily limit
bounds how much, and only the second bounds cost — a burst limit resets, so on
its own it lets one client sit at it all day.

| Route group | Burst        | Per day | Roughly         |
| ----------- | ------------ | ------- | --------------- |
| Reads       | 120 / minute | 5,000   | Free            |
| Questions   | 10 / 5 min   | 30      | 3 cents         |
| Uploads     | 5 / 15 min   | 10      | Depends on size |

Thirty questions is half as much again as a thorough look around, measured at
about twenty. Fifteen different visitors can each have that before a fifty-cent
daily ceiling is reached.

**These are per client address, not per person.** There is no identity behind
one shared key, so two people on one office network share a budget and one
person with a phone has two. It bounds blast radius. Real per-person limits need
per-person credentials.

### Choosing a model

The provider's own per-minute limits matter as much as the price here, because
one agent turn is up to `AGENT_MAX_STEPS` model calls — six by default — and
they all land inside the same minute.

| Model        | Price in / out per 1M | A new account's limit | One agent turn |
| ------------ | --------------------- | --------------------- | -------------- |
| `gpt-5`      | $1.25 / $10.00        | 3 requests/min        | Does not fit   |
| `gpt-5-mini` | $0.25 / $2.00         | 10 requests/min       | Fits           |
| `gpt-5-nano` | $0.05 / $0.40         | 10 requests/min       | Fits           |

`gpt-5-mini` is the one to start with: five times cheaper than `gpt-5`, and with
room for an agent turn without the provider refusing half of it. The limits
above are what a new account gets and rise with spend, so check the project's
own limits page rather than trusting this table.

`MAX_UPLOAD_MB` is worth lowering specifically. At 20 MB a single upload costs
about ten cents to embed, which is a fifth of a fifty-cent day in one action; at
5 MB it is under three. Nobody demonstrating a document-answering app needs to
upload twenty megabytes.

Whatever you pick has to be in `llm/pricing.ts`. The daily ceiling sums a cost
column, and a model this build has no price for records every call as free — so
the application refuses to start in that combination rather than running with
the only money protection silently off.

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
