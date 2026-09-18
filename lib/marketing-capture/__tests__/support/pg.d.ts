/**
 * The little of `pg` the owner-SQL tests use, so they typecheck without adding
 * @types/pg as a dependency for one optional test backend.
 */
declare module 'pg' {
  export class Client {
    constructor(config: { connectionString?: string; host?: string; port?: number; user?: string; database?: string });
    connect(): Promise<void>;
    query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; fields?: { name: string }[] }>;
    end(): Promise<void>;
  }
}
