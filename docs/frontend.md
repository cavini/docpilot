# The web application

How the interface is put together, and why the state is split the way it is.

> **Status:** written in M3, alongside the code it describes. Documentation is
> committed with the feature, never batched at the end, so nothing here
> describes behaviour that does not exist yet.

## Planned contents

- App Router structure, and the rule that the web app talks only to the API.
- Why `useChat` owns chat state and RTK Query owns everything else.
- Generating the API client from the OpenAPI spec.
- Internationalisation, and what makes Portuguese layouts break.
- The design system and Storybook.
- Accessibility: what is asserted, and how.
