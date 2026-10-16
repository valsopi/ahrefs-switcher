import {Storage} from '../services/storage.js';
import {CookieManager} from '../services/cookie-manager.js';
import {Browser} from '../services/browser.js';
import {SessionManager} from '../services/session-manager.js';
import {publicError} from '../utils/errors.js';
const storage = new Storage();
const ready = storage.initialize();
const manager = new SessionManager(storage, new CookieManager(), new Browser());
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('src/popup/popup.html')) return false;
	ready.then(() => manager.dispatch(message.type, message.data)).then(
		data => sendResponse({ok: true, data}), error => sendResponse({ok: false, error: publicError(error)})
	);
	return true;
});
