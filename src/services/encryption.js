import {requireThat} from '../utils/errors.js';
const encode = value => new TextEncoder().encode(value);
export const random = size => Array.from(crypto.getRandomValues(new Uint8Array(size)));
export async function encrypt(key, value, context) {
	const iv = random(12);
	const data = await crypto.subtle.encrypt({name: 'AES-GCM', iv: new Uint8Array(iv), additionalData: encode(context)}, key, encode(JSON.stringify(value)));
	return {version: 1, iv, data: Array.from(new Uint8Array(data))};
}
export async function decrypt(key, envelope, context) {
	requireThat(envelope?.version === 1, 'CORRUPT', 'The encrypted snapshot format is invalid.');
	const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: new Uint8Array(envelope.iv), additionalData: encode(context)}, key, new Uint8Array(envelope.data));
	return JSON.parse(new TextDecoder().decode(plain));
}
