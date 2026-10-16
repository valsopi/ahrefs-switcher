const $ = id => document.getElementById(id);
let state, editing = null, pending = false;
async function send(type, data) {
	const response = await chrome.runtime.sendMessage({type, data});
	if (!response?.ok) throw new Error(response?.error?.message || 'The background worker stopped. Reopen the popup and check recovery status.');
	return response.data;
}
function message(text) { $('message').textContent = text; }
async function refresh() {
	state = await send('status');
	$('recover').hidden = !state.recovery;
	$('accounts').replaceChildren();
	if (!state.accounts.length) {
		const p = document.createElement('p'); p.className = 'hint';
		p.textContent = 'No saved accounts yet. Sign in to your first account in Ahrefs, then click Add Current Account.';
		$('accounts').append(p);
	}
	for (const account of state.accounts) {
		const row = document.createElement('article'); row.className = 'account';
		if (state.active === account.id) {
			row.classList.add('account-current');
			row.setAttribute('aria-label', `${account.name}, current saved session`);
		}
		const top = document.createElement('div'); top.className = 'account-top';
		const name = document.createElement('span'); name.className = 'account-name'; name.textContent = account.name;
		const button = document.createElement('button'); button.textContent = 'Switch'; button.disabled = state.recovery;
		button.hidden = state.active === account.id;
		button.onclick = () => run('switch', {id: account.id, confirmed: true});
		row.append(top);
		if (account.status === 'expired' || account.status === 'error') {
			const status = document.createElement('small');
			status.textContent = account.status === 'expired' ? 'Session expired — sign in and update below.' : 'Last switch failed — sign in and update below.';
			row.append(status);
		}
		const menu = document.createElement('details'); menu.className = 'account-controls';
		const summary = document.createElement('summary'); summary.textContent = '\u2699\uFE0E';
		summary.setAttribute('aria-label', `Manage ${account.name}`); summary.title = 'Manage account'; menu.append(summary);
		const actions = document.createElement('div'); actions.className = 'account-menu'; menu.append(actions);
		menu.addEventListener('toggle', () => {
			if (menu.open) for (const other of document.querySelectorAll('.account-controls')) if (other !== menu) other.open = false;
		});
		for (const [label, action] of [['Rename', 'rename'], ['Update from current Ahrefs login', 'update'], ['Delete', 'delete']]) {
			const control = document.createElement('button'); control.textContent = label; control.disabled = state.recovery;
			control.onclick = () => {
				if (action === 'delete') {
					if (confirm(`Delete the saved session for ${account.name}?`)) run('delete', {id: account.id});
				} else if (action === 'update') {
					if (confirm(`Replace ${account.name}'s saved session with the account currently signed into Ahrefs?`)) run('update', {id: account.id, confirmed: true});
				} else openEditor('rename', account);
			}; actions.append(control);
		} top.append(name, menu, button); $('accounts').append(row);
	}
	$('add').disabled = state.recovery;
}
async function run(type, data) {
	if (pending) return;
	pending = true; document.body.setAttribute('aria-busy', 'true');
	const buttons = [...document.querySelectorAll('button')]; buttons.forEach(button => button.disabled = true);
	if (type === 'switch') message('Switching…');
	try {
		const result = await send(type, data);
		if (type === 'switch') message('');
		else if (result.message) message(result.message);
		return result;
	}
	catch (error) { message(error.message); }
	finally {
		pending = false; buttons.forEach(button => button.disabled = false); document.body.removeAttribute('aria-busy');
		await refresh().catch(() => message('Background worker unavailable. Reopen this popup to check recovery.'));
	}
}
function openEditor(type, account = {}) {
	editing = {type, id: account.id}; $('account-form').reset();
	$('editor').setAttribute('aria-label', type === 'add' ? 'Save current account' : 'Rename account');
	$('name').value = account.name || '';
	$('editor').showModal(); $('name').focus();
}
$('account-form').onsubmit = event => {
	event.preventDefault(); $('editor').close();
	run(editing.type, {id: editing.id, name: $('name').value, confirmed: true});
};
$('cancel').onclick = () => $('editor').close();
$('add').onclick = () => openEditor('add');
$('recover').onclick = () => {
	if (confirm('Restore the pre-switch session and reload Ahrefs tabs? Save any work first.')) run('recover');
};
refresh().catch(error => message(error.message));
