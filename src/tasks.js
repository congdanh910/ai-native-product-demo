export const STATUSES = Object.freeze(["todo", "doing", "done"]);
export const STORAGE_KEY = "ai-native-task-board:v1";

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
  return task;
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
    validateTask(task);
    if (ids.has(task.id)) throw new Error("Duplicate task id");
    ids.add(task.id);
    return task;
  });
}

export function serializeBackup(tasks) {
  const validatedTasks = parseTasks(JSON.stringify(tasks));
  return JSON.stringify({ version: 1, tasks: validatedTasks });
}

export function backupFilename(now = new Date()) {
  return `task-board-${now.toISOString().replace(/:/g, "-")}.json`;
}

export function parseBackup(raw) {
  let backup;
  try {
    backup = JSON.parse(raw);
  } catch {
    throw new Error("Backup contains malformed JSON");
  }
  if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
    throw new Error("Backup must be an object");
  }
  if (backup.version !== 1) {
    throw new Error("Unsupported backup version; expected version 1");
  }
  if (!Array.isArray(backup.tasks)) {
    throw new Error("Backup tasks must be a list");
  }
  return parseTasks(JSON.stringify(backup.tasks));
}

export function loadTasks(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  return raw === null ? [] : parseTasks(raw);
}

export function saveTasks(storage, tasks) {
  const ids = new Set();
  for (const task of tasks) {
    validateTask(task);
    if (ids.has(task.id)) throw new Error("Duplicate task id");
    ids.add(task.id);
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}
