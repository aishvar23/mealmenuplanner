/**
 * A small chainable stub of the supabase-js query builder + `rpc`, used by the
 * recommendation loader tests. Not a test file (no `vitest` import, no `.test`
 * suffix) and not imported by `app/`, so it never reaches a suite or the bundle.
 *
 * Modeled on `lib/services/admin/supabase-stub.ts`, extended with the chain
 * methods the recommendation loaders use (`not`/`gte`/`lt`/`in`/`contains`) and a
 * client-level `rpc`. Chain methods return the builder; `single`/`maybeSingle`
 * and awaiting the chain both resolve the configured result for that table; `rpc`
 * resolves the configured result for that function name.
 */

export interface QueryResult {
  data: unknown;
  error: unknown;
}

export interface StubPlan {
  tables?: Record<string, QueryResult>;
  rpcs?: Record<string, QueryResult>;
}

export interface RecordedCall {
  target: string;
  method: string;
  args: unknown[];
}

export interface SupabaseStub {
  /** Pass as the `createServerSupabaseClient()` resolved value. */
  client: {
    from: (table: string) => unknown;
    rpc: (name: string, args?: unknown) => Promise<QueryResult>;
  };
  calls: RecordedCall[];
}

const CHAIN_METHODS = [
  "select",
  "insert",
  "update",
  "eq",
  "neq",
  "not",
  "gte",
  "lt",
  "lte",
  "gt",
  "in",
  "contains",
  "or",
  "order",
  "limit",
] as const;

const EMPTY: QueryResult = { data: null, error: null };

export function createSupabaseStub(plan: StubPlan = {}): SupabaseStub {
  const calls: RecordedCall[] = [];
  const tables = plan.tables ?? {};
  const rpcs = plan.rpcs ?? {};

  function makeBuilder(table: string): Record<string, unknown> {
    const result = tables[table] ?? EMPTY;
    const record = (method: string, args: unknown[]): void => {
      calls.push({ target: table, method, args });
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
      return Promise.resolve(result);
    };
    builder.maybeSingle = (...args: unknown[]) => {
      record("maybeSingle", args);
      return Promise.resolve(result);
    };
    // List queries end by awaiting the chain (no terminal): make it thenable.
    builder.then = (
      onFulfilled?: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected);

    return builder;
  }

  return {
    client: {
      from: (table: string) => {
        calls.push({ target: table, method: "from", args: [] });
        return makeBuilder(table);
      },
      rpc: (name: string, args?: unknown) => {
        calls.push({
          target: name,
          method: "rpc",
          args: args === undefined ? [] : [args],
        });
        return Promise.resolve(rpcs[name] ?? EMPTY);
      },
    },
    calls,
  };
}
