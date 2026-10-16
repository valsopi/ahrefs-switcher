import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encrypt, decrypt} from '../src/services/encryption.js';
import {CookieManager, cookieId, setDetails} from '../src/services/cookie-manager.js';
import {SessionManager} from '../src/services/session-manager.js';
import {publicError} from '../src/utils/errors.js';

const cookie = (value = 'A', extra = {}) => ({domain: '.ahrefs.com', path: '/', name: 'mock-auth', value,
	secure: true, httpOnly: true, hostOnly: false, sameSite: 'lax', session: true, storeId: '0', ...extra});
class MemoryStorage {
	constructor() { this.records = new Map(); this.data = {accounts: [], scope: [cookieId(cookie())], reload: 'all', selector: '', active: null}; }
	async state() { return structuredClone(this.data); }
	async save(value) { this.data = structuredClone(value); }
	async get(id) { return structuredClone(this.records.get(id)); }
	async put(id, value) { this.records.set(id, structuredClone(value)); }
	async delete(id) { this.records.delete(id); }
}
function fixture() {
	const storage = new MemoryStorage();
	let jar = [cookie()]; let failure = null;
	const api = {
		async getAll() { return structuredClone(jar); },
		async remove(detail) {
			const url = new URL(detail.url);
			jar = jar.filter(c => !(c.name === detail.name && url.pathname === c.path &&
				(url.hostname === c.domain.replace(/^\./, '') || (!c.hostOnly && url.hostname.endsWith(`.${c.domain.replace(/^\./, '')}`))) &&
				JSON.stringify(c.partitionKey) === JSON.stringify(detail.partitionKey)));
			return detail;
		},
		async set(detail) {
			if (failure && failure(detail)) throw new Error('raw secret from API');
			const c = cookie(detail.value, {...detail, domain: detail.domain || new URL(detail.url).hostname, hostOnly: !detail.domain, session: detail.expirationDate === undefined});
			delete c.url; jar = jar.filter(item => cookieId(item) !== cookieId(c)); jar.push(c); return c;
		}
	};
	const cookies = new CookieManager(api);
	const browser = {async storeId() { return '0'; }, async reload() {}, async openLogin() {}, async checkSession() { return {status: 'unverified'}; }, async probe() { return {status: 'unverified'}; }};
	const manager = new SessionManager(storage, cookies, browser);
	return {storage, cookies, browser, manager, jar: () => jar, setJar: value => { jar = value; }, fail: value => { failure = value; }};
}
async function unlockedFixture() { const f = fixture(); await f.manager.unlocked(); return f; }
async function add(f, name = 'Personal', email = '') { await f.manager.dispatch('add', {name, email, confirmed: true}); return f.storage.data.accounts.at(-1).id; }

test('AES-GCM round trip, randomized IVs, and authenticated account binding', async () => {
	const key = await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
	const a = await encrypt(key, {secret: 'credential'}, 'one');
	const b = await encrypt(key, {secret: 'credential'}, 'one');
	assert.notDeepEqual(a.iv, b.iv);
	assert.deepEqual(await decrypt(key, a, 'one'), {secret: 'credential'});
	await assert.rejects(decrypt(key, a, 'two'));
});
test('damaged ciphertext fails closed without modifying browser cookies', async () => {
	const f = await unlockedFixture(); const id = await add(f);
	f.storage.records.get(id).data[0] ^= 1;
	await assert.rejects(f.manager.dispatch('switch', {id, confirmed: true}), {code: 'CORRUPT'});
	assert.equal(f.jar()[0].value, 'A');
});
test('adding requires login attestation or an actual identity probe, never cookies alone', async () => {
	const f = await unlockedFixture();
	await assert.rejects(f.manager.dispatch('add', {name: 'Personal'}), {code: 'LOGIN_REQUIRED'});
	const id = await add(f);
	assert.equal(f.storage.data.accounts[0].status, 'unverified');
	assert.equal(f.storage.data.accounts[0].name, 'Personal');
	assert.ok(f.storage.records.get(id).data);
	assert.ok(!JSON.stringify(f.storage.data).includes('"value"'));
});
test('empty selected cookie state cannot be saved', async () => {
	const f = await unlockedFixture(); f.setJar([]);
	await assert.rejects(add(f), {code: 'NO_SESSION'});
});
test('preserves host-only, domain, path, flags, expiration, store, and partition attributes', async () => {
	const f = fixture();
	const c = cookie('B', {domain: 'app.ahrefs.com', hostOnly: true, path: '/account', sameSite: 'strict', session: false,
		expirationDate: Math.floor(Date.now() / 1000) + 3600, partitionKey: {topLevelSite: 'https://ahrefs.com', hasCrossSiteAncestor: false}});
	assert.equal(setDetails(c).domain, undefined);
	assert.equal(setDetails(cookie()).domain, '.ahrefs.com');
	await f.cookies.replace([cookieId(c)], '0', [c]);
	assert.ok(f.cookies.equal(await f.cookies.capture([cookieId(c)], '0'), [c]));
	assert.deepEqual(f.jar().find(x => x.value === 'B').partitionKey, c.partitionKey);
});
test('switching two mock sessions restores cookies and remains Unverified without identity', async () => {
	const f = await unlockedFixture(); const a = await add(f);
	f.setJar([cookie('B')]); const b = await add(f, 'Company');
	await f.manager.dispatch('switch', {id: a, confirmed: true}); assert.equal(f.jar()[0].value, 'A');
	assert.equal(f.storage.data.accounts[0].lastActivation, null);
	await f.manager.dispatch('switch', {id: b, confirmed: true}); assert.equal(f.jar()[0].value, 'B');
	assert.equal(f.storage.data.active, null);
});
test('only a matching identity establishes activation; auto-save requires identity', async () => {
	const f = await unlockedFixture(); f.browser.probe = async () => ({status: 'verified', email: 'a@example.com'});
	const id = await add(f, 'Personal', 'a@example.com');
	f.setJar([cookie('renewed')]); await f.manager.dispatch('switch', {id, confirmed: true});
	assert.equal(f.storage.data.active, id);
	assert.ok(f.storage.data.accounts[0].lastActivation);
	assert.equal((await f.manager.read(id)).cookies[0].value, 'renewed');
});
test('mismatched identity rolls back without claiming authentication rollback', async () => {
	const f = await unlockedFixture(); const id = await add(f, 'A', 'a@example.com'); f.setJar([cookie('B')]);
	let calls = 0; f.browser.probe = async () => ++calls === 2 ? {status: 'verified', email: 'wrong@example.com'} : {status: 'unverified'};
	await assert.rejects(f.manager.dispatch('switch', {id, confirmed: true}), error => error.code === 'SWITCH_FAILED' && error.message.includes('Unverified'));
	assert.equal(f.jar()[0].value, 'B'); assert.equal(f.storage.data.active, null);
});
test('expired snapshot is rejected before any mutations', async () => {
	const f = await unlockedFixture(); const id = await add(f);
	const snapshot = await f.manager.read(id); snapshot.cookies[0].expirationDate = 1; snapshot.cookies[0].session = false;
	await f.manager.write(id, snapshot);
	await assert.rejects(f.manager.dispatch('switch', {id, confirmed: true}), {code: 'EXPIRED'});
	assert.equal(f.storage.data.accounts[0].status, 'expired'); assert.equal(f.jar()[0].value, 'A');
});
test('partial restoration failure restores prior cookies', async () => {
	const f = await unlockedFixture();
	const second = cookie('second-A', {name: 'mock-second'});
	f.storage.data.scope.push(cookieId(second)); f.setJar([cookie(), second]);
	const id = await add(f); f.setJar([cookie('B'), cookie('second-B', {name: 'mock-second'})]);
	// First cookie restores, second fails: rollback must undo the partial target.
	f.fail(detail => detail.value === 'second-A');
	await assert.rejects(f.manager.dispatch('switch', {id, confirmed: true}), {code: 'SWITCH_FAILED'});
	assert.deepEqual(f.jar().map(c => c.value).sort(), ['B', 'second-B']); assert.equal(await f.storage.get('journal'), undefined);
});
test('failed rollback retains encrypted journal and blocks subsequent mutations', async () => {
	const f = await unlockedFixture(); const id = await add(f); f.setJar([cookie('B')]); f.fail(() => true);
	await assert.rejects(f.manager.dispatch('switch', {id, confirmed: true}), {code: 'RECOVERY_FAILED'});
	assert.ok(await f.storage.get('journal'));
	await assert.rejects(f.manager.dispatch('delete', {id}), {code: 'RECOVERY_REQUIRED'});
	f.fail(null); await f.manager.dispatch('recover'); assert.equal(f.jar()[0].value, 'B');
});
test('concurrent operations are rejected', async () => {
	const f = await unlockedFixture();
	let release; f.browser.probe = () => new Promise(resolve => { release = resolve; });
	const first = add(f); await new Promise(resolve => setTimeout(resolve, 0));
	await assert.rejects(f.manager.dispatch('add', {name: 'Other', confirmed: true}), {code: 'BUSY'});
	release({status: 'unverified'}); await first;
});
test('service-worker restart reloads local key and permits explicit recovery', async () => {
	const f = await unlockedFixture();
	await f.manager.write('journal', {cookies: [cookie('previous')], scope: f.storage.data.scope, storeId: '0', identity: null});
	f.setJar([cookie('partial')]);
	const restarted = new SessionManager(f.storage, f.cookies, f.browser);
	assert.equal((await restarted.dispatch('status')).locked, false);
	await restarted.dispatch('recover');
	assert.equal(f.jar()[0].value, 'previous'); assert.equal(await f.storage.get('journal'), undefined);
});
test('deleting removes account metadata and encrypted snapshot', async () => {
	const f = await unlockedFixture(); const id = await add(f); await f.manager.dispatch('delete', {id});
	assert.equal(f.storage.data.accounts.length, 0); assert.equal(await f.storage.get(id), undefined);
});
test('unmanaged cookies survive switching and unsafe scope is rejected', async () => {
	const f = await unlockedFixture(); const id = await add(f);
	f.setJar([cookie('B'), cookie('analytics', {name: '_analytics'}), cookie('unrelated', {domain: '.example.com'})]);
	await f.manager.dispatch('switch', {id, confirmed: true});
	assert.ok(f.jar().some(c => c.value === 'analytics')); assert.ok(f.jar().some(c => c.value === 'unrelated'));
	assert.throws(() => setDetails(cookie('C', {domain: 'evil-ahrefs.com'})), {code: 'COOKIE_SCOPE'});
});
test('ambiguous cookie removal stops before deleting an unselected cookie', async () => {
	const f = fixture(); const c = cookie('managed', {domain: 'app.ahrefs.com', hostOnly: true});
	f.setJar([c, cookie('unselected')]);
	await assert.rejects(f.cookies.replace([cookieId(c)], '0', []), {code: 'AMBIGUOUS_COOKIE'});
	assert.equal(f.jar().length, 2);
});
test('wrong cookie store and changed scope are rejected', async () => {
	const f = await unlockedFixture(); const id = await add(f);
	f.storage.data.scope = [];
	await assert.rejects(f.manager.dispatch('switch', {id, confirmed: true}), {code: 'SCOPE_CHANGED'});
	await assert.rejects(f.cookies.replace([cookieId(cookie())], '1', [cookie()]), {code: 'COOKIE_SCOPE'});
});
test('public errors do not expose raw API messages', () => {
	assert.ok(!publicError(new Error('secret cookie credential')).message.includes('credential'));
});
test('current account highlight follows live cookie matches after saving and switching', async () => {
	const f = await unlockedFixture(); const a = await add(f, 'Personal');
	assert.equal((await f.manager.dispatch('status')).active, a);
	f.setJar([cookie('B')]); const b = await add(f, 'Company');
	assert.equal((await f.manager.dispatch('status')).active, b);
	await f.manager.dispatch('switch', {id: a, confirmed: true});
	assert.equal((await f.manager.dispatch('status')).active, a);
	const restarted = new SessionManager(f.storage, f.cookies, f.browser);
	assert.equal((await restarted.dispatch('status')).active, a);
});
test('unknown, absent, duplicate and errored sessions are not highlighted', async () => {
	const f = await unlockedFixture(); await add(f, 'Personal');
	f.setJar([cookie('different-login')]); assert.equal((await f.manager.dispatch('status')).active, null);
	f.setJar([]); assert.equal((await f.manager.dispatch('status')).active, null);
	f.setJar([cookie()]); f.storage.data.accounts[0].status = 'error';
	assert.equal((await f.manager.dispatch('status')).active, null);
	f.storage.data.accounts[0].status = 'unverified'; await add(f, 'Duplicate');
	assert.equal((await f.manager.dispatch('status')).active, null);
});
test('prepare another login preserves saved snapshot and clears only managed local cookies', async () => {
	const f = await unlockedFixture(); const id = await add(f, 'Personal');
	f.setJar([cookie(), cookie('tracking', {name: '_ga', httpOnly: false})]);
	let loginOpened = false; f.browser.openLogin = async () => { loginOpened = true; };
	await f.manager.dispatch('prepare-login');
	assert.ok(loginOpened);
	assert.deepEqual(f.jar().map(c => c.value), ['tracking']);
	assert.equal((await f.manager.read(id)).cookies[0].value, 'A');
	assert.equal(await f.storage.get('journal'), undefined);
});
test('prepare login refuses to clear a changed unsaved session', async () => {
	const f = await unlockedFixture(); await add(f); f.setJar([cookie('unsaved')]);
	await assert.rejects(f.manager.dispatch('prepare-login'), {code: 'SAVE_FIRST'});
	assert.equal(f.jar()[0].value, 'unsaved');
});
test('opening another login failure restores previous session', async () => {
	const f = await unlockedFixture(); await add(f);
	f.browser.openLogin = async () => { throw new Error('blocked'); };
	await assert.rejects(f.manager.dispatch('prepare-login'), {code: 'PREPARE_FAILED'});
	assert.equal(f.jar()[0].value, 'A');
});
test('a login redirect rejects the saved session and restores the previous cookies', async () => {
	const f = await unlockedFixture(); const id = await add(f, 'Personal');
	f.setJar([cookie('working-company')]);
	f.browser.checkSession = async () => ({status: 'signed-out'});
	await assert.rejects(f.manager.dispatch('switch', {id, confirmed: true}), error =>
		error.code === 'SWITCH_FAILED' && error.message.includes('saved session was not accepted'));
	assert.equal(f.jar()[0].value, 'working-company');
	assert.equal(f.storage.data.accounts[0].status, 'error');
	assert.equal(f.storage.data.accounts[0].lastActivation, null);
	assert.equal(await f.storage.get('journal'), undefined);
});
test('saving a mismatched verified identity is rejected', async () => {
	const f = await unlockedFixture(); f.browser.probe = async () => ({status: 'verified', email: 'other@example.com'});
	await assert.rejects(add(f, 'Personal', 'a@example.com'), {code: 'IDENTITY'});
	assert.equal(f.storage.data.accounts.length, 0);
});
test('saving and switching need no unlock after inactivity or worker restart', async () => {
	const f = await unlockedFixture(); const id = await add(f);
	f.manager.lastUsed = Date.now() - 600001;
	assert.equal((await f.manager.dispatch('status')).locked, false);
	f.setJar([cookie('B')]);
	const restarted = new SessionManager(f.storage, f.cookies, f.browser);
	await restarted.dispatch('switch', {id, confirmed: true});
	assert.equal(f.jar()[0].value, 'A');
});
test('first save discovers session candidates without manual settings', async () => {
	const f = fixture(); f.storage.data.scope = [];
	f.setJar([cookie(), cookie('tracking', {name: '_ga', httpOnly: false}), cookie('clearance', {name: 'cf_clearance'})]);
	const id = await add(f);
	assert.deepEqual(f.storage.data.scope, [cookieId(cookie())]);
	assert.equal((await f.manager.read(id)).cookies.length, 1);
});
test('new cookie identities do not invalidate previously saved accounts', async () => {
	const f = fixture(); f.storage.data.scope = []; const a = await add(f);
	f.setJar([cookie('B'), cookie('secondary', {name: 'auth-secondary'})]); await add(f, 'Company');
	await f.manager.dispatch('switch', {id: a, confirmed: true});
	assert.deepEqual(f.jar().map(c => c.value), ['A']);
});
