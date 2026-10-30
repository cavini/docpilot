/** Text-search configurations the project supports. */
export type SupportedLanguage = 'english' | 'portuguese';

/**
 * Words that are common in one language and rare in the other.
 *
 * Function words rather than content words, because they appear at a steady
 * rate in any text on any subject. The Portuguese list avoids words that also
 * occur in English, so a technical English document full of code does not
 * drift toward Portuguese on a stray token.
 */
const MARKERS: Record<SupportedLanguage, string[]> = {
  english: [
    'the',
    'and',
    'with',
    'this',
    'that',
    'from',
    'your',
    'when',
    'which',
    'request',
    'returns',
    'should',
    'must',
    'will',
    'these',
    'what',
  ],
  portuguese: [
    'não',
    'são',
    'uma',
    'com',
    'para',
    'que',
    'este',
    'esta',
    'como',
    'você',
    'então',
    'após',
    'será',
    'pelo',
    'pela',
    'também',
    'já',
  ],
};

/**
 * Guesses which text-search configuration a document should be indexed with.
 *
 * A frequency count over function words, not a statistical language model. It
 * only has to separate two languages, it has to be deterministic so the same
 * document always lands in the same configuration, and it has to run on every
 * ingestion without a dependency or a model call.
 *
 * Getting this wrong is quiet rather than loud: Portuguese indexed with the
 * English stemmer still stores and still retrieves by vector, it just loses
 * keyword recall. So the default leans to English, which is what the technical
 * corpus mostly is.
 *
 * @param text Document text.
 * @returns The configuration to index with.
 *
 * @example
 * ```ts
 * detectLanguage('A autenticação exige um cabeçalho'); // 'portuguese'
 * ```
 */
export function detectLanguage(text: string): SupportedLanguage {
  const words = text.toLowerCase().match(/[\p{L}À-ɏ]+/gu) ?? [];

  if (words.length === 0) {
    return 'english';
  }

  const sample = words.slice(0, 4000);
  const counts: Record<SupportedLanguage, number> = { english: 0, portuguese: 0 };

  for (const word of sample) {
    for (const language of ['english', 'portuguese'] as const) {
      if (MARKERS[language].includes(word)) {
        counts[language] += 1;
      }
    }
  }

  // Accented characters that English does not use are strong evidence on their
  // own, and matter for short documents where few marker words appear.
  const accents = (text.match(/[ãáàâçéêíóôõú]/giu) ?? []).length;
  counts.portuguese += Math.min(accents, sample.length) / 8;

  return counts.portuguese > counts.english ? 'portuguese' : 'english';
}
