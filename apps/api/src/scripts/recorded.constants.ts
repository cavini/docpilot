/**
 * What the embedding recorder captures, and where it puts it.
 *
 * Lives beside the recorder rather than in the test folder because the build
 * only compiles `src`, and the recorder is a developer tool that ships with
 * the application's build. The tests import it from here.
 */

/** Where the recorded embeddings live, relative to the app root. */
export const EMBEDDING_FIXTURE_PATH = 'test/fixtures/embeddings.json';

/**
 * Documents whose chunks are embedded for the quality tests.
 *
 * Deliberately a subset of the corpus: enough that ranking is meaningful,
 * small enough that the committed fixture stays a reasonable size. One English
 * document and one Portuguese one, so both stemmers and both languages are
 * exercised.
 */
export const RECORDED_SOURCES = ['lumen-api.md', 'lumen-guia.md'] as const;

/**
 * Questions the quality tests ask.
 *
 * Each is phrased **differently from the text that answers it**, which is the
 * whole point: a query sharing words with its answer would pass on keyword
 * search alone and prove nothing about the embeddings.
 */
export const RECORDED_QUERIES = [
  // Paraphrases: no useful word overlap with the passages that answer them.
  'how do I prove who I am to the API?',
  'what happens if I send too many requests?',
  'how long does a credential stay valid?',
  'how do I move through a long list of results?',
  'what should I do when something goes wrong?',
  'how do I replace a secret without downtime?',
  // Exact identifiers: what keyword search is for.
  'X-RateLimit-Reset',
  'Idempotency-Key',
  // Portuguese paraphrase.
  'como faço para provar minha identidade?',
  'o que acontece se eu exceder o limite?',
] as const;
