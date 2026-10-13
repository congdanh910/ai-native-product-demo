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

async function renderedColumnTitles(storedTasks, caseId) {
  class Element {
    constructor() {
      this.children = [];
      this.className = "";
      this.ownText = "";
    }

    set textContent(value) { this.ownText = String(value); this.children = []; }
    get textContent() {
      return this.ownText + this.children.map((child) => child.textContent).join("");
    }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; this.ownText = ""; }
    setAttribute() {}
    addEventListener() {}
  }

  const elements = new Map([
    "#create-form", "#edit-form", "#edit-dialog", "#message", "#cancel-edit",
    "#todo-list", "#doing-list", "#done-list",
    "#todo-count", "#doing-count", "#done-count",
  ].map((selector) => [selector, new Element()]));
  const previousDocument = globalThis.document;
  const previousStorage = globalThis.localStorage;
  globalThis.document = {
    querySelector: (selector) => elements.get(selector) ?? null,
    createElement: () => new Element(),
  };
  globalThis.localStorage = {
    getItem: (key) => key === STORAGE_KEY ? JSON.stringify(storedTasks) : null,
  };

  try {
    await import(`../src/app.js?${caseId}`);
    return Object.fromEntries(["todo", "doing", "done"].map((status) => [
      status,
      elements.get(`#${status}-list`).children
        .filter((card) => card.className === "task-card")
        .map((card) => card.children[0].textContent),
    ]));
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
}

test("TC-6: each column renders High, Medium, then Low priority", async () => {
  const timestamp = "2026-01-01T00:00:00.000Z";
  const task = (id, status, priority) => ({
    id, title: id, description: "", status, priority,
    createdAt: timestamp, updatedAt: timestamp,
  });
  const columns = await renderedColumnTitles([
    task("todo-low", "todo", "Low"),
    task("doing-medium", "doing", "Medium"),
    task("todo-medium", "todo", "Medium"),
    task("doing-low", "doing", "Low"),
    task("todo-high", "todo", "High"),
    task("doing-high", "doing", "High"),
  ], "tc-6");

  assert.deepEqual(columns.todo, ["todo-high", "todo-medium", "todo-low"]);
  assert.deepEqual(columns.doing, ["doing-high", "doing-medium", "doing-low"]);
});

test("TC-7: equal priorities sort by creation time, then ascending ID", async () => {
  const task = (id, createdAt) => ({
    id, title: id, description: "", status: "todo", priority: "Medium",
    createdAt, updatedAt: createdAt,
  });
  const columns = await renderedColumnTitles([
    task("task-b", "2026-01-02T00:00:00.000Z"),
    task("task-a", "2026-01-02T00:00:00.000Z"),
    task("task-z", "2026-01-01T00:00:00.000Z"),
  ], "tc-7");

  assert.deepEqual(columns.todo, ["task-z", "task-a", "task-b"]);
});

test("TC-8: changing priority saves the task and immediately reorders the board", async () => {
  class Element {
    constructor() {
      this.children = [];
      this.className = "";
      this.ownText = "";
      this.listeners = new Map();
      this.elements = {};
      this.classList = {
        toggle: () => {},
        contains: () => false,
      };
    }

    set textContent(value) { this.ownText = String(value); this.children = []; }
    get textContent() {
      return this.ownText + this.children.map((child) => child.textContent).join("");
    }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; this.ownText = ""; }
    setAttribute(name, value) { this[name] = String(value); }
    addEventListener(name, handler) { this.listeners.set(name, handler); }
    dispatch(name) { this.listeners.get(name)?.({ preventDefault() {} }); }
    showModal() {}
    close() {}
  }

  const elements = new Map([
    "#create-form", "#edit-form", "#edit-dialog", "#message", "#cancel-edit",
    "#todo-list", "#doing-list", "#done-list",
    "#todo-count", "#doing-count", "#done-count",
  ].map((selector) => [selector, new Element()]));
  const editForm = elements.get("#edit-form");
  editForm.elements = Object.fromEntries(["id", "title", "description", "priority"]
    .map((name) => [name, { value: "" }]));

  const timestamp = "2026-01-01T00:00:00.000Z";
  const storedTasks = [
    { id: "task-low", title: "Low task", description: "", status: "todo", priority: "Low",
      createdAt: timestamp, updatedAt: timestamp },
    { id: "task-medium", title: "Medium task", description: "", status: "todo", priority: "Medium",
      createdAt: timestamp, updatedAt: timestamp },
  ];
  const writes = [];
  const previousDocument = globalThis.document;
  const previousStorage = globalThis.localStorage;
  const previousFormData = globalThis.FormData;
  globalThis.document = {
    querySelector: (selector) => elements.get(selector) ?? null,
    createElement: () => new Element(),
  };
  globalThis.localStorage = {
    getItem: (key) => key === STORAGE_KEY ? JSON.stringify(storedTasks) : null,
    setItem: (key, value) => writes.push([key, value]),
  };
  globalThis.FormData = class {
    constructor(form) { this.form = form; }
    get(name) { return this.form.elements[name]?.value ?? null; }
  };

  try {
    await import("../src/app.js?tc-8");
    const titles = () => elements.get("#todo-list").children.map((card) => card.children[0].textContent);
    assert.deepEqual(titles(), ["Medium task", "Low task"]);

    const lowCard = elements.get("#todo-list").children[1];
    const editButton = lowCard.children.at(-1).children.find((control) => control.textContent === "Edit");
    assert.ok(editButton, "Low task has an edit button");
    editButton.dispatch("click");
    editForm.elements.priority.value = "High";
    editForm.dispatch("submit");

    assert.equal(writes.length, 1, "the change is saved once");
    assert.equal(writes[0][0], STORAGE_KEY);
    const savedTasks = JSON.parse(writes[0][1]);
    assert.equal(savedTasks.find((task) => task.id === "task-low").priority, "High");
    assert.deepEqual(titles(), ["Low task", "Medium task"], "the board reorders without reloading");
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
    if (previousFormData === undefined) delete globalThis.FormData;
    else globalThis.FormData = previousFormData;
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
