import assert from "node:assert/strict";
import test from "node:test";

import {
  STORAGE_KEY, createTask, deleteTask, filterTasks, loadTasks, parseTasks, saveTasks, updateTask,
} from "../src/tasks.js";

const fixedTime = new Date("2026-01-01T00:00:00.000Z");
const makeTask = () => createTask([], { title: " First task ", description: " Details " }, {
  id: "task-1", now: fixedTime,
});

const makeFilterTasks = () => [
  { id: "filter-1", title: "Plan release", description: "Draft the checklist", status: "todo" },
  { id: "filter-2", title: "Fix login", description: "Prepare release notes", status: "doing" },
  { id: "filter-3", title: "Ship release", description: "Publish documentation", status: "done" },
].map((task) => ({
  ...task, createdAt: fixedTime.toISOString(), updatedAt: fixedTime.toISOString(),
}));

test("filter tasks matches a substring in the title", () => {
  const tasks = makeFilterTasks();
  assert.deepEqual(filterTasks(tasks, "lan"), [tasks[0]]);
});

test("filter tasks matches a substring in the description", () => {
  const tasks = makeFilterTasks();
  assert.deepEqual(filterTasks(tasks, "lease notes"), [tasks[1]]);
});

test("filter tasks ignores case in titles, descriptions, and queries", () => {
  const tasks = makeFilterTasks();
  assert.deepEqual(filterTasks(tasks, "pLaN"), [tasks[0]]);
  assert.deepEqual(filterTasks(tasks, "pRePaRe"), [tasks[1]]);
});

test("filter tasks trims queries and matches every task for empty queries", () => {
  const tasks = makeFilterTasks();
  assert.deepEqual(filterTasks(tasks, " \t release \n"), tasks);
  assert.deepEqual(filterTasks(tasks, ""), tasks);
  assert.deepEqual(filterTasks(tasks, " \t\n "), tasks);
  assert.deepEqual(filterTasks(tasks), tasks);
});

test("filter tasks combines the query with each status filter", () => {
  const tasks = makeFilterTasks();
  assert.deepEqual(filterTasks(tasks, "release", "all"), tasks);
  assert.deepEqual(filterTasks(tasks, "release", "todo"), [tasks[0]]);
  assert.deepEqual(filterTasks(tasks, "release", "doing"), [tasks[1]]);
  assert.deepEqual(filterTasks(tasks, "release", "done"), [tasks[2]]);
  assert.deepEqual(filterTasks(tasks, "", "doing"), [tasks[1]]);
});

test("filter tasks returns no matches for an absent query or excluded status", () => {
  const tasks = makeFilterTasks();
  assert.deepEqual(filterTasks(tasks, "missing"), []);
  assert.deepEqual(filterTasks(tasks, "login", "done"), []);
  assert.deepEqual(filterTasks([], "release"), []);
});

test("filter tasks returns a new array without mutating input tasks", () => {
  const tasks = makeFilterTasks();
  const original = tasks.map((task) => ({ ...task }));
  tasks.forEach(Object.freeze);
  Object.freeze(tasks);

  for (const [query, status] of [["release", "doing"], ["", "all"], ["missing", "all"]]) {
    const result = filterTasks(tasks, query, status);
    assert.notStrictEqual(result, tasks);
    assert.deepEqual(tasks, original);
  }
});

test("create task trims input and starts in todo", () => {
  assert.deepEqual(makeTask(), [{
    id: "task-1", title: "First task", description: "Details", status: "todo",
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
