# Build a Chrome Extension: Ahrefs Account Switcher

## Objective

Build a fully functional Google Chrome extension (Manifest V3) that allows me to switch between multiple independently owned Ahrefs accounts within the **same Chrome browser profile**, without logging out and manually logging back in every time.

The extension should save each account's authenticated browser session locally and restore it when I select that account.

**Important constraints:**
- Do not use separate Chrome profiles.
- Do not require a backend, cloud service, or external database.
- Do not ask for or store Ahrefs passwords.
- Do not automate login, bypass authentication, or circumvent MFA.
- Do not use a local proxy.
- All account data must remain on my computer.
- Use plain JavaScript, HTML, and CSS, preferably without a framework.
- Use tabs for indentation, not spaces.

## 1. Technical architecture

Build a Chrome Manifest V3 extension using:

- `chrome.cookies` to read, remove, and restore Ahrefs cookies.
- `chrome.storage.local` for extension preferences and non-sensitive account metadata.
- IndexedDB, if appropriate, for encrypted session snapshots.
- `chrome.tabs` to identify and reload Ahrefs tabs.
- A background service worker for session management.
- A popup interface for account management.

Use only the minimum Chrome permissions necessary.

Restrict host permissions to Ahrefs domains. Do not request broad access to all websites.

Support `ahrefs.com` and its relevant subdomains, but inspect which domains actually participate in authentication before deciding what must be saved.

Do not assume cookies are the only authentication mechanism. Investigate whether Ahrefs uses localStorage, sessionStorage, or other browser-managed state that affects account switching.

Document any limitations discovered.

## 2. Account management

The extension should allow me to save multiple accounts.

Each account should contain:

- Unique internal ID
- Custom display name
- Email address (for identification only)
- Creation date
- Last successful activation
- Session status
- Saved session snapshot

Example accounts:

- Ahrefs — Personal
- Ahrefs — Company
- Ahrefs — Client

### Adding an account

Provide an **Add Current Account** button.

Workflow:

1. I manually log into Ahrefs using its normal website.
2. I open the extension popup.
3. I click Add Current Account.
4. I enter an account name and optional email address.
5. The extension captures the current Ahrefs session.
6. It stores the snapshot locally.
7. The account appears in the account list.

Never capture my password or intercept login form submissions.

Do not attempt to read or bypass MFA.

If no authenticated session is detected, explain that I must log in first.

Do not treat the presence of a cookie alone as proof of authentication.

## 3. Switching accounts

Each saved account should have a Switch button.

When switching from Account A to Account B:

1. Acquire an exclusive switching lock to prevent simultaneous operations.
2. Check for Ahrefs tabs and warn about possible unsaved work.
3. Capture the current account's latest session state, if safe and identifiable.
4. Validate that Account B has a saved session snapshot.
5. Create a temporary rollback snapshot of the current cookie state.
6. Remove only cookies belonging to the explicitly managed Ahrefs authentication scope.
7. Restore Account B's saved cookies with the appropriate Chrome cookie attributes.
8. Restore any additional supported authentication state, if required.
9. Reload the relevant Ahrefs tabs.
10. Verify the resulting authenticated account identity when technically possible.
11. Update the active account indicator only after successful verification.

If verification is unavailable, display **Unverified** rather than claiming the switch succeeded.

If switching fails:

- Stop further operations.
- Attempt to restore the previous state.
- Report whether rollback succeeded.
- Do not claim that rollback was successful unless it was verified.

Do not repeatedly retry authentication automatically.

### Cookie handling

Preserve applicable cookie attributes:

- Name
- Value
- Domain
- Path
- Secure
- HttpOnly
- SameSite
- Expiration
- Host-only behavior
- Partition key, where applicable
- Cookie store ID, where applicable

Handle Chrome API restrictions correctly when recreating cookies.

Do not blindly delete all cookies from Ahrefs domains.

Do not modify cookies belonging to unrelated services.

If cookies are insufficient to restore a session, report the limitation rather than implementing an unsafe workaround.

## 4. Session storage and security

Session cookies are sensitive authentication credentials.

Implement secure local storage with these requirements:

- Never use `chrome.storage.sync` for session credentials.
- Never send session data to a remote server.
- Never log cookie values to the console.
- Never expose session values in the popup.
- Never export sessions as plaintext JSON.
- Never include session credentials in error messages.
- Never store passwords.
- Never use third-party analytics.

Prefer encrypting session snapshots using Web Crypto AES-GCM with a key derived from a user-supplied master passphrase using PBKDF2 or an appropriately supported key derivation mechanism.

Do not store the master passphrase or the derived decryption key persistently.

Ask for the passphrase when the user needs to unlock saved sessions.

Use IndexedDB or another appropriate local storage mechanism for encrypted snapshots.

Keep account labels and non-sensitive preferences in `chrome.storage.local`.

Use restrictive extension storage access settings where supported.

Clearly explain that encryption protects saved snapshots at rest but cannot eliminate the risks of an unlocked browser, a compromised extension, or malicious software running locally.

Provide a **Lock Sessions** action.

## 5. Popup UI

Build a polished, compact Chrome extension popup.

Design direction:

- Minimal and modern
- Clean typography
- Light and dark mode
- Rounded corners
- Subtle borders
- No unnecessary animations
- Approximately 360px wide

Example layout:

**Ahrefs Switcher**

Active account: Personal

Accounts:

- Personal — Active
- Company — Switch
- Client — Switch

Actions:

- Add Current Account
- Update Current Session
- Lock Sessions
- Settings

Each account should have a context menu for:

- Rename
- Update saved session
- Delete

Show a confirmation dialog before deleting a saved account.

Use clear states for:

- Active
- Switching
- Unverified
- Session expired
- Locked
- Error

Avoid displaying a green success indicator unless the account identity has been verified.

## 6. Session expiration

Saved sessions may expire or be revoked by Ahrefs.

Handle this gracefully.

When a session is no longer valid:

1. Mark it as expired only when expiration is established.
2. Explain that manual login is required.
3. Provide a button to open the Ahrefs login page.
4. Allow the user to update the saved snapshot after logging in.

Do not attempt to bypass expired sessions or authentication challenges.

## 7. Multiple Ahrefs tabs

All Ahrefs tabs within the same Chrome cookie store generally share authentication cookies.

Therefore, the extension must not claim to support simultaneous independent Ahrefs logins in different tabs.

When switching accounts:

- Identify open Ahrefs tabs.
- Explain that switching changes the active session for the browser profile.
- Warn that existing tabs may reload under the selected account.
- Do not silently submit forms or discard unsaved edits.
- Provide a configurable option to reload all Ahrefs tabs or only the active Ahrefs tab.

Clearly document that reloading only one tab does not isolate the other tabs' authentication.

## 8. Error handling

Handle:

- No saved accounts
- No Ahrefs session
- Expired cookies
- Invalid or unsupported cookie attributes
- Insufficient Chrome permissions
- Cookie restoration failures
- Account identity verification failures
- Service worker suspension
- Concurrent switching attempts
- Browser restart during switching
- Encrypted storage corruption
- Incorrect master passphrase
- Missing browser storage state

Use structured error codes internally and understandable messages in the UI.

Never display authentication secrets in errors.

## 9. Testing

Create tests for:

- Adding an account
- Saving and restoring cookie attributes
- Switching between two mocked sessions
- Encryption and decryption
- Incorrect passphrase
- Session expiration
- Rollback after partial restoration failure
- Concurrent switching attempts
- Service worker restart during an operation
- Deleting an account
- Account identity verification failures

Mock Chrome APIs for automated testing.

Do not require real Ahrefs credentials in the test suite.

Provide a manual test plan for verifying the extension with two legitimate Ahrefs accounts.

## 10. Project structure

Use a clear structure similar to:

```text
ahrefs-account-switcher/
├── manifest.json
├── src/
│   ├── background/
│   │   └── service-worker.js
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   ├── services/
│   │   ├── cookie-manager.js
│   │   ├── session-manager.js
│   │   ├── encryption.js
│   │   └── storage.js
│   └── utils/
│       └── errors.js
├── tests/
├── README.md
└── package.json
```

You may improve this structure if there's a clear architectural reason.

## 11. README

Document:

- How to install the unpacked extension in Chrome
- Required permissions and why each is needed
- How to save the first account
- How to save a second account
- How to switch between accounts
- How to unlock and lock saved sessions
- How to recover from an expired session
- Why multiple Ahrefs tabs cannot maintain independent logins
- Security risks of saving authentication cookies
- Known limitations of Chrome Manifest V3
- Potential incompatibilities with Ahrefs authentication
- How to run tests

## 12. Implementation process

Work in phases.

**Phase 1 — Feasibility**

Investigate Chrome Manifest V3 cookie APIs, relevant browser storage restrictions, and Ahrefs authentication behavior using accessible documentation.

Do not invent findings about Ahrefs' internal authentication.

If actual authentication behavior cannot be inspected without credentials, identify what must be tested manually.

Explain whether cookie-only switching is technically feasible and what could prevent it.

**Phase 2 — Core extension**

Implement:

- Manifest
- Popup
- Account metadata management
- Cookie capture
- Cookie restoration
- Encrypted session storage
- Account switching

**Phase 3 — Reliability**

Implement:

- Switching locks
- Rollback
- Error handling
- Session verification
- Browser restart recovery

**Phase 4 — Testing and documentation**

Run the automated tests, fix failures, and document manual verification steps.

## Acceptance criteria

The extension is complete when:

1. I can install it in Chrome using Load Unpacked.
2. I can manually sign in to my first Ahrefs account and save its session.
3. I can manually sign in to a second Ahrefs account and save its session.
4. I can select either account from the popup.
5. If Ahrefs permits session restoration, switching restores the selected account without requiring another login.
6. The extension never reports successful authentication without verification.
7. Session credentials are encrypted at rest.
8. Failed switches are handled safely.
9. The extension does not interfere with unrelated websites.
10. All automated tests pass.

If Ahrefs invalidates previous sessions or binds authentication to additional state, explain this clearly. Do not falsely claim that cookie swapping works.

## Final instructions

Build the actual working extension, not just a prototype or architectural explanation.

Use tabs for indentation throughout JavaScript, HTML, and CSS.

Keep the implementation straightforward and maintainable.

Do not add unnecessary dependencies, a backend, analytics, or unrelated features.

At the end, provide the project files, installation instructions, test results, and any limitations that still require manual verification.
