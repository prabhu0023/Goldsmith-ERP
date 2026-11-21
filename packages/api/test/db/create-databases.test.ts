import { randomBytes } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { createDatabases, databaseName } from '../../src/db/create-databases.js';
import { testDatabaseUrl } from '../../src/lane.js';
import { describeDb, testPool } from './db-test-helpers.js';

describeDb('db:create (parallel lanes)', () => {
  const names: string[] = [];
  const urlFor = (name: string) => {
    const u = new URL(testDatabaseUrl() ?? '');
    u.pathname = `/${name}`;
    return u.toString();
  };
  afterEach(async () => {
    const pool = testPool(1);
    try {
      for (const n of names.splice(0)) await pool.query(`drop database if exists "${n}" with (force)`);
    } finally {
      await pool.end();
    }
  });

  it('creates missing databases, then reports them as existing and changes nothing', async () => {
    const dev = `gs_tmp_${randomBytes(6).toString('hex')}`;
    const test = `${dev}_test`;
    names.push(dev, test);
    expect(await createDatabases([urlFor(dev), urlFor(test)])).toEqual([
      { name: dev, created: true },
      { name: test, created: true },
    ]);
    expect(await createDatabases([urlFor(dev), urlFor(test)])).toEqual([
      { name: dev, created: false },
      { name: test, created: false },
    ]);
  });

  it('leaves the existing test database alone', async () => {
    const url = testDatabaseUrl() ?? '';
    expect(await createDatabases([url])).toEqual([{ name: databaseName(url), created: false }]);
  });

  it('refuses a name it would have to quote', async () => {
    await expect(createDatabases([urlFor('Bad"Name')])).rejects.toThrow('must use only a-z, 0-9 and _');
  });
});
