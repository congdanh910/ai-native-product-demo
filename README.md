# Team Task Board

A small browser-based task board for the AI-Native SDLC pilot. The baseline supports creating, editing, moving, and deleting tasks across **To do**, **Doing**, and **Done**. Data stays in the browser's local storage; there is no account, backend, or external API.

## Run

Requirements: Node.js 20+ for tests and Python 3 for the local web server.

```bash
npm test
python3 -m http.server 4173 --bind 127.0.0.1
```

Open <http://127.0.0.1:4173>. Use a local web server because the app loads JavaScript modules. No `npm install` is needed.

## Repository layout

- `src/tasks.js`: task data rules and local storage serialization.
- `src/app.js`: browser UI and event handlers.
- `index.html`, `styles.css`: page structure and presentation.
- `tests/tasks.test.js`: deterministic model tests with Node's built-in test runner.
- `AGENTS.md`: versioned development context for coding agents.

This baseline intentionally leaves room for five separate feature tasks. Each benchmark attempt must start from the same pinned base commit and run in an isolated worktree.
