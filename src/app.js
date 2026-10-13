import { PRIORITY_OPTIONS, STATUSES, createTask, deleteTask, loadTasks, saveTasks, updateTask } from "./tasks.js";

const createForm = document.querySelector("#create-form");
const editForm = document.querySelector("#edit-form");
const editDialog = document.querySelector("#edit-dialog");
const message = document.querySelector("#message");
let tasks = [];

function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function applyChange(change, successMessage) {
  try {
    const updated = change(tasks);
    saveTasks(localStorage, updated);
    tasks = updated;
    render();
    showMessage(successMessage);
  } catch (error) {
    showMessage(error instanceof Error ? error.message : "Could not save task", true);
  }
}

function createCard(task) {
  const card = document.createElement("article");
  card.className = "task-card";
  const title = document.createElement("h3");
  title.textContent = task.title;
  card.append(title);
  const priority = document.createElement("span");
  priority.className = "priority-label";
  priority.textContent = task.priority;
  priority.setAttribute("style", "display: inline-block; margin-bottom: .6rem; padding: .2rem .55rem; border-radius: 999px; background: #e5eff7; color: #17324d; font-size: .85rem; font-weight: 700;");
  card.append(priority);
  if (task.description) {
    const description = document.createElement("p");
    description.textContent = task.description;
    card.append(description);
  }

  const controls = document.createElement("div");
  controls.className = "task-controls";
  const label = document.createElement("label");
  label.textContent = "Status ";
  const select = document.createElement("select");
  select.setAttribute("aria-label", `Status for ${task.title}`);
  for (const status of STATUSES) {
    const option = document.createElement("option");
    option.value = status;
    option.textContent = status === "todo" ? "To do" : status === "doing" ? "Doing" : "Done";
    select.append(option);
  }
  select.value = task.status;
  select.addEventListener("change", () => applyChange(
    (current) => updateTask(current, task.id, { status: select.value }),
    "Task moved",
  ));
  label.append(select);
  controls.append(label);

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "secondary";
  edit.textContent = "Edit";
  edit.setAttribute("aria-label", `Edit ${task.title}`);
  edit.addEventListener("click", () => {
    editForm.elements.id.value = task.id;
    editForm.elements.title.value = task.title;
    editForm.elements.description.value = task.description;
    editDialog.showModal();
  });
  controls.append(edit);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "danger";
  remove.textContent = "Delete";
  remove.setAttribute("aria-label", `Delete ${task.title}`);
  remove.addEventListener("click", () => {
    if (window.confirm(`Delete “${task.title}”?`)) {
      applyChange((current) => deleteTask(current, task.id), "Task deleted");
    }
  });
  controls.append(remove);
  card.append(controls);
  return card;
}

function render() {
  for (const status of STATUSES) {
    const list = document.querySelector(`#${status}-list`);
    list.replaceChildren();
    const visible = tasks.filter((task) => task.status === status).sort((a, b) =>
      PRIORITY_OPTIONS.indexOf(b.priority) - PRIORITY_OPTIONS.indexOf(a.priority)
      || Date.parse(a.createdAt) - Date.parse(b.createdAt)
      || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    document.querySelector(`#${status}-count`).textContent = String(visible.length);
    if (visible.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No tasks yet";
      list.append(empty);
    } else {
      for (const task of visible) list.append(createCard(task));
    }
  }
}

createForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = new FormData(createForm);
  applyChange(
    (current) => createTask(current, {
      title: input.get("title"), description: input.get("description"),
    }),
    "Task added",
  );
  if (!message.classList.contains("error")) createForm.reset();
});

editForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = new FormData(editForm);
  applyChange(
    (current) => updateTask(current, input.get("id"), {
      title: input.get("title"), description: input.get("description"),
    }),
    "Task updated",
  );
  if (!message.classList.contains("error")) editDialog.close();
});

document.querySelector("#cancel-edit").addEventListener("click", () => editDialog.close());

try {
  tasks = loadTasks(localStorage);
} catch (error) {
  showMessage("Saved tasks are invalid. No changes were made to local storage.", true);
}
render();
