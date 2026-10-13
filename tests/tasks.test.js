import assert from "node:assert/strict";
import test from "node:test";

import {
  STORAGE_KEY, archiveTask, countActiveTasks, createTask, deleteTask, loadTasks,
  parseTasks, restoreTask, saveTasks, updateTask,
} from "../src/tasks.js";

const fixedTime = new Date("2026-01-01T00:00:00.000Z");
const makeTask = () => createTask([], { title: " First task ", description: " Details " }, {
  id: "task-1", now: fixedTime,
});

test("archive and restore enforce eligibility", () => {
  const options = { now: new Date("2026-01-02T00:00:00.000Z") };
  for (const status of ["todo", "doing"]) {
    const tasks = updateTask(makeTask(), "task-1", { status }, options);
    assert.throws(() => archiveTask(tasks, "task-1", options), /done/);
    assert.throws(() => restoreTask(tasks, "task-1", options), /not archived/);
  }
  const done = updateTask(makeTask(), "task-1", { status: "done" }, options);
  assert.throws(() => restoreTask(done, "task-1", options), /not archived/);
  const archived = archiveTask(done, "task-1", options);
  assert.throws(() => archiveTask(archived, "task-1", options), /already archived/);
  assert.throws(() => archiveTask(done, "missing", options), /not found/);
  assert.throws(() => restoreTask(archived, "missing", options), /not found/);
});

test("archive and restore preserve history, persist, and keep deletion separate", () => {
  const done = updateTask(makeTask(), "task-1", { status: "done" }, {
    now: new Date("2026-01-02T00:00:00.000Z"),
  });
  const snapshot = structuredClone(done);
  Object.freeze(done[0]);
  Object.freeze(done);
  const archived = archiveTask(done, "task-1", {
    now: new Date("2026-01-03T00:00:00.000Z"),
  });
  assert.notStrictEqual(archived, done);
  assert.deepEqual(done, snapshot);
  assert.deepEqual(archived, [{ ...snapshot[0], archived: true,
    updatedAt: "2026-01-03T00:00:00.000Z" }]);
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  };
  saveTasks(storage, archived);
  assert.deepEqual(loadTasks(storage), archived);
  Object.freeze(archived[0]);
  Object.freeze(archived);
  const restored = restoreTask(archived, "task-1", {
    now: new Date("2026-01-04T00:00:00.000Z"),
  });
  assert.notStrictEqual(restored, archived);
  assert.equal(archived[0].archived, true);
  assert.deepEqual(restored, [{ ...snapshot[0], archived: false,
    updatedAt: "2026-01-04T00:00:00.000Z" }]);
  saveTasks(storage, restored);
  assert.deepEqual(loadTasks(storage), restored);
  assert.deepEqual(deleteTask(archived, "task-1"), []);
  assert.equal(archived.length, 1);
});

test("active counts exclude archives and recover after restore", () => {
  const tasks = ["todo", "doing", "done"].map((status) => ({
    ...makeTask()[0], id: status, status,
  }));
  const options = { now: new Date("2026-01-02T00:00:00.000Z") };
  assert.deepEqual(countActiveTasks([]), { todo: 0, doing: 0, done: 0 });
  assert.deepEqual(countActiveTasks(tasks), { todo: 1, doing: 1, done: 1 });
  const archived = archiveTask(tasks, "done", options);
  assert.deepEqual(countActiveTasks(archived), { todo: 1, doing: 1, done: 0 });
  assert.deepEqual(countActiveTasks(restoreTask(archived, "done", options)), {
    todo: 1, doing: 1, done: 1,
  });
  const legacy = { ...tasks[2] };
  delete legacy.archived;
  assert.deepEqual(countActiveTasks([legacy]), { todo: 0, doing: 0, done: 1 });
  const restored = restoreTask(archiveTask([legacy], "done", options), "done", options);
  assert.deepEqual(restored[0], { ...legacy, archived: false,
    updatedAt: options.now.toISOString() });
});

test("create task trims input and starts in todo", () => {
  assert.deepEqual(makeTask(), [{
    id: "task-1", title: "First task", description: "Details", status: "todo", archived: false,
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

test("legacy tasks load as active without rewriting storage", () => {
  const legacy = { ...makeTask()[0] };
  delete legacy.archived;
  const raw = JSON.stringify([legacy]);
  const memory = new Map([[STORAGE_KEY, raw]]);
  let writes = 0;
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => { writes += 1; memory.set(key, value); },
  };
  assert.deepEqual(loadTasks(storage), makeTask());
  assert.equal(memory.get(STORAGE_KEY), raw);
  assert.equal(writes, 0);
});

test("invalid archive data is rejected without changing saved storage", () => {
  const invalidTasks = [
    ...[null, 0, 1, "false", "true", {}, []].map((archived) => ({
      ...makeTask()[0], archived,
    })),
    ...["todo", "doing"].map((status) => ({ ...makeTask()[0], status, archived: true })),
  ];
  for (const task of invalidTasks) {
    const raw = JSON.stringify([task]);
    const memory = new Map([[STORAGE_KEY, raw]]);
    let writes = 0;
    const storage = {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => { writes += 1; memory.set(key, value); },
    };
    assert.throws(() => loadTasks(storage), /archived/);
    assert.throws(() => saveTasks(storage, [task]), /archived/);
    assert.equal(memory.get(STORAGE_KEY), raw);
    assert.equal(writes, 0);
  }
});

test("archive updates require done and boolean values without mutating tasks", () => {
  const original = makeTask();
  const options = { now: new Date("2026-01-02T00:00:00.000Z") };
  for (const status of ["todo", "doing"]) {
    const tasks = updateTask(original, "task-1", { status }, options);
    assert.throws(() => updateTask(tasks, "task-1", { archived: true }, options), /done/);
    assert.equal(tasks[0].archived, false);
  }
  for (const archived of [undefined, null, 0, "true", {}, []]) {
    assert.throws(() => updateTask(original, "task-1", { archived }, options), /boolean/);
  }
  assert.equal(original[0].archived, false);
});

test("archived tasks persist, preserve archive on edits, and restore to done", () => {
  const options = { now: new Date("2026-01-02T00:00:00.000Z") };
  const original = makeTask();
  const archived = updateTask(original, "task-1", { status: "done", archived: true }, options);
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  };
  saveTasks(storage, archived);
  assert.deepEqual(loadTasks(storage), archived);
  const edited = updateTask(archived, "task-1", { title: "Edited", description: "New details" }, options);
  assert.equal(edited[0].archived, true);
  assert.equal(archived[0].title, "First task");
  for (const status of ["todo", "doing"]) {
    assert.throws(() => updateTask(archived, "task-1", { status }, options), /done/);
  }
  const restored = updateTask(archived, "task-1", { archived: false }, options);
  assert.deepEqual(restored[0], { ...archived[0], archived: false });
  assert.equal(restored[0].status, "done");
  assert.equal(archived[0].archived, true);
  assert.equal(original[0].status, "todo");
});
