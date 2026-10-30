# The MCP server

What the Model Context Protocol is, and how to point Claude Desktop, Cursor or
Claude Code at your own documents.

> **Status:** written in M6, alongside the code it describes. Documentation is
> committed with the feature, never batched at the end, so nothing here
> describes behaviour that does not exist yet.

## Planned contents

- What MCP is, in plain words, and why a server rather than a plugin.
- The tools exposed, and how their descriptions are written.
- Architecture: a Nest standalone app calling the HTTP API.
- Copy-paste configuration for Claude Desktop, Cursor and Claude Code.
- Testing with the MCP Inspector.
- Security: what the server can and cannot reach.
