import assert from "node:assert/strict";
import test from "node:test";

import {
  STORAGE_KEY, createTask, deleteTask, loadTasks, parseTasks, saveTasks, sortTasks, updateTask,
} from "../src/tasks.js";

const fixedTime = new Date("2026-01-01T00:00:00.000Z");
const makeTask = () => createTask([], { title: " First task ", description: " Details " }, {
  id: "task-1", now: fixedTime,
});

test("create task trims input and starts in todo", () => {
  assert.deepEqual(makeTask(), [{
    id: "task-1", title: "First task", description: "Details", status: "todo",
    priority: "Medium",
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

test("create and update accept all priorities and reject unknown input values", () => {
  for (const priority of ["High", "Medium", "Low"]) {
    const tasks = createTask([], { title: "Task", priority }, { id: "task-1", now: fixedTime });
    assert.equal(tasks[0].priority, priority);
    assert.equal(updateTask(makeTask(), "task-1", { priority }, { now: fixedTime })[0].priority, priority);
  }
  for (const priority of ["Urgent", "high", "", null, undefined, 1]) {
    assert.throws(() => createTask([], { title: "Task", priority }, {
      id: "task-1", now: fixedTime,
    }), /priority/);
    assert.throws(() => updateTask(makeTask(), "task-1", { priority }, { now: fixedTime }), /priority/);
  }
});

test("priority changes are immutable and unrelated edits and moves retain priority", () => {
  const original = Object.freeze(makeTask().map(Object.freeze));
  const changed = updateTask(original, "task-1", { priority: "High" }, {
    now: new Date("2026-01-02T00:00:00.000Z"),
  });
  assert.notStrictEqual(changed, original);
  assert.notStrictEqual(changed[0], original[0]);
  assert.equal(original[0].priority, "Medium");
  assert.equal(changed[0].priority, "High");
  assert.equal(changed[0].createdAt, original[0].createdAt);
  assert.equal(changed[0].updatedAt, "2026-01-02T00:00:00.000Z");
  const moved = updateTask(changed, "task-1", {
    title: "Edited", description: "New details", status: "done",
  }, { now: fixedTime });
  assert.equal(moved[0].priority, "High");
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  };
  saveTasks(storage, moved);
  assert.deepEqual(loadTasks(storage), moved);
});

test("legacy saved tasks load as Medium without writing storage", () => {
  const { priority, ...legacy } = makeTask()[0];
  const raw = JSON.stringify([legacy, { ...legacy, id: "task-2", priority: "Low" }]);
  const storage = {
    getItem: (key) => {
      assert.equal(key, STORAGE_KEY);
      return raw;
    },
    setItem: () => assert.fail("Loading must not rewrite storage"),
    removeItem: () => assert.fail("Loading must not erase storage"),
  };
  const expected = [{ ...legacy, priority: "Medium" }, { ...legacy, id: "task-2", priority: "Low" }];
  assert.deepEqual(parseTasks(raw), expected);
  assert.deepEqual(loadTasks(storage), expected);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
});

test("invalid stored priorities are reported without modifying saved data", () => {
  for (const priority of ["Urgent", "medium", "", null, 1]) {
    const raw = JSON.stringify([{ ...makeTask()[0], priority }]);
    const memory = new Map([[STORAGE_KEY, raw]]);
    const storage = {
      getItem: (key) => memory.get(key) ?? null,
      setItem: () => assert.fail("Invalid storage must not be rewritten"),
      removeItem: () => assert.fail("Invalid storage must not be erased"),
    };
    assert.throws(() => parseTasks(raw), /priority/);
    assert.throws(() => loadTasks(storage), /priority/);
    assert.throws(() => saveTasks(storage, [{ ...makeTask()[0], priority }]), /priority/);
    assert.equal(memory.get(STORAGE_KEY), raw);
  }
});

test("sorting orders priorities, creation times, and lexical IDs without mutation", () => {
  const task = (id, priority, createdAt) => Object.freeze({
    ...makeTask()[0], id, priority, createdAt,
  });
  const earlier = "2025-12-31T00:00:00.000Z";
  const later = fixedTime.toISOString();
  const tasks = Object.freeze([
    task("low", "Low", earlier),
    task("high-z", "High", later),
    task("medium-new", "Medium", later),
    task("high-a", "High", "2026-01-01T01:00:00.000+01:00"),
    task("medium-old", "Medium", earlier),
    task("high-old", "High", earlier),
  ]);
  const original = [...tasks];
  const sorted = sortTasks(tasks);
  assert.deepEqual(sorted.map(({ id }) => id), [
    "high-old", "high-a", "high-z", "medium-old", "medium-new", "low",
  ]);
  assert.notStrictEqual(sorted, tasks);
  assert.deepEqual(tasks, original);
  for (const item of sorted) assert.strictEqual(item, tasks.find(({ id }) => id === item.id));
  assert.deepEqual(sortTasks(sorted), sorted);
  const empty = [];
  assert.deepEqual(sortTasks(empty), []);
  assert.notStrictEqual(sortTasks(empty), empty);
});

test("column sorting reflects priority edits and moves without changing saved order", () => {
  const tasks = [
    { ...makeTask()[0], id: "todo-low", priority: "Low" },
    { ...makeTask()[0], id: "todo-medium" },
    { ...makeTask()[0], id: "doing-high-z", status: "doing", priority: "High" },
    { ...makeTask()[0], id: "doing-high-a", status: "doing", priority: "High" },
    { ...makeTask()[0], id: "doing-medium", status: "doing" },
  ];
  const columnIds = (current, status) => sortTasks(
    current.filter((task) => task.status === status),
  ).map((task) => task.id);
  assert.deepEqual(columnIds(tasks, "todo"), ["todo-medium", "todo-low"]);
  assert.deepEqual(columnIds(tasks, "doing"), [
    "doing-high-a", "doing-high-z", "doing-medium",
  ]);

  const edited = updateTask(tasks, "todo-low", { priority: "High" }, { now: fixedTime });
  assert.deepEqual(columnIds(edited, "todo"), ["todo-low", "todo-medium"]);
  assert.equal(tasks[0].priority, "Low");

  const moved = updateTask(edited, "todo-low", { status: "doing" }, { now: fixedTime });
  const beforeRender = JSON.stringify(moved);
  let saved;
  const storage = {
    setItem: (key, value) => {
      assert.equal(key, STORAGE_KEY);
      saved = value;
    },
    getItem: () => saved,
  };
  saveTasks(storage, moved);
  assert.deepEqual(columnIds(moved, "todo"), ["todo-medium"]);
  assert.deepEqual(columnIds(moved, "doing"), [
    "doing-high-a", "doing-high-z", "todo-low", "doing-medium",
  ]);
  assert.deepEqual(columnIds(moved, "done"), []);
  assert.equal(moved[0].priority, "High");
  assert.equal(JSON.stringify(moved), beforeRender);
  assert.equal(saved, beforeRender);
  assert.deepEqual(loadTasks(storage), moved);
  assert.deepEqual(moved.map((task) => task.id), tasks.map((task) => task.id));
});
