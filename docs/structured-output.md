# Structured output

Getting JSON out of a language model that matches a schema, and what to do when
it does not.

> **Status:** written in M5, alongside the code it describes. Documentation is
> committed with the feature, never batched at the end, so nothing here
> describes behaviour that does not exist yet.

## Planned contents

- Why structured output beats parsing prose.
- Zod schemas as the single definition, and how a provider enforces them.
- Validation, and the single repair retry.
- Streaming a partial object into a table as it fills.
- The schema registry, and how to add one.
