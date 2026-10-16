import {requireThat} from '../utils/errors.js';
export const allowedDomain = domain => /^(?:[a-z0-9-]+\.)*ahrefs\.com$/i.test(domain.replace(/^\./, ''));
export const cookieId = c => JSON.stringify([c.domain, c.path, c.name, c.partitionKey || null]);
export const cookieURL = c => `${c.secure ? 'https' : 'http'}://${c.domain.replace(/^\./, '')}${c.path}`;
export function setDetails(c) {
	requireThat(allowedDomain(c.domain) && c.secure && c.path.startsWith('/'), 'COOKIE_SCOPE', 'Only secure Ahrefs cookies are supported.');
	const result = {url: cookieURL(c), name: c.name, value: c.value, path: c.path, secure: c.secure,
		httpOnly: c.httpOnly, sameSite: c.sameSite, storeId: c.storeId};
	if (!c.hostOnly) result.domain = c.domain;
	if (!c.session && c.expirationDate !== undefined) result.expirationDate = c.expirationDate;
	if (c.partitionKey) result.partitionKey = c.partitionKey;
	return result;
}
export class CookieManager {
	constructor(api = chrome.cookies) { this.api = api; }
	async all(storeId) {
		const [plain, partitioned] = await Promise.all([
			this.api.getAll({domain: 'ahrefs.com', storeId}),
			this.api.getAll({domain: 'ahrefs.com', storeId, partitionKey: {}})
		]);
		return [...new Map([...plain, ...partitioned].filter(c => allowedDomain(c.domain)).map(c => [cookieId(c), c])).values()];
	}
	async capture(scope, storeId) { return (await this.all(storeId)).filter(c => scope.includes(cookieId(c))); }
	async replace(scope, storeId, target) {
		for (const c of target) {
			requireThat(scope.includes(cookieId(c)) && c.storeId === storeId, 'COOKIE_SCOPE', 'Snapshot does not match the managed scope or browser store.');
			requireThat(!c.expirationDate || c.expirationDate > Date.now() / 1000, 'EXPIRED', 'A saved cookie expired. Log in manually and update this session.');
			setDetails(c);
		}
		const all = await this.all(storeId);
		for (const c of all.filter(c => scope.includes(cookieId(c)))) {
			const host = c.domain.replace(/^\./, '');
			const ambiguous = all.some(other => !scope.includes(cookieId(other)) && other.name === c.name &&
				JSON.stringify(other.partitionKey || null) === JSON.stringify(c.partitionKey || null) &&
				(host === other.domain.replace(/^\./, '') || (!other.hostOnly && host.endsWith(`.${other.domain.replace(/^\./, '')}`))) &&
				(c.path === other.path || c.path.startsWith(other.path.endsWith('/') ? other.path : `${other.path}/`)));
			requireThat(!ambiguous, 'AMBIGUOUS_COOKIE', 'An unselected cookie shares a managed cookie name and URL. Review the scope before switching.');
		}
		for (const c of (await this.capture(scope, storeId)).sort((a, b) => b.path.length - a.path.length)) {
			const detail = {url: cookieURL(c), name: c.name, storeId};
			if (c.partitionKey) detail.partitionKey = c.partitionKey;
			await this.api.remove(detail);
		}
		requireThat(!(await this.capture(scope, storeId)).length, 'REMOVE_FAILED', 'Managed cookies could not be cleared.');
		for (const c of target) requireThat(await this.api.set(setDetails(c)), 'RESTORE_FAILED', 'A managed cookie could not be restored.');
		requireThat(this.equal(await this.capture(scope, storeId), target), 'RESTORE_FAILED', 'Restored cookies did not match the snapshot.');
	}
	equal(a, b) {
		const normalize = list => list.map(c => JSON.stringify([cookieId(c), c.value, c.secure, c.httpOnly, c.sameSite,
			c.hostOnly, c.storeId, c.session, c.expirationDate ? Math.floor(c.expirationDate) : null])).sort();
		return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
	}
}
