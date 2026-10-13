# Review rules: Team Task Board

## Passes
1. Bugs: logic errors, unhandled or silently converted input, broken existing behaviour, data that is no longer backwards compatible.
2. Boundaries: business rules live in `src/tasks.js`; `src/app.js` only renders and persists. User text is rendered with `textContent`.
3. Conformance: the diff implements spec.md and plan.md, and nothing else.
4. Tests: every acceptance criterion has a test with fixed IDs and timestamps that would fail without the change.

## Severity
- Important: a bug, a rule placed in `src/app.js`, `innerHTML` with user text, a missing acceptance criterion, a test that cannot fail, or a change outside the plan.
- Nit: naming, comments, formatting. Report at most three.

## Skip
- Visual styling details unless the spec asks for them.
