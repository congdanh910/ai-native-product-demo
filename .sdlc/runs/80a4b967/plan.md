# Plan v2: Priority and sorting

This implementation adds priority support to the task model and UI, fulfilling all acceptance criteria. The priority field is added to the task schema with 'Low', 'Medium', and 'High' as valid values. The `parseTasks` function is updated to assign 'Medium' priority to tasks missing the field, ensuring AC-4 is met. Default priority in forms is set to 'Medium' (AC-3), and invalid values are rejected by `validateTask` (AC-5). The UI renders priority labels in the task cards (AC-2), and sorting is implemented in `render()` to order tasks by priority (High > Medium > Low), then by creation time and ID (AC-6, AC-7). Changes to priority trigger `saveTasks` and re-rendering (AC-8), with status transitions preserving priority. The test suite is extended to verify migration, validation, and stable sorting (AC-3 and AC-5 are now covered by tests). All changes are confined to allowed paths, and no test files are modified directly.

## Tasks

### T1 Add priority validation and default in task model
- Modify: `src/tasks.js`
- Provides: `PRIORITY_OPTIONS`, `validateTask`
- Acceptance criteria: AC-5, AC-3
- Validation: unit-tests, syntax-tasks

### T2 Update parseTasks to assign Medium priority to missing fields
- Depends on: T1
- Modify: `src/tasks.js`
- Provides: `parseTasks`
- Acceptance criteria: AC-4
- Validation: unit-tests, syntax-tasks

### T3 Add priority selector and default in create and edit forms
- Depends on: T1
- Modify: `index.html`
- Acceptance criteria: AC-1
- Validation: syntax-app

### T4 Render priority labels in task cards
- Depends on: T1, T3
- Modify: `src/app.js`
- Acceptance criteria: AC-2
- Validation: syntax-app

### T5 Implement deterministic sorting by priority, then creation time and ID
- Depends on: T1, T2, T4
- Modify: `src/app.js`
- Acceptance criteria: AC-6, AC-7
- Validation: unit-tests, syntax-app

### T6 Ensure priority changes trigger save and re-render
- Depends on: T1, T5
- Modify: `src/app.js`
- Acceptance criteria: AC-8
- Validation: unit-tests, syntax-app

## Test plan

| Case | Task | Criterion | Test | Expected | File |
|---|---|---|---|---|---|
| TC-1 | T1 | AC-5 | Given an invalid priority value 'Urgent', when validating a task, then the system should reject it and show a validation error in the UI. | The validation error 'Invalid priority: Urgent' is shown in the UI. | `tests/tasks.test.js` |
| TC-2 | T1 | AC-3 | Given a new task created without a priority value, when the task is created, then it should be assigned 'Medium' priority by default. | The task object has priority 'Medium' in its properties. | `tests/tasks.test.js` |
| TC-3 | T2 | AC-4 | Given a task loaded from storage that lacks a priority field, when parsing the task, then it should be treated as 'Medium' priority during rendering. | The parsed task includes 'Medium' as its priority value. | `tests/tasks.test.js` |
| TC-4 | T3 | AC-1 | Given a task creation form, when the form is rendered, then it should include a priority selector with options 'Low', 'Medium', and 'High', and the default value should be 'Medium'. | The form contains a select element with three options: 'Low', 'Medium', 'High', and 'Medium' is selected by default. | `tests/tasks.test.js` |
| TC-5 | T4 | AC-2 | Given a task card rendered in the UI, when the task has a priority of 'High', then the card should display a visible priority label 'High' using a consistent visual style. | The task card contains a visible label with text 'High'. | `tests/tasks.test.js` |
| TC-6 | T5 | AC-6 | Given multiple tasks in the same column with different priorities, when rendering the column, then they should be sorted in order: High, then Medium, then Low. | Tasks appear in the DOM in the order: High, Medium, Low. | `tests/tasks.test.js` |
| TC-7 | T5 | AC-7 | Given two tasks with the same priority and the same creation time, when rendering the column, then they should be sorted by ID in ascending order. | The task with the lower ID appears first in the DOM. | `tests/tasks.test.js` |
| TC-8 | T6 | AC-8 | Given a task with priority changed in the UI, when the change is applied, then the system should update the stored data via `saveTasks` and immediately reorder the board without requiring a reload. | The task's priority is saved in localStorage and the board is re-rendered in the correct sorted order. | `tests/tasks.test.js` |

## Grounding check: pass
