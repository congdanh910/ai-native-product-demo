import assert from "node:assert/strict";
import test from "node:test";

import {
  STORAGE_KEY, createTask, deleteTask, loadTasks, parseTasks, saveTasks, updateTask,
} from "../src/tasks.js";

const fixedTime = new Date("2026-01-01T00:00:00.000Z");
const makeTask = () => createTask([], { title: " First task ", description: " Details " }, {
  id: "task-1", now: fixedTime,
});

test("create task trims input and starts in todo", () => {
  assert.deepEqual(makeTask(), [{
    id: "task-1", title: "First task", description: "Details", status: "todo",
    dueDate: null,
    createdAt: fixedTime.toISOString(), updatedAt: fixedTime.toISOString(),
  }]);
  assert.throws(() => createTask([], { title: "   " }), /Title is required/);
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

test("due dates accept real calendar dates and empty input", () => {
  for (const dueDate of ["2024-02-29", "2000-02-29", "2026-12-31", "0096-02-29", "", null]) {
    const tasks = createTask([], { title: "Dated task", dueDate }, {
      id: "dated", now: fixedTime,
    });
    assert.equal(tasks[0].dueDate, dueDate === "" ? null : dueDate);
    assert.equal(typeof tasks[0].dueDate, dueDate === "" || dueDate === null ? "object" : "string");
    assert.deepEqual(parseTasks(JSON.stringify(tasks)), tasks);
  }
});

test("editing preserves due dates and unrelated fields unless explicitly changed", () => {
  const original = createTask(makeTask(), { title: "Dated task", dueDate: "2024-02-29" }, {
    id: "dated", now: fixedTime,
  });
  const now = new Date("2026-01-02T00:00:00.000Z");
  const edited = updateTask(original, "dated", { title: "Edited" }, { now });
  assert.deepEqual(edited[1], { ...original[1], title: "Edited", updatedAt: now.toISOString() });
  assert.strictEqual(edited[0], original[0]);
  const changed = updateTask(original, "dated", { dueDate: "2028-02-29" }, { now });
  assert.deepEqual(changed[1], { ...original[1], dueDate: "2028-02-29", updatedAt: now.toISOString() });
  for (const dueDate of ["", null]) {
    assert.equal(updateTask(original, "dated", { dueDate }, { now })[1].dueDate, null);
  }
  assert.equal(original[1].dueDate, "2024-02-29");
});

test("invalid due dates reject creation, editing, parsing, and saving without mutation", () => {
  const original = makeTask();
  const snapshot = JSON.stringify(original);
  let saved = snapshot;
  const storage = {
    getItem: () => saved,
    setItem: (_key, value) => { saved = value; },
  };
  for (const dueDate of [
    "2025-13-01", "2025-02-29", "1900-02-29", "2100-02-29", "2026-04-31",
    "2026-00-01", "2026-01-00", "0000-01-01", "2026-1-01", "2026-01-1",
    "arbitrary text", " 2026-01-01 ", "2026-01-01T00:00:00Z", 20260101,
    new Date("2026-01-01T00:00:00.000Z"),
  ]) {
    assert.throws(() => createTask(original, { title: "Invalid", dueDate }, {
      id: "invalid", now: fixedTime,
    }), /due date.*YYYY-MM-DD/);
    assert.throws(() => updateTask(original, "task-1", { dueDate }, { now: fixedTime }), /due date/);
    const invalid = [{ ...original[0], dueDate }];
    assert.throws(() => parseTasks(JSON.stringify(invalid)), /due date/);
    assert.throws(() => saveTasks(storage, invalid), /due date/);
    assert.equal(saved, snapshot);
    assert.equal(JSON.stringify(original), snapshot);
  }
});

test("legacy loading supplies null and malformed stored due dates leave storage intact", () => {
  const { dueDate, ...legacy } = makeTask()[0];
  let saved = JSON.stringify([legacy]);
  const storage = {
    getItem: () => saved,
    setItem: () => assert.fail("Loading must not write to storage"),
  };
  assert.deepEqual(parseTasks(saved), [{ ...legacy, dueDate: null }]);
  assert.deepEqual(loadTasks(storage), [{ ...legacy, dueDate: null }]);
  assert.equal(saved, JSON.stringify([legacy]));
  for (const invalid of ["2025-02-29", "", "text", false, {}]) {
    saved = JSON.stringify([{ ...legacy, dueDate: invalid }]);
    const before = saved;
    assert.throws(() => loadTasks(storage), /due date.*real calendar date/);
    assert.equal(saved, before);
  }
});
