// Defect 4 harness — DATABASE_URL normalisation for pooled Neon hosts.
// Pure unit tests of utils/connection.js (no stubs needed). The URL
// values below are synthetic examples, never real credentials.
const { test } = require('node:test');
const assert = require('node:assert');
const { normalizeDatabaseUrl } = require('../src/utils/connection');

test('pooled host without params gains pgbouncer + pool limits', () => {
  const out = normalizeDatabaseUrl('postgresql://user:pass@ep-example-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require');
  const url = new URL(out);
  assert.strictEqual(url.searchParams.get('pgbouncer'), 'true');
  assert.strictEqual(url.searchParams.get('connection_limit'), '5');
  assert.strictEqual(url.searchParams.get('pool_timeout'), '30');
  assert.strictEqual(url.searchParams.get('sslmode'), 'require'); // untouched
  assert.strictEqual(url.hostname, 'ep-example-pooler.eu-central-1.aws.neon.tech');
});

test('pooled host that already sets pgbouncer is returned unchanged', () => {
  const input = 'postgresql://user:pass@ep-example-pooler.aws.neon.tech/neondb?pgbouncer=true&sslmode=require';
  assert.strictEqual(normalizeDatabaseUrl(input), input);
});

test('direct (non-pooler) host is returned unchanged', () => {
  const input = 'postgresql://user:pass@ep-example.eu-central-1.aws.neon.tech/neondb?sslmode=require';
  assert.strictEqual(normalizeDatabaseUrl(input), input);
});

test('existing connection_limit / pool_timeout are respected, not overwritten', () => {
  const out = normalizeDatabaseUrl('postgresql://user:pass@ep-x-pooler.aws.neon.tech/db?connection_limit=9');
  const url = new URL(out);
  assert.strictEqual(url.searchParams.get('pgbouncer'), 'true');
  assert.strictEqual(url.searchParams.get('connection_limit'), '9');
  assert.strictEqual(url.searchParams.get('pool_timeout'), '30');
});

test('missing / non-string / unparseable values pass through untouched', () => {
  assert.strictEqual(normalizeDatabaseUrl(undefined), undefined);
  assert.strictEqual(normalizeDatabaseUrl(''), '');
  assert.strictEqual(normalizeDatabaseUrl('not a url'), 'not a url');
});
