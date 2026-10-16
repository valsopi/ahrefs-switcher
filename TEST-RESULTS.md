# Validation — version 1.1.5

October 16, 2026, Node 22.23.2:

- **35 tests passed, 0 failed** via `node --test tests/*.test.js`.
- Manifest JSON and referenced popup, background and icon assets validated.
- All source JavaScript modules passed syntax checks.
- Release script passed `sh -n`.

Mock tests cover encryption/corruption, account creation/deletion, cookie attributes and partition keys, local key reuse, automatic cookie discovery, switching and rollback, concurrency, interrupted operations, session rejection, matching current sessions, and existing-tab behavior. Tests require no real Ahrefs credentials.

Earlier runtime failures have been resolved for this run. Actual Chrome visual QA and complete two-account Ahrefs compatibility have not been independently verified. The owner has reported successful switching and provided screenshots of the popup. Cookie discovery remains heuristic; the README explains limitations.
