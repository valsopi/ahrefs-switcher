import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Browser} from '../src/services/browser.js';
const accountTab = {id: 99, active: true, status: 'complete', url: 'https://app.ahrefs.com/account/my-account'};

test('identity probe reads an existing account tab without creating or closing tabs', async () => {
	globalThis.chrome = {
		tabs: {async query() { return [accountTab]; }},
		scripting: {async executeScript(options) {
			assert.equal(options.target.tabId, 99);
			globalThis.document = {querySelectorAll(selector) {
				assert.equal(selector, '.identity');
				return [{closest: () => null, matches: () => false, textContent: ' Personal@Example.com '}];
			}};
			return [{result: options.func(...options.args)}];
		}}
	};
	assert.deepEqual(await new Browser().probe('.identity'), {status: 'verified', email: 'personal@example.com'});
});
test('identity probe never navigates or creates tabs if no account page is open', async () => {
	globalThis.chrome = {tabs: {async query() { return [{...accountTab, url: 'https://app.ahrefs.com/dashboard'}]; }}};
	assert.deepEqual(await new Browser().probe('.identity'), {status: 'unverified'});
});
test('without a selector no browser tab is inspected', async () => {
	globalThis.chrome = {};
	assert.deepEqual(await new Browser().probe(''), {status: 'unverified'});
});
test('login rejection check stays on the existing active tab', async () => {
	const existing = {...accountTab, url: 'https://app.ahrefs.com/user/login'};
	globalThis.chrome = {tabs: {
		async query() { return [existing]; },
		async get(id) { assert.equal(id, existing.id); return existing; }
	}};
	assert.deepEqual(await new Browser(async () => {}).checkSession(), {status: 'signed-out'});
});
test('dashboard on an existing tab is Unverified and never opens another tab', async () => {
	const existing = {...accountTab, url: 'https://app.ahrefs.com/dashboard'};
	globalThis.chrome = {tabs: {async query() { return [existing]; }, async get() { return existing; }}};
	assert.deepEqual(await new Browser(async () => {}).checkSession(), {status: 'unverified'});
});
test('reload uses existing tabs and preserves existing tool URLs', async () => {
	const updates = [], reloads = [];
	globalThis.chrome = {tabs: {
		async query() { return [{id: 1, url: 'https://app.ahrefs.com/user/login'}, {id: 2, url: 'https://app.ahrefs.com/site-explorer'}]; },
		async update(id, options) { updates.push([id, options.url]); },
		async reload(id) { reloads.push(id); }
	}};
	await new Browser().reload('all');
	assert.deepEqual(updates, [[1, 'https://app.ahrefs.com/dashboard']]);
	assert.deepEqual(reloads, [2]);
});
test('opening a login reuses the current Ahrefs tab', async () => {
	let updated;
	globalThis.chrome = {tabs: {
		async query() { return [accountTab]; },
		async update(id, options) { updated = [id, options.url]; }
	}};
	await new Browser().openLogin();
	assert.deepEqual(updated, [99, 'https://app.ahrefs.com/user/login']);
});
