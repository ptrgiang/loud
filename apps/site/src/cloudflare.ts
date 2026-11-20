// The few Workers runtime types the site uses, so it needs no @cloudflare/workers-types.
export interface D1Result<T> {
  readonly results: ReadonlyArray<T>;
}

export interface D1PreparedStatement {
  bind(...values: ReadonlyArray<string | number | null>): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch<T>(statements: ReadonlyArray<D1PreparedStatement>): Promise<ReadonlyArray<D1Result<T>>>;
}

export interface Env {
  readonly DB: D1Database;
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

declare global {
  interface CacheStorage {
    readonly default: Cache;
  }
}
