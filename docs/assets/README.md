# Assets

Screenshots and the demo recording used by the README.

| File                   | Replaces                                                    | When |
| ---------------------- | ----------------------------------------------------------- | ---- |
| `demo-placeholder.svg` | A recording of upload, question and a streamed cited answer | M9   |

## Recording the demo

1. `pnpm infra:up && pnpm db:migrate && pnpm seed && pnpm dev`
2. Record at **1280×720** or wider, so code in the answers stays legible.
3. Show, in order: uploading a document, its progress reaching `ready`, asking a
   question, the answer streaming in, and opening a citation to reveal the
   source passage. That last step is the point of the product and the easiest
   one to leave out.
4. Keep it under 20 seconds and 5 MB, or GitHub will be slow to load it.
5. Save as `demo.gif` here and update the README's image and alt text.
