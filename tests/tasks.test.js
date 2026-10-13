import assert from "node:assert/strict";
import test from "node:test";

import {
  STORAGE_KEY, createTask, deleteTask, loadTasks, parseBackup, parseTasks, saveTasks,
  serializeBackup, updateTask,
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

test("backup roundtrip preserves all task fields without mutating the input", () => {
  const tasks = [
    { ...makeTask()[0], title: "Café 日本語", metadata: { labels: ["team"] } },
    { ...makeTask()[0], id: "task-2", status: "done" },
  ];
  const original = structuredClone(tasks);
  const text = serializeBackup(tasks);
  assert.deepEqual(JSON.parse(text), { version: 1, tasks: original });
  const restored = parseBackup(text);
  assert.deepEqual(restored, original);
  assert.notEqual(restored, tasks);
  assert.notEqual(restored[0], tasks[0]);
  restored[0].metadata.labels.push("restored");
  assert.deepEqual(tasks, original);
});

test("empty board backup roundtrip", () => {
  const tasks = [];
  const text = serializeBackup(tasks);
  assert.deepEqual(JSON.parse(text), { version: 1, tasks: [] });
  const restored = parseBackup(text);
  assert.deepEqual(restored, []);
  assert.notEqual(restored, tasks);
  assert.deepEqual(tasks, []);
});

test("invalid backups leave existing tasks and storage untouched", () => {
  const tasks = makeTask();
  const original = structuredClone(tasks);
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  };
  saveTasks(storage, tasks);
  const saved = memory.get(STORAGE_KEY);
  const cases = [
    ["{", /malformed JSON/],
    ["null", /object/],
    ["[]", /object/],
    [JSON.stringify({ version: 2, tasks }), /Unsupported backup version/],
    [JSON.stringify({ version: "1", tasks }), /Unsupported backup version/],
    [JSON.stringify({ tasks }), /Unsupported backup version/],
    [JSON.stringify({ version: 1 }), /list/],
    [JSON.stringify({ version: 1, tasks: {} }), /list/],
    [JSON.stringify({ version: 1, tasks: [null] }), /object/],
    [JSON.stringify({ version: 1, tasks: [...tasks, ...tasks] }), /Duplicate task id/],
  ];
  for (const [field, value, error] of [
    ["id", "", /id/],
    ["title", " ", /title/],
    ["description", 42, /description/],
    ["status", "unknown", /status/],
    ["createdAt", "invalid", /createdAt/],
    ["updatedAt", null, /updatedAt/],
  ]) {
    cases.push([
      JSON.stringify({ version: 1, tasks: [tasks[0], { ...tasks[0], id: "task-2", [field]: value }] }),
      error,
    ]);
  }
  for (const [text, error] of cases) {
    assert.throws(() => parseBackup(text), error);
    assert.deepEqual(tasks, original);
    assert.equal(memory.get(STORAGE_KEY), saved);
    assert.deepEqual(loadTasks(storage), original);
  }
});
