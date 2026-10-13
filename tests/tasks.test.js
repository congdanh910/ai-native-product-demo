import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as taskModel from "../src/tasks.js";

import {
  STORAGE_KEY, backupFilename, createTask, deleteTask, loadTasks, parseBackup, parseTasks, saveTasks,
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

test("backup filename uses a deterministic ISO timestamp without colons", () => {
  const now = new Date("2026-10-13T09:08:07.006Z");
  assert.equal(backupFilename(now), "task-board-2026-10-13T09-08-07.006Z.json");
  assert.equal(backupFilename(fixedTime), "task-board-2026-01-01T00-00-00.000Z.json");
  assert.doesNotMatch(backupFilename(now), /[<>:"/\\|?*]/);
  assert.equal(now.toISOString(), "2026-10-13T09:08:07.006Z");
});

test("backup serialization rejects invalid tasks without mutating the input", () => {
  const tasks = [...makeTask(), ...makeTask()];
  const original = structuredClone(tasks);
  assert.throws(() => serializeBackup(tasks), /Duplicate task id/);
  assert.deepEqual(tasks, original);
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

function importHarness({ confirmed = true, saveFails = false } = {}) {
  function element() {
    return {
      children: [], listeners: {}, value: "", disabled: false,
      classList: { toggle() {} },
      addEventListener(type, handler) { this.listeners[type] = handler; },
      append(child) { this.children.push(child); },
      replaceChildren() { this.children = []; },
      setAttribute() {},
    };
  }
  const nodes = new Map();
  const document = {
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, element());
      return nodes.get(selector);
    },
    createElement: element,
  };
  const initial = makeTask();
  let saved = JSON.stringify(initial);
  let writes = 0;
  const confirmations = [];
  const context = vm.createContext({
    ...taskModel, document, Error,
    localStorage: {
      getItem: () => saved,
      setItem(key, value) {
        assert.equal(key, STORAGE_KEY);
        if (saveFails) throw new Error("Storage is full");
        writes += 1;
        saved = value;
      },
    },
    window: { confirm(text) { confirmations.push(text); return confirmed; } },
  });
  const source = readFileSync(new URL("../src/app.js", import.meta.url), "utf8")
    .replace(/^import\s*\{[\s\S]*?\}\s*from\s*"\.\/tasks\.js";\s*/, "");
  vm.runInContext(source, context);
  return {
    initial, confirmations, nodes,
    get tasks() { return JSON.parse(vm.runInContext("JSON.stringify(tasks)", context)); },
    get saved() { return saved; },
    get writes() { return writes; },
    async select(text, readFails = false) {
      const input = nodes.get("#import-json");
      input.value = "backup.json";
      input.files = [{ text: async () => {
        if (readFails) throw new Error("Could not read file");
        return text;
      } }];
      await input.listeners.change();
      assert.equal(input.value, "");
      assert.equal(input.disabled, false);
    },
  };
}

test("import validates before confirmation and leaves the board untouched on failure", async () => {
  const harness = importHarness();
  const saved = harness.saved;
  for (const text of [
    "{",
    JSON.stringify({ version: 2, tasks: [] }),
    JSON.stringify({ version: 1, tasks: [null] }),
    JSON.stringify({ version: 1, tasks: [...makeTask(), ...makeTask()] }),
  ]) {
    await harness.select(text);
    assert.deepEqual(harness.tasks, harness.initial);
    assert.equal(harness.saved, saved);
    assert.equal(harness.writes, 0);
    assert.equal(harness.confirmations.length, 0);
    assert.ok(harness.nodes.get("#message").textContent);
  }
  await harness.select("", true);
  assert.equal(harness.saved, saved);
  assert.deepEqual(harness.tasks, harness.initial);
  assert.equal(harness.confirmations.length, 0);
});

test("cancel and failed import save preserve current tasks and storage", async () => {
  for (const options of [{ confirmed: false }, { saveFails: true }]) {
    const harness = importHarness(options);
    const saved = harness.saved;
    await harness.select(serializeBackup([]));
    assert.match(harness.confirmations[0], /0 tasks.*Replace the entire current board/);
    assert.deepEqual(harness.tasks, harness.initial);
    assert.equal(harness.saved, saved);
    assert.equal(harness.writes, 0);
    assert.equal(harness.nodes.get("#todo-count").textContent, "1");
  }
});

test("confirmed imports replace storage and render populated and empty boards", async () => {
  const harness = importHarness();
  const imported = [{ ...makeTask()[0], id: "restored", status: "done", title: "Café 日本語" }];
  for (const tasks of [imported, []]) {
    await harness.select(serializeBackup(tasks));
    assert.deepEqual(harness.tasks, tasks);
    assert.deepEqual(JSON.parse(harness.saved), tasks);
    assert.equal(harness.nodes.get("#todo-count").textContent, "0");
    assert.equal(harness.nodes.get("#done-count").textContent, String(tasks.length));
  }
  assert.equal(harness.writes, 2);
  assert.match(harness.confirmations[0], /1 task\./);
  assert.match(harness.confirmations[1], /0 tasks\./);
});
