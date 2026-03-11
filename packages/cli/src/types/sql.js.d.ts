declare module 'sql.js' {
  export interface BindParams {
    [key: string]: unknown;
  }
  export interface QueryExecResult {
    columns: string[];
    values: unknown[][];
  }
  export class Statement {
    bind(values?: unknown[] | BindParams): boolean;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): boolean;
  }
  export class Database {
    constructor(data?: ArrayLike<number> | Buffer);
    run(sql: string, params?: unknown[]): void;
    exec(sql: string): QueryExecResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }
  export default function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<{
    Database: typeof Database;
    Statement: typeof Statement;
  }>;
}
