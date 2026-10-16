import {AppError, requireThat} from '../utils/errors.js';
import {encrypt, decrypt} from './encryption.js';
import {cookieId, setDetails} from './cookie-manager.js';
export class SessionManager {
	constructor(storage, cookies, browser) {
		this.storage = storage; this.cookies = cookies; this.browser = browser;
		this.key = null; this.busy = false;
	}
	async exclusive(action) {
		requireThat(!this.busy, 'BUSY', 'Another session operation is running.');
		this.busy = true;
		try { return await action(); } finally { this.busy = false; }
	}
	async unlocked() {
		if (this.key) return;
		this.key = await this.storage.get('device-key');
		if (!this.key) {
			const key = await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
			await this.storage.put('device-key', key);
			this.key = key;
		}
	}
	async read(id) {
		try { return await decrypt(this.key, await this.storage.get(id), id); }
		catch { throw new AppError('CORRUPT', 'This saved session is unavailable. Sign in to that account in an Ahrefs tab and update its saved session. Older passphrase-protected snapshots must be saved again.'); }
	}
	async write(id, data) { await this.storage.put(id, await encrypt(this.key, data, id)); }
	async status() {
		const state = await this.storage.state();
		const recovery = !!await this.storage.get('journal');
		let active = null;
		// Match the live cookie state rather than trusting a historical switch or account label.
		// This associates a saved session; it is not a claim of verified server authentication.
		if (!this.busy && !recovery && state.accounts.length) {
			try {
				await this.exclusive(async () => {
					await this.unlocked();
					const storeId = await this.browser.storeId();
					const current = await this.cookies.capture(state.scope, storeId);
					if (!current.length) return;
					const matches = [];
					for (const account of state.accounts) {
						if (account.status === 'error' || account.status === 'expired') continue;
						try {
							const snapshot = await this.read(account.id);
							if (snapshot.storeId === storeId && this.cookies.equal(current, snapshot.cookies)) matches.push(account.id);
						} catch { /* An inaccessible saved session cannot establish a current match. */ }
					}
					if (matches.length === 1) active = matches[0];
				});
			} catch { /* No tab, permission, or match means no account is highlighted. */ }
		}
		return {...state, active, locked: false, recovery};
	}
	async capture(state, account, confirmed) {
		const identity = await this.browser.probe(state.selector);
		if (identity.status === 'verified' && account.email) requireThat(identity.email === account.email, 'IDENTITY', 'The authenticated identity differs from this account. Nothing was saved.');
		requireThat(identity.status === 'verified' || confirmed === true, 'LOGIN_REQUIRED', 'Log in manually and confirm the current account before saving an unverified snapshot.');
		const storeId = await this.browser.storeId();
		const candidates = (await this.cookies.all(storeId)).filter(c => c.secure &&
			['ahrefs.com', 'app.ahrefs.com'].includes(c.domain.replace(/^\./, '')) &&
			(c.httpOnly || /(?:auth|session|sessid|token|logged.?in)/i.test(c.name)) &&
			! /^(?:_ga|_gid|_gat|_fbp|_gcl|__cf|cf_|intercom|hubspot|__hs|consent|cookieconsent)/i.test(c.name));
		state.scope = [...new Set([...state.scope, ...candidates.map(cookieId)])].sort();
		const cookies = await this.cookies.capture(state.scope, storeId);
		requireThat(cookies.length, 'NO_SESSION', 'No supported session cookies were found. Sign in to Ahrefs in a browser tab, then try Add Current Account again.');
		for (const c of cookies) setDetails(c);
		return {cookies, storeId, scope: state.scope, identity: identity.email || null, saved: Date.now()};
	}
	async add({name, email = '', confirmed}) {
		await this.unlocked();
		const state = await this.storage.state();
		requireThat(name?.trim() && name.length <= 80, 'NAME', 'Enter an account name (up to 80 characters).');
		requireThat(!email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'EMAIL', 'Enter a valid email or leave it empty.');
		const account = {id: crypto.randomUUID(), name: name.trim(), email: email.trim().toLowerCase(), created: Date.now(), lastActivation: null, status: 'unverified'};
		const snapshot = await this.capture(state, account, confirmed);
		await this.write(account.id, snapshot);
		state.accounts.push(account); await this.storage.save(state);
		return {message: 'Session saved locally. Verify it with a switch test before relying on it.'};
	}
	async update({id, confirmed}) {
		await this.unlocked(); const state = await this.storage.state();
		const account = this.account(state, id);
		const snapshot = await this.capture(state, account, confirmed);
		await this.write(id, snapshot); account.status = 'unverified'; await this.storage.save(state);
		return {message: 'Saved session updated.'};
	}
	account(state, id) { const account = state.accounts.find(a => a.id === id); requireThat(account, 'ACCOUNT', 'Account not found.'); return account; }
	async switch({id, confirmed}) {
		await this.unlocked();
		requireThat(confirmed === true, 'CONFIRM', 'Confirm the warning about shared sessions and unsaved work.');
		const state = await this.storage.state(); const account = this.account(state, id);
		const target = await this.read(id); const storeId = await this.browser.storeId();
		requireThat(target.storeId === storeId && target.scope.every(id => state.scope.includes(id)), 'SCOPE_CHANGED', 'Cookie scope changed. Log in manually and update this snapshot first.');
		if (target.cookies.some(c => c.expirationDate && c.expirationDate <= Date.now() / 1000)) {
			account.status = 'expired'; await this.storage.save(state);
			throw new AppError('EXPIRED', 'A saved cookie expired. Log in manually and update this session.');
		}
		const identity = await this.browser.probe(state.selector);
		const previous = state.accounts.find(a => a.email && a.email === identity.email);
		const rollback = {cookies: await this.cookies.capture(state.scope, storeId), scope: state.scope, storeId, identity: identity.email || null};
		if (previous && identity.status === 'verified') await this.write(previous.id, {...rollback, saved: Date.now()});
		await this.write('journal', rollback); // Durable, encrypted write BEFORE any cookie mutation.
		state.active = null; await this.storage.save(state);
		try {
			await this.cookies.replace(state.scope, storeId, target.cookies);
			await this.browser.reload('all');
			const session = await this.browser.checkSession();
			requireThat(session.status !== 'signed-out', 'SESSION_REJECTED', 'Ahrefs returned to its login page. This saved session was not accepted. Sign in to that account manually and use Manage → Update from current Ahrefs login. Logging out may invalidate a saved session; missing authentication state can also cause this.');
			const result = await this.browser.probe(state.selector);
			if (result.status === 'verified') {
				const expected = target.identity || account.email;
				requireThat(expected && result.email === expected, 'IDENTITY', 'The resulting account identity did not match.');
				account.lastActivation = Date.now(); account.status = 'verified'; state.active = id;
			} else account.status = 'unverified';
			await this.storage.save(state); await this.storage.delete('journal');
			return {message: account.status === 'verified' ? 'Account identity verified for this switch.' : 'Unverified: cookies restored; authentication could not be established.'};
		} catch (error) {
			account.status = 'error'; state.active = null; await this.storage.save(state);
			const recovery = await this.recover();
			const reason = error instanceof AppError ? error.message : 'A browser or cookie operation failed.';
			throw new AppError('SWITCH_FAILED', `Switch failed. ${reason} ${recovery.message}`);
		}
	}
	async recover() {
		await this.unlocked(); const rollback = await this.read('journal');
		try {
			await this.cookies.replace(rollback.scope, rollback.storeId, rollback.cookies);
			await this.browser.reload('all');
			const state = await this.storage.state(); state.active = null; await this.storage.save(state);
			const identity = await this.browser.probe(state.selector);
			await this.storage.delete('journal');
			return {message: identity.status === 'verified' && rollback.identity && identity.email === rollback.identity ?
				'Rollback identity verified.' : 'Previous cookie state verified; authentication rollback is Unverified.'};
		} catch { throw new AppError('RECOVERY_FAILED', 'Rollback could not be verified. Recovery snapshot retained. Stop using Ahrefs until recovery or manual login.'); }
	}
	async prepareLogin() {
		await this.unlocked();
		const state = await this.storage.state();
		requireThat(state.accounts.length, 'SAVE_FIRST', 'Save the current account before signing into another account.');
		const storeId = await this.browser.storeId();
		const cookies = await this.cookies.capture(state.scope, storeId);
		let saved = cookies.length === 0;
		for (const account of state.accounts) {
			try {
				const snapshot = await this.read(account.id);
				if (snapshot.storeId === storeId && this.cookies.equal(snapshot.cookies, cookies)) saved = true;
			} catch { /* Older inaccessible snapshots cannot establish that this session is saved. */ }
		}
		requireThat(saved, 'SAVE_FIRST', 'Save or update the current Ahrefs account first, then click Sign in to Another Account again. Its latest cookies must be saved before they are cleared locally.');
		await this.write('journal', {cookies, scope: state.scope, storeId, identity: null});
		state.active = null; await this.storage.save(state);
		try {
			await this.cookies.replace(state.scope, storeId, []);
			await this.browser.reload('all');
			await this.browser.openLogin();
			await this.storage.delete('journal');
			return {message: 'Login opened. Sign into the other account, then use Add Current Account. Cookies were cleared locally; the extension did not call Ahrefs Log out.'};
		} catch {
			const recovery = await this.recover();
			throw new AppError('PREPARE_FAILED', `Could not open the next account login. ${recovery.message}`);
		}
	}
	async dispatch(type, data = {}) {
		if (type === 'status') return this.status();
		return this.exclusive(async () => {
			if (type === 'recover') return this.recover();
			requireThat(!await this.storage.get('journal'), 'RECOVERY_REQUIRED', 'An interrupted switch needs recovery. Use Recover before continuing.');
			if (type === 'prepare-login') return this.prepareLogin();
			if (type === 'add') return this.add(data);
			if (type === 'update') return this.update(data);
			if (type === 'switch') return this.switch(data);
			if (type === 'rename' || type === 'delete') {
				await this.unlocked(); const state = await this.storage.state(); const a = this.account(state, data.id);
				if (type === 'rename') { requireThat(data.name?.trim() && data.name.length <= 80, 'NAME', 'Enter a name of up to 80 characters.'); a.name = data.name.trim(); }
				else { state.accounts = state.accounts.filter(item => item.id !== a.id); state.active = null; await this.storage.save(state); await this.storage.delete(a.id); }
				await this.storage.save(state); return {message: type === 'delete' ? 'Account deleted.' : 'Account renamed.'};
			}
			throw new AppError('MESSAGE', 'Unknown action.');
		});
	}
}
