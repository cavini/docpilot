# The agent and its tools

What an agent loop actually is, which tools DocPilot exposes, and how a tool
that changes something asks permission first.

> **Status:** written in M4, alongside the code it describes. Documentation is
> committed with the feature, never batched at the end, so nothing here
> describes behaviour that does not exist yet.

## Planned contents

- What an agent loop is, in plain terms, and how the model decides to call a
  tool.
- Each tool: its schema, its purpose, an example call and result.
- Step limits, and what happens when one is reached.
- The approval pattern for side effects.
- Tool errors and timeouts: what the model sees when a tool fails.
- How the interface renders each step.
