import { DatabaseSync } from 'node:sqlite';

class Statement {
  constructor(database, sql, args = []) {
    this.database = database;
    this.sql = sql;
    this.args = args;
  }

  bind(...args) {
    return new Statement(this.database, this.sql, args.map((value) => (
      value === undefined ? null : typeof value === 'boolean' ? Number(value) : value
    )));
  }

  execute() {
    const statement = this.database.prepare(this.sql);
    if (/^\s*(SELECT|WITH)\b/i.test(this.sql) || /\bRETURNING\b/i.test(this.sql)) {
      return { rows: statement.all(...this.args), changes: 0 };
    }
    const result = statement.run(...this.args);
    return { rows: [], changes: Number(result.changes) };
  }

  async first() {
    return this.execute().rows[0] ?? null;
  }

  async all() {
    return { results: this.execute().rows };
  }

  async run() {
    const result = this.execute();
    return { results: result.rows, meta: { changes: result.changes } };
  }
}

export function makeD1() {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  return {
    prepare: (sql) => new Statement(database, sql),
    async batch(statements) {
      database.exec('BEGIN');
      try {
        const results = statements.map((statement) => {
          const result = statement.execute();
          return { results: result.rows, meta: { changes: result.changes } };
        });
        database.exec('COMMIT');
        return results;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
    async exec(sql) {
      database.exec(sql);
      return { count: 1 };
    },
  };
}
