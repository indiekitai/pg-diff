import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { diff } from './index.js';

const URL_A = 'postgresql://postgres:postgres@localhost/pg_diff_test_a';
const URL_B = 'postgresql://postgres:postgres@localhost/pg_diff_test_b';

async function exec(url: string, sql: string) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query(sql);
  await client.end();
}

beforeAll(async () => {
  // Setup schema A (the "from" database)
  await exec(URL_A, `
    CREATE TYPE status_enum AS ENUM ('active', 'inactive');

    CREATE TABLE users (
      id serial PRIMARY KEY,
      name varchar(100) NOT NULL,
      email varchar(255) UNIQUE,
      status status_enum DEFAULT 'active',
      created_at timestamp DEFAULT now()
    );

    CREATE TABLE posts (
      id serial PRIMARY KEY,
      user_id integer REFERENCES users(id),
      title text NOT NULL,
      body text,
      published boolean DEFAULT false
    );

    CREATE INDEX idx_posts_user_id ON posts(user_id);
    CREATE INDEX idx_posts_published ON posts(published);

    CREATE VIEW active_users AS
      SELECT id, name, email FROM users WHERE status = 'active';

    CREATE FUNCTION get_user_count() RETURNS integer AS $$
      SELECT count(*)::integer FROM users;
    $$ LANGUAGE sql;

    CREATE SEQUENCE custom_seq;
  `);

  // Setup schema B (the "to" database) with differences
  await exec(URL_B, `
    CREATE TYPE status_enum AS ENUM ('active', 'inactive', 'suspended');

    CREATE TABLE users (
      id serial PRIMARY KEY,
      name varchar(200) NOT NULL,
      email varchar(255) UNIQUE,
      status status_enum DEFAULT 'active',
      created_at timestamp DEFAULT now(),
      updated_at timestamp
    );

    -- posts table dropped, comments table added
    CREATE TABLE comments (
      id serial PRIMARY KEY,
      user_id integer REFERENCES users(id),
      content text NOT NULL,
      created_at timestamp DEFAULT now()
    );

    CREATE INDEX idx_comments_user_id ON comments(user_id);

    CREATE VIEW active_users AS
      SELECT id, name FROM users WHERE status = 'active';

    CREATE FUNCTION get_user_count() RETURNS bigint AS $$
      SELECT count(*) FROM users;
    $$ LANGUAGE sql;

    CREATE FUNCTION greet(username text) RETURNS text AS $$
      SELECT 'Hello, ' || username;
    $$ LANGUAGE sql;

    CREATE SEQUENCE custom_seq;
    CREATE SEQUENCE another_seq;
  `);
});

afterAll(async () => {
  await exec(URL_A, 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await exec(URL_B, 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
});

describe('pg-diff', () => {
  it('should detect table additions and removals', async () => {
    const result = await diff(URL_A, URL_B);
    expect(result.statements.length).toBeGreaterThan(0);
    expect(result.sql).toBeTruthy();

    // posts table should be dropped
    expect(result.sql).toContain('DROP TABLE "public"."posts"');

    // comments table should be created
    expect(result.sql).toContain('CREATE TABLE "public"."comments"');
  });

  it('should detect column changes', async () => {
    const result = await diff(URL_A, URL_B);

    // name column type changed from varchar(100) to varchar(200)
    expect(result.sql).toMatch(/ALTER TABLE.*"users".*ALTER COLUMN.*"name".*TYPE.*character varying\(200\)/);

    // updated_at column added
    expect(result.sql).toMatch(/ALTER TABLE.*"users".*ADD COLUMN.*"updated_at"/);
  });

  it('should detect enum changes', async () => {
    const result = await diff(URL_A, URL_B);
    // Enum should be recreated with new value
    expect(result.sql).toContain('suspended');
  });

  it('should detect index changes', async () => {
    const result = await diff(URL_A, URL_B);
    // Old indexes dropped (posts table gone)
    expect(result.sql).toContain('DROP INDEX');
    // New index created
    expect(result.sql).toContain('idx_comments_user_id');
  });

  it('should detect function changes', async () => {
    const result = await diff(URL_A, URL_B);
    // get_user_count return type changed
    expect(result.sql).toContain('get_user_count');
    // greet function added
    expect(result.sql).toContain('greet');
  });

  it('should detect view changes', async () => {
    const result = await diff(URL_A, URL_B);
    // active_users view definition changed
    expect(result.sql).toContain('active_users');
  });

  it('should detect sequence changes', async () => {
    const result = await diff(URL_A, URL_B);
    // another_seq added
    expect(result.sql).toContain('another_seq');
  });

  it('should return empty result for identical schemas', async () => {
    const result = await diff(URL_A, URL_A);
    expect(result.statements).toHaveLength(0);
    expect(result.sql).toBe('');
  });

  it('should support JSON output', async () => {
    const result = await diff(URL_A, URL_B);
    expect(result.summary).toBeDefined();
    expect(result.summary.added.length).toBeGreaterThan(0);
    expect(result.summary.removed.length).toBeGreaterThan(0);
  });

  it('should support safe mode (no drops)', async () => {
    const result = await diff(URL_A, URL_B, { safe: true });
    for (const stmt of result.statements) {
      expect(stmt).not.toMatch(/\bdrop\b/i);
    }
  });
});
