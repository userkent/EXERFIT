/* FILE PURPOSE: Creates, edits, completes, and deletes indoor workout plans. */
/* =========================================================
   FILE: workout-planner.js
   PURPOSE: Creates, edits, completes, and deletes indoor workout plans.
   Exercises are stored as structured sets/reps/duration/rest details.
========================================================= */
import { getUserData, saveUserData, createId } from "./storage.js";
import { openModal, showToast, escapeHTML, refreshIcons } from "./ui.js";

let editingWorkoutId = null;
let reminderTimer = null;
let reminderAudioContext = null;
const categories = [
  "Strength Training",
  "Cardio",
  "Flexibility",
  "Core",
  "Full Body",
  "Upper Body",
  "Lower Body",
];

function toLocalDateTimeValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function unlockReminderAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  try {
    if (!reminderAudioContext) reminderAudioContext = new AudioContextClass();
    if (reminderAudioContext.state === "suspended")
      reminderAudioContext.resume().catch(() => {});
    return reminderAudioContext;
  } catch (error) {
    console.warn(
      "Workout reminder sound is unavailable in this browser.",
      error,
    );
    return null;
  }
}

function playWorkoutAlarm() {
  const context = unlockReminderAudio();
  if (!context) return;
  const scheduleBeeps = () => {
    if (context.state !== "running") return;
    const startAt = context.currentTime + 0.05;
    [0, 0.42, 0.84].forEach((offset) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, startAt + offset);
      gain.gain.setValueAtTime(0.0001, startAt + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, startAt + offset + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.24);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt + offset);
      oscillator.stop(startAt + offset + 0.26);
    });
  };
  if (context.state === "suspended")
    context
      .resume()
      .then(scheduleBeeps)
      .catch(() => {});
  else scheduleBeeps();
}

function notifyWorkoutReminder(workout) {
  const title = `Time for ${workout.name}`;
  const body = `Your ${workout.category || "workout"} reminder is due now.`;
  playWorkoutAlarm();
  showToast(`${title}. ${body}`, "success", 9000);
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(title, { body, tag: `exerfit-${workout.id}` });
    } catch (error) {
      console.warn("Workout notification could not be displayed.", error);
    }
  }
}

function checkWorkoutReminders() {
  const data = getUserData();
  const now = Date.now();
  let changed = false;
  const due = [];
  (data.workouts || []).forEach((workout) => {
    if (
      !workout.reminderAt ||
      workout.reminderFiredAt ||
      workout.status === "completed"
    )
      return;
    const dueAt = new Date(workout.reminderAt).getTime();
    if (!Number.isFinite(dueAt) || dueAt > now) return;
    workout.reminderFiredAt = new Date().toISOString();
    changed = true;
    // A reminder more than 30 minutes late is marked as handled but is not sounded belatedly.
    if (now - dueAt <= 30 * 60 * 1000) due.push(workout);
  });
  if (changed) saveUserData(data);
  due.forEach(notifyWorkoutReminder);
}

function startReminderMonitor() {
  if (reminderTimer) return;
  reminderTimer = window.setInterval(checkWorkoutReminders, 15000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkWorkoutReminders();
  });
  document.addEventListener("pointerdown", unlockReminderAudio, {
    once: true,
    passive: true,
  });
  checkWorkoutReminders();
}

function exerciseRow(exercise = {}) {
  return `<div class="exercise-row list-card" style="padding:11px;margin-bottom:8px">
    <div class="form-field"><label>Exercise name</label><input class="exercise-name" maxlength="70" placeholder="e.g. Squats" value="${escapeHTML(exercise.name || "")}" required></div>
    <div class="form-row"><div class="form-field"><label>Sets</label><input class="exercise-sets" type="number" min="1" max="99" value="${Number(exercise.sets) || 3}"></div><div class="form-field"><label>Reps</label><input class="exercise-reps" type="number" min="1" max="999" value="${Number(exercise.reps) || 10}"></div></div>
    <div class="form-row"><div class="form-field"><label>Duration (min)</label><input class="exercise-duration" type="number" min="0" max="600" value="${Number(exercise.duration) || 0}"></div><div class="form-field"><label>Rest (sec)</label><input class="exercise-rest" type="number" min="0" max="3600" value="${Number(exercise.rest) || 60}"></div></div>
    <div class="form-field"><label>Notes</label><input class="exercise-notes" maxlength="140" placeholder="Optional form or technique notes" value="${escapeHTML(exercise.notes || "")}"></div>
    <button type="button" class="button button-danger remove-exercise" style="min-height:30px;padding:0 9px;font-size:9px"><i data-lucide="trash-2"></i> Remove exercise</button>
  </div>`;
}

function collectExercises(container) {
  return [...container.querySelectorAll(".exercise-row")]
    .map((row) => ({
      name: row.querySelector(".exercise-name").value.trim(),
      sets: Number(row.querySelector(".exercise-sets").value) || 0,
      reps: Number(row.querySelector(".exercise-reps").value) || 0,
      duration: Number(row.querySelector(".exercise-duration").value) || 0,
      rest: Number(row.querySelector(".exercise-rest").value) || 0,
      notes: row.querySelector(".exercise-notes").value.trim(),
    }))
    .filter((exercise) => exercise.name);
}

export function mountWorkoutPanel(container) {
  const workouts = getUserData().workouts;
  const list = workouts.length
    ? workouts
        .slice()
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .map(
          (workout) => `
    <article class="list-card"><div class="list-card-top"><div><h3>${escapeHTML(workout.name)}</h3><p>${escapeHTML(workout.category)} · ${new Date(`${workout.date}T00:00:00`).toLocaleDateString()}</p></div><span class="recording-status ${workout.status === "completed" ? "" : "paused"}">${workout.status === "completed" ? "Completed" : "Planned"}</span></div>
    <div class="list-card-meta"><span><i data-lucide="list-checks"></i>${(workout.exercises || []).length} exercises</span><span><i data-lucide="clock"></i>${(workout.exercises || []).reduce((sum, item) => sum + Number(item.duration || 0), 0)} min listed</span></div>
    ${workout.reminderAt && !workout.reminderFiredAt && workout.status !== "completed" ? `<p class="workout-reminder-note"><i data-lucide="alarm-clock"></i> Reminder: ${escapeHTML(new Date(workout.reminderAt).toLocaleString())}</p>` : workout.reminderFiredAt ? `<p class="workout-reminder-note is-done"><i data-lucide="bell-ring"></i> Reminder already sent</p>` : ""}
    <div class="list-card-actions"><button class="button button-secondary" type="button" data-edit-workout="${escapeHTML(workout.id)}"><i data-lucide="pencil"></i> Edit</button>${workout.status !== "completed" ? `<button class="button button-primary" type="button" data-complete-workout="${escapeHTML(workout.id)}"><i data-lucide="check"></i> Complete</button>` : ""}<button class="button button-danger" type="button" data-delete-workout="${escapeHTML(workout.id)}"><i data-lucide="trash-2"></i> Delete</button></div></article>`,
        )
        .join("")
    : `<div class="empty-state"><i data-lucide="dumbbell"></i><strong>No workout plans yet</strong><p>Create a home or gym routine and add exercises, sets, reps, rest time, and notes.</p></div>`;
  container.innerHTML = `
    <p class="panel-intro">Build a simple routine for the gym or at home. Add as many exercises as you need.</p>
    <form id="workout-form" class="panel-section">
      <div class="panel-section-title"><span id="workout-form-title">Create a workout</span><small>Workout details</small></div>
      <div class="form-field"><label for="workout-name">Workout name</label><input id="workout-name" maxlength="70" placeholder="e.g. Full body day" required></div>
      <div class="form-row"><div class="form-field"><label for="workout-category">Category</label><select id="workout-category">${categories.map((category) => `<option>${category}</option>`).join("")}</select></div><div class="form-field"><label for="workout-date">Date</label><input id="workout-date" type="date" value="${new Date().toISOString().slice(0, 10)}" required></div></div>
      <div class="panel-section-title"><span>Exercises</span><small>Sets, reps, rest</small></div><div id="exercise-list">${exerciseRow()}</div>
      <button class="button button-secondary" id="add-exercise" type="button" style="width:100%;margin:3px 0 10px"><i data-lucide="plus"></i> Add exercise</button>
      <div class="form-field"><label for="workout-notes">Workout notes</label><textarea id="workout-notes" placeholder="Optional notes for this routine"></textarea></div>
      <div class="workout-reminder-box"><div class="form-field"><label for="workout-reminder">Reminder date and time (optional)</label><input id="workout-reminder" type="datetime-local"></div><p>ExerFit can play a sound and show an alert while this page is open. Keep the app open for the reminder to run.</p><div class="form-inline workout-reminder-actions"><button class="button button-secondary" id="workout-test-alarm" type="button"><i data-lucide="volume-2"></i> Test alarm</button><button class="button button-secondary" id="workout-enable-notifications" type="button"><i data-lucide="bell"></i> Enable browser alerts</button></div></div>
      <div class="form-inline"><button class="button button-primary" type="submit"><i data-lucide="save"></i> Save workout</button><button class="button button-secondary" id="cancel-workout-edit" type="button" ${editingWorkoutId ? "" : "hidden"}>Cancel edit</button></div>
    </form>
    <section><div class="panel-section-title"><span>Saved workouts</span><small>${workouts.length} plans</small></div><div class="panel-list">${list}</div></section>`;
  container.dataset.panel = "workouts";
  startReminderMonitor();
  refreshIcons(container);
  // Restore the edit form if the user switches to another panel and comes back.
  if (editingWorkoutId) {
    const editing = workouts.find((item) => item.id === editingWorkoutId);
    if (editing) {
      container.querySelector("#workout-name").value = editing.name;
      container.querySelector("#workout-category").value = editing.category;
      container.querySelector("#workout-date").value = editing.date;
      container.querySelector("#workout-notes").value = editing.notes || "";
      container.querySelector("#workout-reminder").value = toLocalDateTimeValue(
        editing.reminderAt,
      );
      container.querySelector("#exercise-list").innerHTML = (
        editing.exercises || []
      )
        .map(exerciseRow)
        .join("");
      container.querySelector("#workout-form-title").textContent =
        "Edit workout";
      container.querySelector("#cancel-workout-edit").hidden = false;
      refreshIcons(container);
    } else editingWorkoutId = null;
  }
  const form = container.querySelector("#workout-form");
  container
    .querySelector("#workout-test-alarm")
    ?.addEventListener("click", () => {
      unlockReminderAudio();
      playWorkoutAlarm();
      showToast("Workout alarm sound test.", "info", 2500);
    });
  const notificationButton = container.querySelector(
    "#workout-enable-notifications",
  );
  if (notificationButton) {
    if (!("Notification" in window)) notificationButton.disabled = true;
    notificationButton.addEventListener("click", async () => {
      unlockReminderAudio();
      if (!("Notification" in window)) {
        showToast(
          "Browser notifications are not supported here. The in-page sound can still work while ExerFit is open.",
          "warning",
          5000,
        );
        return;
      }
      try {
        const permission = await Notification.requestPermission();
        showToast(
          permission === "granted"
            ? "Browser workout alerts are enabled."
            : "Browser alerts were not enabled. The in-page alarm works while ExerFit is open.",
          permission === "granted" ? "success" : "info",
          4500,
        );
      } catch (error) {
        showToast(
          "Could not request browser notification permission in this browser.",
          "warning",
          4000,
        );
      }
    });
  }
  container.querySelector("#add-exercise").addEventListener("click", () => {
    container
      .querySelector("#exercise-list")
      .insertAdjacentHTML("beforeend", exerciseRow());
    refreshIcons(container.querySelector("#exercise-list"));
  });
  container
    .querySelector("#exercise-list")
    .addEventListener("click", (event) => {
      if (event.target.closest(".remove-exercise")) {
        const rows = container.querySelectorAll(".exercise-row");
        if (rows.length <= 1) {
          showToast("Keep at least one exercise row.", "warning");
          return;
        }
        event.target.closest(".exercise-row").remove();
      }
    });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = container.querySelector("#workout-name").value.trim();
    const exercises = collectExercises(container);
    const reminderValue = container.querySelector("#workout-reminder").value;
    if (reminderValue && !Number.isFinite(new Date(reminderValue).getTime())) {
      showToast("Choose a valid reminder date and time.", "warning");
      return;
    }
    unlockReminderAudio();
    if (!name || !exercises.length) {
      showToast("Enter a workout name and at least one exercise.", "warning");
      return;
    }
    const data = getUserData();
    if (editingWorkoutId) {
      const existing = data.workouts.find(
        (item) => item.id === editingWorkoutId,
      );
      if (existing)
        Object.assign(existing, {
          name,
          category: container.querySelector("#workout-category").value,
          date: container.querySelector("#workout-date").value,
          exercises,
          notes: container.querySelector("#workout-notes").value.trim(),
          reminderAt: reminderValue
            ? new Date(reminderValue).toISOString()
            : null,
          reminderFiredAt: null,
          updatedAt: new Date().toISOString(),
        });
    } else {
      data.workouts.unshift({
        id: createId("workout"),
        name,
        category: container.querySelector("#workout-category").value,
        date: container.querySelector("#workout-date").value,
        exercises,
        notes: container.querySelector("#workout-notes").value.trim(),
        reminderAt: reminderValue
          ? new Date(reminderValue).toISOString()
          : null,
        reminderFiredAt: null,
        status: "planned",
        createdAt: new Date().toISOString(),
      });
    }
    saveUserData(data);
    editingWorkoutId = null;
    mountWorkoutPanel(container);
    showToast("Workout plan saved.", "success");
  });
  container
    .querySelector("#cancel-workout-edit")
    ?.addEventListener("click", () => {
      editingWorkoutId = null;
      mountWorkoutPanel(container);
    });
  container.querySelectorAll("[data-edit-workout]").forEach((button) =>
    button.addEventListener("click", () => {
      const workout = workouts.find(
        (item) => item.id === button.dataset.editWorkout,
      );
      if (!workout) return;
      editingWorkoutId = workout.id;
      container.querySelector("#workout-name").value = workout.name;
      container.querySelector("#workout-category").value = workout.category;
      container.querySelector("#workout-date").value = workout.date;
      container.querySelector("#workout-notes").value = workout.notes || "";
      container.querySelector("#workout-reminder").value = toLocalDateTimeValue(
        workout.reminderAt,
      );
      container.querySelector("#exercise-list").innerHTML = (
        workout.exercises || []
      )
        .map(exerciseRow)
        .join("");
      container.querySelector("#workout-form-title").textContent =
        "Edit workout";
      container.querySelector("#cancel-workout-edit").hidden = false;
      refreshIcons(container);
      container
        .querySelector("#workout-name")
        .scrollIntoView({ behavior: "smooth", block: "center" });
    }),
  );
  container.querySelectorAll("[data-complete-workout]").forEach((button) =>
    button.addEventListener("click", () => {
      const data = getUserData();
      const workout = data.workouts.find(
        (item) => item.id === button.dataset.completeWorkout,
      );
      if (!workout) return;
      workout.status = "completed";
      workout.completedAt = new Date().toISOString();
      saveUserData(data);
      mountWorkoutPanel(container);
      showToast("Workout marked as completed.", "success");
    }),
  );
  container.querySelectorAll("[data-delete-workout]").forEach((button) =>
    button.addEventListener("click", () => {
      const workout = workouts.find(
        (item) => item.id === button.dataset.deleteWorkout,
      );
      if (!workout) return;
      openModal({
        title: "Delete workout plan?",
        content: `<p><strong>${escapeHTML(workout.name)}</strong> will be deleted from your workout planner.</p>`,
        confirmText: "Delete workout",
        confirmVariant: "button-danger",
        onConfirm: (close) => {
          const data = getUserData();
          data.workouts = data.workouts.filter(
            (item) => item.id !== workout.id,
          );
          saveUserData(data);
          close();
          mountWorkoutPanel(container);
          showToast("Workout deleted.", "info");
        },
      });
    }),
  );
}

// Keep reminders checked while the dashboard is open, even when another panel is selected.
startReminderMonitor();
