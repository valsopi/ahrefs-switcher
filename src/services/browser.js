import {requireThat} from '../utils/errors.js';
export class Browser {
	constructor(pause = ms => new Promise(resolve => setTimeout(resolve, ms))) { this.pause = pause; }
	async tabs() { return (await chrome.tabs.query({url: ['https://*.ahrefs.com/*']})).filter(t => !t.incognito); }
	async storeId() {
		const tabs = await this.tabs();
		requireThat(tabs.length, 'NO_TAB', 'Open Ahrefs in a normal browser tab first.');
		const stores = await chrome.cookies.getAllCookieStores();
		const store = stores.find(s => s.tabIds.includes(tabs[0].id));
		requireThat(store, 'STORE', 'Could not identify the normal browser cookie store.');
		return store.id;
	}
	async reload(mode) {
		const tabs = await this.tabs();
		for (const tab of tabs.filter(t => mode === 'all' || t.active)) {
			const url = new URL(tab.url);
			if (url.hostname === 'app.ahrefs.com' && /^\/user\/login\/?$/.test(url.pathname)) {
				await chrome.tabs.update(tab.id, {url: 'https://app.ahrefs.com/dashboard'});
			} else await chrome.tabs.reload(tab.id);
		}
	}
	async checkSession() {
		try {
			const tabs = await this.tabs();
			const tab = tabs.find(t => t.active && new URL(t.url).hostname === 'app.ahrefs.com') ||
				tabs.find(t => new URL(t.url).hostname === 'app.ahrefs.com');
			if (!tab) return {status: 'unverified'};
			const deadline = Date.now() + 15000;
			while (Date.now() < deadline) {
				const current = await chrome.tabs.get(tab.id);
				if (current.status === 'complete') {
					// Let client-side routing settle on the SAME tab; do not create verification tabs.
					await this.pause(1200);
					const settled = await chrome.tabs.get(tab.id);
					const url = new URL(settled.url);
					if (settled.status === 'complete' && url.hostname === 'app.ahrefs.com' && /^\/user\/login\/?$/.test(url.pathname)) return {status: 'signed-out'};
					return {status: 'unverified'};
				}
				await this.pause(400);
			}
		} catch { /* Unknown navigation or API failure cannot establish expiration or identity. */ }
		return {status: 'unverified'};
	}
	async openLogin() {
		const tabs = await this.tabs();
		const tab = tabs.find(t => t.active) || tabs[0];
		requireThat(tab, 'NO_TAB', 'Open Ahrefs in a normal browser tab first.');
		await chrome.tabs.update(tab.id, {url: 'https://app.ahrefs.com/user/login'});
	}
	async probe(selector) {
		if (!selector) return {status: 'unverified'};
		try {
			// Only inspect an existing completed My Account tab. Never open or navigate a probe tab.
			const tab = (await this.tabs()).find(t => {
				const url = new URL(t.url);
				return t.status === 'complete' && url.hostname === 'app.ahrefs.com' && url.pathname === '/account/my-account';
			});
			if (!tab) return {status: 'unverified'};
			const [result] = await chrome.scripting.executeScript({target: {tabId: tab.id}, func: readIdentity, args: [selector]});
			if (result?.result) return {status: 'verified', email: result.result};
		} catch { /* Unknown DOM or blocked scripting never establishes expiration. */ }
		return {status: 'unverified'};
	}
}
function readIdentity(selector) {
	const elements = document.querySelectorAll(selector);
	if (elements.length !== 1) return null;
	const element = elements[0];
	if (element.closest('form') || element.matches('input:not([disabled]):not([readonly]),textarea,[contenteditable="true"]')) return null;
	const text = (element.value || element.textContent || '').trim().toLowerCase();
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : null;
}
