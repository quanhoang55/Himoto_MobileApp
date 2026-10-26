const assert = require('node:assert/strict');
const path = require('node:path');
const { load } = require('./lib/load-typescript.cjs');

const { parseMobileCustomerCreate, createMobileCustomer, MobileCustomerCreateError } =
  load(path.resolve(__dirname, '../src/lib/server/mobile/mobile-customer-create'));

async function run() {
  const input = parseMobileCustomerCreate({ name: ' Khách QA ', phone: '0900000011', address: ' Địa chỉ QA ', idCard: '001 234 567 890', storeId: 7 });
  assert.deepEqual(input, { name: 'Khách QA', phone: '0900000011', address: 'Địa chỉ QA', idCard: '001234567890', storeId: 7 });
  for (const changes of [{ name: '' }, { phone: 'abc' }, { address: '' }, { idCard: '123' }, { storeId: 0 }, { storeId: '7' }, { extra: 'ignored' }]) {
    assert.throws(() => parseMobileCustomerCreate({ ...input, ...changes }), error => error instanceof MobileCustomerCreateError && error.status === 400);
  }

  const statements = [];
  let releases = 0;
  const client = { query: async (sql, params) => {
    statements.push({ sql, params });
    if (sql.includes('store_directory()')) return { rowCount: 1, rows: [{ id: input.storeId }] };
    if (sql.includes('find_customer_duplicate')) return { rowCount: 0, rows: [] };
    if (sql.includes('INSERT INTO himoto.customers')) return { rowCount: 1, rows: [{ id: 42, name: input.name }] };
    return { rowCount: 0, rows: [] };
  }, release: () => { releases++; } };
  assert.deepEqual(await createMobileCustomer(input, async () => client), { id: 42, name: input.name });
  assert.deepEqual(statements.map(row => row.sql.split(/\s+/)[0]), ['BEGIN', 'SET', 'SELECT', 'LOCK', 'SELECT', 'SELECT', 'INSERT', 'COMMIT']);
  assert.deepEqual(statements.find(row => row.sql.includes('find_customer_duplicate')).params, [input.idCard, input.phone]);
  assert.equal(releases, 1);

  const duplicateStatements = [];
  const duplicateClient = { query: async sql => {
    duplicateStatements.push(sql);
    if (sql.includes('store_directory()')) return { rowCount: 1, rows: [{ id: input.storeId }] };
    return sql.includes('find_customer_duplicate') ? { rowCount: 1, rows: [{ id: 9 }] } : { rowCount: 0, rows: [] };
  }, release: () => { releases++; } };
  await assert.rejects(createMobileCustomer(input, async () => duplicateClient), error => error instanceof MobileCustomerCreateError && error.status === 409);
  assert(duplicateStatements.includes('ROLLBACK'));
  assert(!duplicateStatements.some(sql => sql.includes('INSERT INTO himoto.customers')));
  assert.equal(releases, 2);

  const missingStoreStatements = [];
  await assert.rejects(createMobileCustomer(input, async () => ({ query: async sql => {
    missingStoreStatements.push(sql);
    return { rowCount: 0, rows: [] };
  }, release: () => { releases++; } })), error => error instanceof MobileCustomerCreateError && error.status === 400);
  assert(missingStoreStatements.includes('ROLLBACK'));
  assert(!missingStoreStatements.some(sql => sql.includes('INSERT INTO himoto.customers')));
  assert.equal(releases, 3);
  console.log('Mobile customer create: input validation, duplicate protection, transaction cleanup passed.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
