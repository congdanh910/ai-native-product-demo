# Spec: Priority and sorting

## Goal

Enable users to assign and view task priority (Low, Medium, High) and automatically sort tasks within each column by priority, then by creation order and ID, with full validation and deterministic testing.

## User stories

- As a team member, I want to see a priority selector in the create and edit forms so that I can assign priority to new tasks.
- As a team member, I want to see a visible priority label on each task card so that I can quickly identify task importance.
- As a team member, I want new tasks to default to Medium priority so that I don’t have to manually set it every time.
- As a team member, I want existing tasks without priority to load as Medium so that the board remains consistent after migration.
- As a team member, I want invalid priority values to be rejected so that data integrity is preserved.
- As a team member, I want tasks to be sorted within each column as High, Medium, Low so that the most important work appears first.
- As a team member, I want tasks of the same priority to be ordered by creation time, then by ID so that order is predictable and stable.
- As a team member, I want changing a task’s priority to update storage and immediately reorder the board so that the UI reflects the change instantly.
- As a team member, I want moving a task to a different status to retain its priority so that priority is not lost during workflow transitions.

## Acceptance criteria

- AC-1: On task creation, the form includes a priority selector with options 'Low', 'Medium', and 'High'; default value is 'Medium'.
- AC-2: Each task card displays a visible priority label (e.g., 'High', 'Medium', 'Low') using a consistent visual style.
- AC-3: New tasks created without a priority value are assigned 'Medium' priority by default.
- AC-4: Tasks loaded from storage that lack a priority field are treated as 'Medium' priority during rendering.
- AC-5: If a priority value is not one of 'Low', 'Medium', or 'High', the system rejects it and shows a validation error in the UI.
- AC-6: Within each column, tasks are sorted in order: High, then Medium, then Low.
- AC-7: Within the same priority level, tasks are sorted by creation time (earliest first), and if creation times are equal, by task ID (ascending).
- AC-8: Changing a task's priority updates the stored data via `saveTasks` and immediately reorders the board without requiring a reload.

## Assumptions

- The `src/tasks.js` module is responsible for validating and storing priority values.
- The `src/app.js` module handles rendering priority labels and form inputs.
- The `STATUSES` constant in `src/tasks.js` defines the valid status values: 'todo', 'doing', 'done'.
- Task objects in storage include `id`, `title`, `description`, `status`, `createdAt`, and `updatedAt`.
- The `parseTasks` function in `src/tasks.js` handles parsing stored data and must be updated to support priority migration.
- The `loadTasks` function reads from `localStorage` and returns an array of tasks.
- The `saveTasks` function persists the updated task array to `localStorage`.
- The `fixedTime` and `makeTask` helpers in `tests/tasks.test.js` can be used to create test data with predictable timestamps.

## Concerns

- Adding priority to the task model may affect existing data migration logic; the `parseTasks` function must be updated to handle missing priority fields.
- The sort order logic must be deterministic and consistent across browser sessions; relying on `createdAt` and `id` is acceptable only if timestamps are fixed in tests.
- The UI must update immediately after priority change, which requires re-rendering the entire column; this may impact performance if not optimized.
- Ensuring that `saveTasks` is called after every priority update and that `loadTasks` correctly initializes missing priorities is critical for data consistency.
- The `tests/tasks.test.js` file must be extended to cover migration, invalid values, and stable sorting—this may require new test cases with fixed IDs and timestamps.

## Open questions

- Should the priority selector allow users to change priority after a task is created, and should that change trigger a re-sort even if the task remains in the same column?
- Should the priority label be displayed in a specific color or icon, and if so, what are the design specifications?
- Are task IDs guaranteed to be unique and stable across sessions, and can we safely use them for tie-breaking in sorting?
