/**
 * Response-boundary helpers for list endpoints (design/04 § 1, "Pagination").
 *
 * Every collection endpoint shares one envelope — `{ data, page }` — so clients
 * paginate the same way everywhere. Cursor pagination is the general case
 * (stable under inserts, backed by the `(…, created_at desc)` indexes in
 * design/01); small naturally-bounded collections (a household's members) return
 * the full set with `hasMore = false` and no cursor.
 *
 * Kept free of `server-only` and `next/*` imports so it is trivially
 * unit-testable and reusable by any route handler.
 */

/** Cursor-pagination metadata. `nextCursor` is null exactly when `hasMore` is false. */
export interface PageInfo {
  /** Opaque token for the next page, or null when there is no next page. */
  nextCursor: string | null;
  hasMore: boolean;
}

/** The shared list-response envelope (design/04 § 1). */
export interface Collection<T> {
  data: T[];
  page: PageInfo;
}

/**
 * Wrap a fully-materialized, naturally-bounded set (e.g. a household's members)
 * as a `Collection` with no further pages. Use this for collections small enough
 * to return whole; cursor-paginated endpoints build their own `page` instead.
 */
export function boundedCollection<T>(data: T[]): Collection<T> {
  return { data, page: { nextCursor: null, hasMore: false } };
}
