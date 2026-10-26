const assert = require('node:assert/strict');
const path = require('node:path');
const { load } = require('./lib/load-typescript.cjs');

const lists = load(path.resolve(__dirname, '../src/lib/server/mobile/mobile-lists'));

async function run() {
  assert.throws(() => lists.mobileListParams('contracts', new URLSearchParams('all=1')), lists.MobileListError);
  assert.throws(() => lists.mobileListParams('customers', new URLSearchParams('scope=overdue')), lists.MobileListError);
  assert.equal(lists.mobileListParams('contracts', new URLSearchParams()).get('size'), '20');
  assert.equal(lists.mobileListParams('contracts', new URLSearchParams()).get('direction'), 'desc');
  assert.equal(lists.mobileListParams('contracts', new URLSearchParams('filter_id=14')).get('filter_id'), '14');
  assert.throws(() => lists.mobileListParams('customers', new URLSearchParams('filter_id=14')), lists.MobileListError);
  assert.equal(lists.mobileRecordId('14'), 14);
  for (const id of ['0', '-1', '1x', '9007199254740992']) assert.throws(() => lists.mobileRecordId(id), lists.MobileListError);

  const sensitive = { id: 14, code: 'HD-14', name: 'HD-14', status: 'renting', store_id: 2,
    customer_name: 'QA Customer', customer_phone: '0123456789', total_amount: 1000000,
    draft_json: '{"private":true}', customer_id_card: 'private', password_hash: 'private' };
  const projected = lists.mobileListItem('contracts', sensitive);
  assert.equal(projected.customerName, 'QA Customer');
  assert.equal(projected.totalAmount, 1000000);
  for (const field of ['draft_json', 'customer_id_card', 'password_hash']) assert.equal(field in projected, false);

  const statements = [];
  let released = 0;
  const client = { query: async sql => { statements.push(sql); return { rows: [] }; }, release: () => { released++; } };
  const connect = async () => client;
  const reader = async (_db, kind, params) => {
    assert.equal(kind, 'contracts');
    assert.equal(params.get('page'), '2');
    assert.equal(params.get('size'), '20');
    return { rows: [sensitive], page: 2, pages: 4, total: 61 };
  };
  const page = await lists.readMobileList('contracts', new URLSearchParams('page=2'), connect, reader);
  assert.deepEqual([page.page, page.total, page.hasMore], [2, 61, true]);
  assert.equal(page.items.length, 1);
  assert.deepEqual(statements, ['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY', "SET LOCAL statement_timeout='20s'", 'COMMIT']);
  assert.equal(released, 1);

  statements.length = 0;
  await assert.rejects(lists.readMobileList('contracts', new URLSearchParams(), connect, async () => { throw new Error('Query failed'); }), /Query failed/);
  assert.equal(statements.at(-1), 'ROLLBACK');
  assert.equal(released, 2);
  const fleetQueries = [];
  const fleetClient = { query: async (sql, values) => {
    fleetQueries.push({ sql, values });
    if (sql.includes('count(*)::int AS total FROM himoto.vehicle_inventory()')) return { rows: [{ total: 2 }] };
    if (sql.includes('SELECT id,name,license,status,store_id,store_name,available')) return { rows: [{ id: 4, name: 'QA Vehicle', license: 'QA-001', status: 'ready', store_id: 7, store_name: 'QA Store', available: true }] };
    return { rows: [] };
  }, release: () => {} };
  const fleet = await lists.readMobileList('vehicles', new URLSearchParams('page=1&size=1&search=QA'), async () => fleetClient);
  assert.equal(fleet.hasMore, true);
  assert.equal(fleet.items[0].license, 'QA-001');
  assert(fleetQueries.some(query => query.sql.includes('FROM himoto.vehicle_inventory()')));
  assert(!fleetQueries.some(query => query.sql.includes('FROM himoto.vehicles v')));
  await assert.rejects(lists.readMobileList('vehicles', new URLSearchParams('sort=license;DROP'), async () => fleetClient), lists.MobileListError);
  console.log('Mobile reads: bounded params, DTO allowlist, pagination and transaction cleanup passed.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
