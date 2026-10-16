# Ahrefs Switcher

Local-only Chrome extension for named snapshots of your own Ahrefs sessions. No backend, analytics, passphrase, settings screen or lock button.

## Install or update

In `chrome://extensions`, enable Developer mode and Load unpacked from this project directory. If already installed, click its Reload arrow and reopen the popup. Current version: **1.1.5**.

## Use

Sign into Ahrefs in a normal browser tab, then choose the gray **+** in the header and name the session. Account rows show the name, a cog menu and Switch. Switch is hidden for the matching current session. The cog contains Rename, Update from current Ahrefs login, and Delete.

A subtle blue tint highlights the saved account whose cookies uniquely match the current browser session. Matching is checked when the popup refreshes, including after saving or switching. Unknown, ambiguous, expired or errored sessions have no highlight. This is a saved-session association, not independent proof of server authentication. Cookie rotation can remove a match until the snapshot is updated.

Switching has no confirmation dialog. It restores the selected session and reloads existing Ahrefs tabs without creating a new tab, changing tab focus or opening a verification page. Existing login tabs navigate to the dashboard in place. Save unfinished work before switching. All normal Ahrefs tabs share the same browser cookie store; simultaneous independent logins in separate tabs are not supported.

The popup has no introductory text, account heading/count, separate sign-in button or footer. Empty-state instructions and operation/error messages still appear when needed. Cog menus open beneath their row and remain keyboard accessible.

## Authentication and limitations

Account names are labels you supply. The extension does not capture passwords, automate login or bypass MFA. Ahrefs Log out may revoke a saved session on the server; restoring cookies cannot reverse that. Sign in manually and update a revoked saved session. The former separate Sign in to Another Account control has been removed at the user's request.

Capture automatically selects secure HttpOnly or authentication/session-named cookie candidates on `ahrefs.com` and `app.ahrefs.com`, excluding common analytics, marketing, consent and Cloudflare challenge prefixes. Exact name/domain/path/partition identities define the managed scope. This is a heuristic, not an authenticated Ahrefs storage contract. Other cookies are left alone, including third-party services. No localStorage, sessionStorage, website IndexedDB, caches or device-bound credentials are copied or cleared. If those are required, cookie-only restoration may fail.

After switching, the extension checks an existing Ahrefs app tab for a completed login redirect. Detected rejection triggers rollback. Dashboard URLs and cookie read-back alone never establish identity; unknown authentication remains internally Unverified. Successful switch messages are suppressed in the popup at the user's request; errors remain visible. The legacy optional email selector only inspects an already open, completed My Account tab. It does not create a tab or navigate for identity verification.

## Storage and recovery

Snapshots and rollback journals are AES-GCM encrypted in local IndexedDB. A generated non-extractable CryptoKey is persisted in the same database so there is no unlock step. Anyone controlling the browser or local extension storage may access that key; encryption does not protect against local malware. Labels and non-sensitive preferences use trusted-context `chrome.storage.local`, never sync. Session values are not displayed, logged, exported or uploaded.

Operations are serialized. A durable encrypted journal precedes cookie mutation. Cookie attributes and values are read back after restoration; failed restoration attempts rollback once. An interrupted journal exposes a Recover Interrupted Switch button and blocks further mutations until recovered. Authentication rollback is verified only if a matching identity can be established; cookie restoration alone is explicitly Unverified. Existing passphrase-protected snapshots must be saved again after manual login.

The website may rotate/revoke sessions or write cookies during switching. Cookie replacement is not atomic with website requests. Ahrefs compatibility requires manual testing; the user reports one saved account worked, while another was rejected after website logout.

## Permissions

Chrome 132+ is required. `cookies` manages the scoped Ahrefs cookies, `storage` stores local metadata, and `scripting` supports the legacy optional read-only identity check. Host permissions cover only `https://*.ahrefs.com/*`. No broad tabs permission or incognito access is requested. No external scripts or extension-origin network requests are used; normal Ahrefs pages still communicate with Ahrefs as usual.

## Validation

With Node 20+, run `npm test` (no install or network needed). Mock coverage includes cookie attributes and partitions, account creation/deletion, local key reuse after restart, discovery, expanded scopes, corruption, expiration, switching, rollback, concurrency, login redirects and use of existing tabs. No real credentials are required.

All 35 automated tests pass on Node 22.23.2. Manifest assets, JavaScript syntax and release-script syntax were also checked. Actual Ahrefs compatibility and browser visual behavior still require manual validation. See TEST-RESULTS.md.

## Release

Work on a separate branch, explicitly stage the reviewed source, then run `make release m="Release message"`. This follows the Compliance Flux convention: tests, fetch, commit, fast-forward main and push. It refuses divergent history and supports bootstrapping an empty remote. No force push or server SSH is used. This publishes Git source; users must reload their unpacked extension to apply changes.

Manual check: reload the extension; confirm the compact row and keyboard-accessible cog; switch between two valid saved sessions while watching the tab strip; confirm no new tab or confirmation dialog appears; verify the actual account identity inside Ahrefs; test update/delete and recovery with disposable sessions and no unsaved work.

References: [Chrome cookies API](https://developer.chrome.com/docs/extensions/reference/api/cookies), [Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage), [Ahrefs Cookie Notice](https://ahrefs.com/legal/cookie-notice).
