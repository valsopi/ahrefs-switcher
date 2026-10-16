// Only encrypted envelopes enter IndexedDB. Labels and preferences use local storage.
export class Storage {
	async initialize() { await chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'}); }
	async state() {
		const {state} = await chrome.storage.local.get('state');
		return state || {accounts: [], scope: [], reload: 'all', selector: '', active: null};
	}
	async save(state) { await chrome.storage.local.set({state}); }
	async db() {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open('ahrefs-vault', 1);
			request.onupgradeneeded = () => request.result.createObjectStore('vault');
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}
	async record(mode, id, value) {
		const db = await this.db();
		try {
			return await new Promise((resolve, reject) => {
				const tx = db.transaction('vault', mode === 'get' ? 'readonly' : 'readwrite');
				const store = tx.objectStore('vault');
				const req = mode === 'get' ? store.get(id) : mode === 'put' ? store.put(value, id) : store.delete(id);
				tx.oncomplete = () => resolve(req.result);
				tx.onerror = tx.onabort = () => reject(tx.error);
			});
		} finally { db.close(); }
	}
	get(id) { return this.record('get', id); }
	put(id, value) { return this.record('put', id, value); }
	delete(id) { return this.record('delete', id); }
}
