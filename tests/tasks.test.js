import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
    priority: "Medium",
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

test("TC-3: stored task without priority parses as Medium", () => {
  const storedTask = {
    id: "task-1",
    title: "Existing task",
    description: "Stored before priorities",
    status: "doing",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };

  assert.deepEqual(parseTasks(JSON.stringify([storedTask])), [
    { ...storedTask, priority: "Medium" },
  ]);
});

test("TC-4: creation form offers Low, Medium, and High with Medium selected", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const form = html.match(/<form\b(?=[^>]*\bid=["']create-form["'])[^>]*>([\s\S]*?)<\/form>/i);
  assert.ok(form, "creation form exists");

  const select = form[1].match(/<select\b(?=[^>]*\bname=["']priority["'])[^>]*>([\s\S]*?)<\/select>/i);
  assert.ok(select, "creation form has a priority selector");

  const options = [...select[1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)]
    .map(([, attributes, label]) => ({
      value: attributes.match(/\bvalue=["']([^"']*)["']/i)?.[1],
      label: label.trim(),
      selected: /\bselected(?:\s|=|$)/i.test(attributes),
    }));

  assert.deepEqual(options.map(({ value, label }) => ({ value, label })), [
    { value: "Low", label: "Low" },
    { value: "Medium", label: "Medium" },
    { value: "High", label: "High" },
  ]);
  assert.deepEqual(options.map((option) => option.selected), [false, true, false]);
});

test("TC-5: a High-priority task card displays a styled High label", async () => {
  class Element {
    constructor(tagName = "div") {
      this.tagName = tagName;
      this.children = [];
      this.className = "";
      this.attributes = new Map();
      this.ownText = "";
      this.classList = {
        add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(" "); },
      };
    }

    set textContent(value) { this.ownText = String(value); this.children = []; }
    get textContent() {
      return this.ownText + this.children.map((child) => child.textContent).join("");
    }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; this.ownText = ""; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    addEventListener() {}
  }

  const elements = new Map([
    "#create-form", "#edit-form", "#edit-dialog", "#message", "#cancel-edit",
    "#todo-list", "#doing-list", "#done-list",
    "#todo-count", "#doing-count", "#done-count",
  ].map((selector) => [selector, new Element()]));
  const task = {
    id: "task-high", title: "Review proposal", description: "Read the draft",
    status: "todo", priority: "High",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const previousDocument = globalThis.document;
  const previousStorage = globalThis.localStorage;
  globalThis.document = {
    querySelector: (selector) => elements.get(selector) ?? null,
    createElement: (tagName) => new Element(tagName),
  };
  globalThis.localStorage = {
    getItem: (key) => key === STORAGE_KEY ? JSON.stringify([task]) : null,
  };

  try {
    await import("../src/app.js");
    const [card] = elements.get("#todo-list").children;
    assert.equal(card?.className, "task-card", "task renders in the To do column");

    const descendants = (node) => node.children.flatMap((child) => [child, ...descendants(child)]);
    const priorityLabel = descendants(card).find((element) =>
      element.textContent === "High" && element.children.length === 0);
    assert.ok(priorityLabel, "card contains a visible High priority label");
    assert.ok(priorityLabel.className.trim(), "priority label has a class for consistent styling");
    assert.equal(priorityLabel.getAttribute("hidden"), null, "priority label is not hidden");
    assert.notEqual(priorityLabel.getAttribute("aria-hidden"), "true", "priority label is exposed to users");
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
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
