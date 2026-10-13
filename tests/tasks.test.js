import assert from "node:assert/strict";
import test from "node:test";

import {
  STORAGE_KEY, createTask, deleteTask, filterTasks, loadTasks, parseTasks, saveTasks, updateTask,
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

const makeBoard = () => {
  const timestamp = fixedTime.toISOString();
  const base = { createdAt: timestamp, updatedAt: timestamp };
  return [
    { ...base, id: "task-a", title: "Write Report", description: "Quarterly numbers", status: "todo" },
    { ...base, id: "task-b", title: "Review code", description: "Check the report parser", status: "doing" },
    { ...base, id: "task-c", title: "Deploy", description: "Ship release", status: "done" },
  ];
};
const ids = (tasks) => tasks.map((task) => task.id);

test("filter matches title and description", () => {
  assert.deepEqual(ids(filterTasks(makeBoard(), "Deploy")), ["task-c"]);
  assert.deepEqual(ids(filterTasks(makeBoard(), "Quarterly")), ["task-a"]);
  assert.deepEqual(ids(filterTasks(makeBoard(), "report")), ["task-a", "task-b"]);
});

test("filter ignores case", () => {
  assert.deepEqual(ids(filterTasks(makeBoard(), "write report")), ["task-a"]);
  assert.deepEqual(ids(filterTasks(makeBoard(), "SHIP RELEASE")), ["task-c"]);
});

test("filter trims the query and empty query matches every task", () => {
  assert.deepEqual(ids(filterTasks(makeBoard(), "  deploy  ")), ["task-c"]);
  assert.deepEqual(ids(filterTasks(makeBoard(), "")), ["task-a", "task-b", "task-c"]);
  assert.deepEqual(ids(filterTasks(makeBoard(), "   ")), ["task-a", "task-b", "task-c"]);
  assert.deepEqual(ids(filterTasks(makeBoard())), ["task-a", "task-b", "task-c"]);
});

test("filter combines query with status", () => {
  assert.deepEqual(ids(filterTasks(makeBoard(), "report", "doing")), ["task-b"]);
  assert.deepEqual(ids(filterTasks(makeBoard(), "report", "done")), []);
  assert.deepEqual(ids(filterTasks(makeBoard(), "", "todo")), ["task-a"]);
  assert.deepEqual(ids(filterTasks(makeBoard(), "", "all")), ["task-a", "task-b", "task-c"]);
  assert.throws(() => filterTasks(makeBoard(), "", "unknown"), /Status filter/);
});

test("filter returns empty list when nothing matches", () => {
  assert.deepEqual(filterTasks(makeBoard(), "nonexistent"), []);
});

test("filter does not mutate tasks", () => {
  const board = makeBoard();
  const snapshot = structuredClone(board);
  const taskRefs = [...board];
  const result = filterTasks(board, " REPORT ", "doing");
  assert.notEqual(result, board);
  assert.deepEqual(board, snapshot);
  board.forEach((task, index) => assert.equal(task, taskRefs[index]));
  assert.equal(result[0], board[1]);
});
