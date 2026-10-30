/**
 * Injection token for the shared Redis client.
 *
 * One client is shared by the cache and the health check. BullMQ creates its
 * own connections, because it needs clients in blocking mode that cannot serve
 * ordinary commands at the same time.
 */
export const REDIS = Symbol('DOCPILOT_REDIS');
