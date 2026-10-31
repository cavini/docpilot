/** A result as returned by one search method, in rank order. */
export interface RankedId {
  chunkId: string;
}

/** One named ranked list going into the fusion. */
export interface RankedList<T extends RankedId> {
  name: string;
  results: T[];
}

/** A fused result, with where each method ranked it. */
export interface FusedResult<T extends RankedId> {
  item: T;
  score: number;
  /** One-based rank per method, absent where that method did not find it. */
  ranks: Record<string, number>;
}

/**
 * Damping constant for Reciprocal Rank Fusion.
 *
 * Controls how steeply influence falls off with rank. A small value lets the
 * top result dominate; a large one flattens every rank toward equal. 60 is the
 * value from the original paper and the common default — a starting point
 * here, not a measured one.
 */
export const RRF_K = 60;

/**
 * Fuses several ranked lists into one.
 *
 * Each result scores `1 / (k + rank)` in every list it appears in, and those
 * are summed. A passage both methods rank highly wins; a passage only one
 * method found can still rank well if it ranked very highly there.
 *
 * **Only positions are used, never scores.** A cosine distance and a
 * `ts_rank_cd` value are not comparable — different units, different
 * distributions, different scales — and normalising them into one number
 * requires a fudge factor that needs retuning whenever either side changes.
 * Ranks are comparable by construction, which is the whole appeal.
 *
 * Ties break by chunk id, so the order is stable: an unstable order makes
 * every downstream test flaky and makes a result impossible to reproduce from
 * a bug report.
 *
 * @param lists The ranked lists, each already in rank order.
 * @param k Damping constant.
 * @returns Results in fused order, highest score first.
 *
 * @example
 * ```ts
 * fuse([
 *   { name: 'vector', results: [a, c, b] },
 *   { name: 'keyword', results: [b, d, a] },
 * ]);
 * ```
 */
export function fuse<T extends RankedId>(
  lists: RankedList<T>[],
  k: number = RRF_K,
): FusedResult<T>[] {
  const accumulated = new Map<string, FusedResult<T>>();

  for (const list of lists) {
    for (const [index, result] of list.results.entries()) {
      const rank = index + 1;
      const existing = accumulated.get(result.chunkId);

      if (existing) {
        existing.score += 1 / (k + rank);
        existing.ranks[list.name] = rank;
        continue;
      }

      accumulated.set(result.chunkId, {
        item: result,
        score: 1 / (k + rank),
        ranks: { [list.name]: rank },
      });
    }
  }

  return [...accumulated.values()].sort(
    (left, right) =>
      right.score - left.score || left.item.chunkId.localeCompare(right.item.chunkId),
  );
}
