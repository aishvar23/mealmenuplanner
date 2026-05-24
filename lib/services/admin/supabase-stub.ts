/**
 * A tiny, framework-agnostic stub of the supabase-js query builder, used by the
 * admin service tests. Not a test file (no `vitest` import, no `.test` suffix),
 * so it is never collected as a suite and never reaches the app bundle (nothing
 * in `app/` imports it).
 *
 * The real builder is chainable and resolves either via a terminal
 * (`single`/`maybeSingle`) or by awaiting the chain directly (a `PromiseLike`).
 * This stub supports both: chain methods return the builder; `single`/
 * `maybeSingle` and `await`ing the chain both resolve the next configured result
 * for that table. Configure per-table results as a single value (reused) or a
 * queue (consumed in call order — needed when one table is queried twice, e.g.
 * the dish row then the paired-dish names).
 */

export interface QueryResult {
  data: unknown;
  error: unknown;
}

export type QueryPlan = Record<string, QueryResult | QueryResult[]>;

export interface RecordedCall {
  table: string;
  method: string;
  args: unknown[];
}

export interface SupabaseStub {
  /** Pass as the `createServiceRoleClient()` return value. */
  client: { from: (table: string) => unknown };
  /** Every recorded `from`/builder method call, in order. */
  calls: RecordedCall[];
}

const CHAIN_METHODS = [
  "select",
  "insert",
  "update",
  "delete",
  "upsert",
  "eq",
  "neq",
  "ilike",
  "contains",
  "or",
  "in",
  "order",
  "limit",
] as const;

export function createSupabaseStub(plan: QueryPlan = {}): SupabaseStub {
  const calls: RecordedCall[] = [];
  const queues: Record<string, QueryResult[]> = {};
  for (const [table, value] of Object.entries(plan)) {
    queues[table] = Array.isArray(value) ? [...value] : [value];
  }

  function nextResult(table: string): QueryResult {
    const queue = queues[table];
    if (!queue || queue.length === 0) return { data: null, error: null };
    // One configured value → reuse it; a queue of many → consume in order.
    return (queue.length === 1 ? queue[0] : queue.shift()) as QueryResult;
  }

  function makeBuilder(table: string): Record<string, unknown> {
    const record = (method: string, args: unknown[]): void => {
      calls.push({ table, method, args });
    };
    const builder: Record<string, unknown> = {};

    for (const method of CHAIN_METHODS) {
      builder[method] = (...args: unknown[]) => {
        record(method, args);
        return builder;
      };
    }
    builder.single = (...args: unknown[]) => {
      record("single", args);
      return Promise.resolve(nextResult(table));
    };
    builder.maybeSingle = (...args: unknown[]) => {
      record("maybeSingle", args);
      return Promise.resolve(nextResult(table));
    };
    // Make the chain itself awaitable (list queries end at `.limit()`/`.in()`).
    builder.then = (
      onFulfilled?: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(nextResult(table)).then(onFulfilled, onRejected);

    return builder;
  }

  return {
    client: {
      from: (table: string) => {
        calls.push({ table, method: "from", args: [] });
        return makeBuilder(table);
      },
    },
    calls,
  };
}
