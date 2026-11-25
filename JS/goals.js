/*
- PURPOSE:
- Goal creation, period/category calculations, completion state, streaks, and milestone badges.
 */
(function () {
  "use strict";

  // Setup: grabs the main app object, a shortcut for selecting HTML elements, and a list to avoid repeating celebrations
  const EF = window.ExerFit;
  const $ = (selector) => document.querySelector(selector);
  const getData = () => EF.Store.getData();
  let shownCelebrations = new Set();

  // Goal Timeframe Helper: figures out the starting date/time for a goal based on whether it is daily, weekly, or monthly
  function periodStart(goal) {
    const now = new Date();
    const created = new Date(goal.createdAt || 0);
    if (goal.period === "daily")
      return new Date(
        Math.max(
          created.getTime(),
          new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(),
        ),
      );
    if (goal.period === "weekly") {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      return new Date(Math.max(created.getTime(), start.getTime()));
    }
    if (goal.period === "monthly")
      return new Date(
        Math.max(
          created.getTime(),
          new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
        ),
      );
    return created;
  }

  // Goal Progress Calculator: adds up matching workouts (minutes, distance, calories, count, or reps) and finds the % done
  function progressFor(goal, activities) {
    const start = periodStart(goal);
    const records = activities.filter(
      (activity) =>
        new Date(activity.date) >= start &&
        (goal.category === "all" || activity.category === goal.category) &&
        (!goal.activity || activity.type === goal.activity),
    );
    let current = 0;
    switch (goal.measure) {
      case "minutes":
        current = records.reduce(
          (sum, item) => sum + (Number(item.duration) || 0) / 60,
          0,
        );
        break;
      case "distance":
        current = records.reduce(
          (sum, item) => sum + (Number(item.distance) || 0),
          0,
        );
        break;
      case "calories":
        current = records.reduce(
          (sum, item) => sum + (Number(item.calories) || 0),
          0,
        );
        break;
      case "activities":
        current = records.length;
        break;
      case "repetitions":
        current = records.reduce(
          (sum, item) => sum + (Number(item.reps) || 0),
          0,
        );
        break;
      default:
        current = 0;
    }
    return {
      current,
      percent: goal.target > 0 ? (current / Number(goal.target)) * 100 : 0,
    };
  }

  // Streak Counter: counts how many consecutive days in a row you have logged at least one workout
  function activityStreak(activities) {
    const unique = [
      ...new Set(
        activities
          .map((item) => EF.Store.localDateKey(item.date))
          .filter(Boolean),
      ),
    ]
      .sort()
      .reverse();
    if (!unique.length) return 0;
    const today = EF.Store.localDateKey(new Date());
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = EF.Store.localDateKey(yesterdayDate);
    if (![today, yesterday].includes(unique[0])) return 0;
    let count = 1;
    const expected = new Date(`${unique[0]}T12:00:00`);
    for (let i = 1; i < unique.length; i += 1) {
      expected.setDate(expected.getDate() - 1);
      if (unique[i] !== EF.Store.localDateKey(expected)) break;
      count += 1;
    }
    return count;
  }

  // Celebration Confetti: drops colorful falling confetti across the screen when you finish a goal
  function confetti() {
    if (!EF.Motion.motionAllowed()) return;
    const layer = document.createElement("div");
    layer.className = "confetti";
    for (let index = 0; index < 48; index += 1) {
      const piece = document.createElement("i");
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.animationDelay = `${Math.random() * 0.5}s`;
      piece.style.background = ["#16a34a", "#4ade80", "#bbf7d0", "#facc15"][
        index % 4
      ];
      layer.appendChild(piece);
    }
    document.body.appendChild(layer);
    window.setTimeout(() => layer.remove(), 2400);
  }

  // Goal Completion Checker: marks any goal at 100%+ as "completed", saves it, and triggers confetti + a pop-up message
  function syncCompletion(data) {
    let changed = false;
    data.goals.forEach((goal) => {
      if (goal.status === "completed") return;
      const progress = progressFor(goal, data.activities);
      if (progress.percent >= 100) {
        goal.status = "completed";
        goal.completedAt = new Date().toISOString();
        changed = true;
        if (!shownCelebrations.has(goal.id)) {
          shownCelebrations.add(goal.id);
          confetti();
          EF.ui.toast(`Milestone reached: ${goal.name}`);
        }
      }
    });
    if (changed) EF.Store.saveData(data);
  }

  // Single Goal Card Builder: creates the HTML card for one goal showing its progress bar, numbers, Edit button, and Remove button
  function renderGoal(goal, data) {
    const progress = progressFor(goal, data.activities);
    const percent = Math.min(100, progress.percent);
    const current =
      goal.measure === "distance"
        ? progress.current.toFixed(2)
        : Math.round(progress.current);
    return `<article class="card goal-card tilt-card"><div class="between"><span class="pill ${goal.status === "completed" ? "green" : ""}">${goal.status === "completed" ? "Completed" : "In progress"}</span><button class="text-button" data-delete-goal="${EF.Store.escapeHTML(goal.id)}" type="button">Remove</button></div><h3 style="margin:15px 0 6px">${EF.Store.escapeHTML(goal.name)}</h3><p class="small muted">${EF.Store.escapeHTML(goal.category)} · ${EF.Store.escapeHTML(goal.period)} · ${EF.Store.escapeHTML(goal.measure)}</p><div class="goal-progress-row"><div class="progress"><span style="width:${percent}%"></span></div><strong>${Math.round(percent)}%</strong></div><p class="small muted" style="margin:9px 0 0">${current} / ${goal.target} ${EF.Store.escapeHTML(goal.measure)}</p><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="text-button" data-edit-goal="${EF.Store.escapeHTML(goal.id)}" type="button">Edit target</button></div></article>`;
  }

  // Main Page Renderer: updates the top summary numbers, draws active/completed goals, unlocks badges, and activates card buttons
  function render() {
    const data = getData();
    syncCompletion(data);
    const active = data.goals.filter((goal) => goal.status !== "completed");
    const completed = data.goals.filter((goal) => goal.status === "completed");

    // Fill in the 3 summary boxes and the Active / Completed goal lists
    $("#goal-active-count").textContent = active.length;
    $("#goal-complete-count").textContent = completed.length;
    $("#goal-streak-count").textContent =
      `${activityStreak(data.activities)} days`;
    $("#active-goals").innerHTML = active.length
      ? active.map((goal) => renderGoal(goal, data)).join("")
      : '<div class="empty-state"><strong>No active goals yet</strong>Create one small target to get started.</div>';
    $("#completed-goals").innerHTML = completed.length
      ? completed.map((goal) => renderGoal(goal, data)).join("")
      : '<div class="empty-state">Completed goals will appear here.</div>';

    // Check which milestone badges you have earned and display them
    const badges = [
      { title: "First session", earned: data.activities.length >= 1 },
      { title: "Three sessions", earned: data.activities.length >= 3 },
      {
        title: "Five active dates",
        earned:
          new Set(
            data.activities
              .map((item) => EF.Store.localDateKey(item.date))
              .filter(Boolean),
          ).size >= 5,
      },
      { title: "First milestone", earned: completed.length >= 1 },
    ];
    $("#earned-badges").innerHTML = badges
      .map(
        (badge) =>
          `<span class="badge-item ${badge.earned ? "" : "locked"}">${EF.Store.escapeHTML(badge.title)} · ${badge.earned ? "Earned" : "Locked"}</span>`,
      )
      .join("");

    // Connect "Remove" and "Edit target" buttons on every goal card
    document.querySelectorAll("[data-delete-goal]").forEach((button) =>
      button.addEventListener("click", () =>
        EF.ui.confirmDelete("goal", () => {
          EF.Store.updateData((state) => {
            state.goals = state.goals.filter(
              (goal) => goal.id !== button.dataset.deleteGoal,
            );
          });
          render();
          EF.ui.toast("Goal removed.");
        }),
      ),
    );
    document
      .querySelectorAll("[data-edit-goal]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          editGoal(button.dataset.editGoal),
        ),
      );
    EF.Motion?.init(document.querySelector(".page-content"));
  }

  // Create / Edit Goal Pop-Up Window: opens a modal form to make a new goal or update an existing one
  function goalForm(existing) {
    const modal = EF.ui.openModal(
      existing ? "Edit goal" : "Create a goal",
      `
      <form id="goal-form"><div class="field"><label for="goal-name">Goal name</label><input id="goal-name" maxlength="60" required value="${EF.Store.escapeHTML(existing?.name || "")}" placeholder="e.g. Move for 30 minutes"></div>
      <div class="form-row"><div class="field"><label for="goal-category">Category</label><select id="goal-category"><option value="all">All activities</option><option value="outdoor">Outdoor</option><option value="indoor">Indoor</option><option value="bodyweight">Bodyweight</option><option value="gym">Gym</option><option value="mind">Mind and body</option></select></div><div class="field"><label for="goal-period">Period</label><select id="goal-period"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div></div>
      <div class="form-row"><div class="field"><label for="goal-measure">Measure</label><select id="goal-measure"><option value="minutes">Active minutes</option><option value="distance">Distance (km)</option><option value="activities">Activities</option><option value="repetitions">Repetitions</option><option value="calories">Estimated calories</option></select></div><div class="field"><label for="goal-target">Target amount</label><input id="goal-target" type="number" min="1" max="100000" required value="${existing?.target || 30}"></div></div>
      <div class="field"><label for="goal-activity">Specific activity (optional)</label><input id="goal-activity" value="${EF.Store.escapeHTML(existing?.activity || "")}" placeholder="e.g. Walk"></div>
      <p class="small muted">Progress uses eligible saved activities from this goal's start date and selected period. Targets are personal settings, not a measure of anyone's worth.</p></form>`,
      '<button type="button" class="btn secondary" data-cancel>Cancel</button><button type="button" class="btn" id="goal-save">Save goal</button>',
    );
    const form = modal.body.querySelector("#goal-form");
    if (existing) {
      form.querySelector("#goal-category").value = existing.category;
      form.querySelector("#goal-period").value = existing.period;
      form.querySelector("#goal-measure").value = existing.measure;
    }
    modal.actions.querySelector("[data-cancel]").onclick = modal.close;

    // Save Goal Handler: validates the form inputs, saves the goal into browser storage, and refreshes the page
    modal.actions.querySelector("#goal-save").onclick = () => {
      if (!form.reportValidity()) return;
      const values = {
        name: form.querySelector("#goal-name").value.trim(),
        category: form.querySelector("#goal-category").value,
        period: form.querySelector("#goal-period").value,
        measure: form.querySelector("#goal-measure").value,
        target: Number(form.querySelector("#goal-target").value),
        activity: form.querySelector("#goal-activity").value.trim(),
      };
      if (!values.name || values.target < 1) return;
      EF.Store.updateData((state) => {
        if (existing)
          Object.assign(
            state.goals.find((goal) => goal.id === existing.id),
            values,
            { status: "in_progress" },
          );
        else
          state.goals.push({
            id: EF.Store.createId("goal"),
            ...values,
            status: "in_progress",
            createdAt: new Date().toISOString(),
          });
      });
      modal.close();
      render();
      EF.ui.toast(existing ? "Goal updated." : "Goal created.");
    };
  }

  // Edit Goal Helper & Startup: opens the pop-up with an existing goal's info, connects "+ Create goal", and draws the page
  function editGoal(id) {
    const goal = getData().goals.find((item) => item.id === id);
    if (goal) goalForm(goal);
  }
  $("#create-goal-open").addEventListener("click", () => goalForm(null));
  render();
})();