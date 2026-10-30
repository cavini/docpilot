# Security and guardrails

The ways a document-answering system can be abused, and what is done about each.

> **Status:** written in M7, alongside the code it describes. Documentation is
> committed with the feature, never batched at the end, so nothing here
> describes behaviour that does not exist yet.

## Planned contents

- Threat model: prompt injection through an uploaded document, data exfiltration
  through tools, cost attacks, unsafe rendering, GraphQL abuse.
- Mitigations, each with the test that proves it.
- The injection test document, and what the agent does with it.
- Known gaps, stated honestly.
