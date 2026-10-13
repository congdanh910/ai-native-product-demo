export const STATUSES = Object.freeze(["todo", "doing", "done"]);
export const STORAGE_KEY = "ai-native-task-board:v1";

function validateDueDate(value) {
  if (value === null) return value;
  const error = "Task due date must be a real calendar date in YYYY-MM-DD format or null";
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(error);
  }
  const [year, month, day] = value.split("-").map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    throw new Error(error);
  }
  return value;
}

function inputDueDate(value) {
  return validateDueDate(value === undefined || value === "" ? null : value);
}

export function isOverdue(task, now) {
  if (task.status === "done" || task.dueDate == null) return false;
  const today = [
    String(now.getFullYear()).padStart(4, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  return task.dueDate < today;
}

export function validateTask(task) {
  if (!task || typeof task !== "object" || Array.isArray(task)) {
    throw new Error("Task must be an object");
  }
  if (typeof task.id !== "string" || !task.id.trim()) {
    throw new Error("Task id is required");
  }
  if (typeof task.title !== "string" || !task.title.trim()) {
    throw new Error("Task title is required");
  }
  if (typeof task.description !== "string") {
    throw new Error("Task description must be text");
  }
  if (!STATUSES.includes(task.status)) {
    throw new Error("Task status is invalid");
  }
  for (const field of ["createdAt", "updatedAt"]) {
    if (typeof task[field] !== "string" || Number.isNaN(Date.parse(task[field]))) {
      throw new Error(`Task ${field} is invalid`);
    }
  }
  const dueDate = validateDueDate(Object.hasOwn(task, "dueDate") ? task.dueDate : null);
  return { ...task, dueDate };
}

export function createTask(tasks, input, { id = crypto.randomUUID(), now = new Date() } = {}) {
  const title = String(input.title ?? "").trim();
  if (!title) throw new Error("Title is required");
  if (tasks.some((task) => task.id === id)) throw new Error("Task id already exists");
  const timestamp = now.toISOString();
  const task = validateTask({
    id,
    title,
    description: String(input.description ?? "").trim(),
    status: "todo",
    dueDate: inputDueDate(input.dueDate),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return [...tasks, task];
}

export function updateTask(tasks, id, changes, { now = new Date() } = {}) {
  if (!tasks.some((task) => task.id === id)) throw new Error("Task not found");
  const allowed = {};
  if (Object.hasOwn(changes, "title")) {
    allowed.title = String(changes.title ?? "").trim();
  }
  if (Object.hasOwn(changes, "description")) {
    allowed.description = String(changes.description ?? "").trim();
  }
  if (Object.hasOwn(changes, "status")) {
    allowed.status = changes.status;
  }
  if (Object.hasOwn(changes, "dueDate")) {
    allowed.dueDate = inputDueDate(changes.dueDate);
  }
  return tasks.map((task) => task.id === id
    ? validateTask({ ...task, ...allowed, updatedAt: now.toISOString() })
    : task);
}

export function deleteTask(tasks, id) {
  if (!tasks.some((task) => task.id === id)) throw new Error("Task not found");
  return tasks.filter((task) => task.id !== id);
}

export function parseTasks(raw) {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Saved tasks must be a list");
  const ids = new Set();
  return parsed.map((task) => {
    const validated = validateTask(task);
    if (ids.has(task.id)) throw new Error("Duplicate task id");
    ids.add(task.id);
    return validated;
  });
}

export function loadTasks(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  return raw === null ? [] : parseTasks(raw);
}

export function saveTasks(storage, tasks) {
  const ids = new Set();
  const validated = tasks.map((task) => {
    const normalized = validateTask(task);
    if (ids.has(task.id)) throw new Error("Duplicate task id");
    ids.add(task.id);
    return normalized;
  });
  storage.setItem(STORAGE_KEY, JSON.stringify(validated));
}
