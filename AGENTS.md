# Agent context: Team Task Board

## Build, run, and test

- Node.js 20+ is required. The project has no third-party packages and needs no install step.
- Run all automated tests with `npm test`.
- Check browser module syntax with `node --check src/app.js` and `node --check src/tasks.js`.
- For manual UI checks, run `python3 -m http.server 4173 --bind 127.0.0.1` and open `http://127.0.0.1:4173`.
- Do not bind the demo server to a public interface.

## Architecture and conventions

- `src/tasks.js` is the pure task model and persistence boundary. Keep business rules there so Node tests can exercise them without a browser.
- `src/app.js` reads the model, renders DOM elements, and persists successful changes to `localStorage`.
- `index.html` contains semantic page structure; `styles.css` contains layout and responsive styles.
- Each task has `id`, `title`, `description`, `status`, `createdAt`, and `updatedAt`. Status is `todo`, `doing`, or `done`.
- Functions should return a new task array rather than mutating the existing array. Keep stored data backwards compatible as features add fields.
- Render user-provided text with `textContent`, never `innerHTML`. Show validation errors in the page's status message.
- Add or update tests for every new model rule. Use fixed IDs and timestamps in tests.

## Protected paths and prohibited actions

- Do not modify `AGENTS.md`, `.github/**`, `.env*`, credentials, or deployment settings during feature tasks.
- Do not add external services, authentication, analytics, network calls, or third-party dependencies.
- Do not run privileged commands, push branches, open pull requests, or deploy as part of a coding task unless the SDLC controller explicitly instructs it.
- Do not erase local storage automatically when its contents are malformed; report the error to the user.
