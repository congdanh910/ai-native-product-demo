import assert from "node:assert/strict";
import test from "node:test";

import {
  STORAGE_KEY, createTask, deleteTask, loadTasks, parseTasks, saveTasks, updateTask,
  validateTask,
} from "../src/tasks.js";

const fixedTime = new Date("2026-01-01T00:00:00.000Z");
const makeTask = () => createTask([], { title: " First task ", description: " Details " }, {
  id: "task-1", now: fixedTime,
});

test("create task trims input and starts in todo", () => {
  assert.deepEqual(makeTask(), [{
    id: "task-1", title: "First task", description: "Details", status: "todo",
    createdAt: fixedTime.toISOString(), updatedAt: fixedTime.toISOString(),
  }]);
  assert.throws(() => createTask([], { title: "   " }), /Title is required/);
});

test("TC-1: invalid priority produces a validation error", () => {
  const task = { ...makeTask()[0], priority: "Urgent" };
  assert.throws(() => validateTask(task), { message: "Invalid priority: Urgent" });
});

test("TC-2: new task defaults to Medium priority", () => {
  const tasks = createTask([], { title: "First task", description: "Details" }, {
    id: "task-1", now: fixedTime,
  });
  assert.equal(tasks[0].priority, "Medium");
});

test("edit and move preserve the original task", () => {
  const original = makeTask();
  const changed = updateTask(original, "task-1", { title: "Updated", status: "doing" }, {
    now: new Date("2026-01-02T00:00:00.000Z"),
  });
  assert.equal(original[0].status, "todo");
  assert.equal(changed[0].title, "Updated");
  assert.equal(changed[0].status, "doing");
  assert.equal(changed[0].updatedAt, "2026-01-02T00:00:00.000Z");
  assert.throws(() => updateTask(original, "task-1", { status: "unknown" }), /status/);
});

test("delete removes one task and reports missing ids", () => {
  assert.deepEqual(deleteTask(makeTask(), "task-1"), []);
  assert.throws(() => deleteTask([], "missing"), /not found/);
});

test("storage roundtrip validates shape and unique ids", () => {
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  };
  assert.deepEqual(loadTasks(storage), []);
  saveTasks(storage, makeTask());
  assert.deepEqual(loadTasks(storage), makeTask());
  assert.ok(memory.has(STORAGE_KEY));
  assert.throws(() => parseTasks(JSON.stringify([...makeTask(), ...makeTask()])), /Duplicate/);
  assert.throws(() => parseTasks("{}"), /list/);
});
