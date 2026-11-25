/*
- PURPOSE:
- Dashboard KPIs, weekly chart, recent activity feed, daily plan, weather preview,
- goal preview, and the Quick Log form.
 */
(function () {
  "use strict";

  // Setup: grabs the main app object, shortcut helpers for selecting elements and dates, and workout categories
  const EF = window.ExerFit;
  if (!EF?.Store) return;
  let activityChart = null;
  const $ = (selector) => document.querySelector(selector);
  const fmt = (seconds) => `${Math.floor((seconds || 0) / 60)} min`;
  const todayKey = (value = new Date()) => EF.Store.localDateKey(value);
  const categories = ["outdoor", "indoor", "bodyweight", "gym", "mind"];
  const activityLabel = (activity) => activity.type || "Activity";
  const getData = () => EF.Store.getData();

  // Streak Calculator: counts how many days in a row you have logged at least one activity
  function getStreak(activities) {
    const dates = [...new Set(activities.map((activity) => todayKey(activity.date)).filter(Boolean))].sort().reverse();
    if (!dates.length) return 0;
    const today = todayKey(); const yesterday = todayKey(Date.now() - 86400000);
    if (dates[0] !== today && dates[0] !== yesterday) return 0;
    let count = 0; let expected = new Date(`${dates[0]}T00:00:00`);
    dates.forEach((date) => {
      const current = new Date(`${date}T00:00:00`);
      if (Math.round((expected - current) / 86400000) === 0 || count === 0) { count += 1; expected = new Date(current.getTime() - 86400000); }
    });
    return count;
  }

  // Top 5 Stat Cards & Daily Goal Circle: calculates your totals, compares this week vs. last week, and fills today's progress ring
  function renderKPIs(data) {
    const activities = data.activities;
    const minutes = activities.reduce((sum, item) => sum + (Number(item.duration) || 0), 0) / 60;
    const distance = activities.reduce((sum, item) => sum + (Number(item.distance) || 0), 0);
    const unit = data.settings.distanceUnit || "km";
    const converted = unit === "mi" ? distance * 0.621371 : distance;
    const target = Number(data.settings.activeGoalMinutes) || 30;
    const todayMinutes = activities.filter((item) => todayKey(item.date) === todayKey()).reduce((sum, item) => sum + (Number(item.duration) || 0), 0) / 60;
    const calories = activities.reduce((sum, item) => sum + (Number(item.calories) || 0), 0);
    const streak = getStreak(activities);
    $("#kpi-activities").textContent = activities.length;
    $("#kpi-minutes").textContent = `${Math.round(minutes)} min`;
    $("#kpi-distance").textContent = `${converted.toFixed(2)} ${unit}`;
    $("#kpi-calories").textContent = `${Math.round(calories)} kcal`;
    $("#kpi-streak").textContent = `${streak} days`;

    // Weekly Trend Comparison: compares the last 7 days against the 7 days before that to show up/down % arrows
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const thisStart = new Date(today); thisStart.setDate(thisStart.getDate() - 6);
    const previousStart = new Date(thisStart); previousStart.setDate(previousStart.getDate() - 7);
    const inRange = (item, start, end) => { const date = new Date(item.date); return Number.isFinite(date.getTime()) && date >= start && date < end; };
    const currentWeek = activities.filter((item) => inRange(item, thisStart, new Date(today.getTime() + 86400000)));
    const previousWeek = activities.filter((item) => inRange(item, previousStart, thisStart));
    const sumBy = (items, getter) => items.reduce((sum, item) => sum + getter(item), 0);
    const activeDates = (items) => new Set(items.map((item) => todayKey(item.date)).filter(Boolean)).size;
    const trendText = (current, previous, unit = "") => {
      if (previous === 0) return current > 0 ? `New this week${unit}` : `No change vs prior 7 days`;
      const delta = Math.round(((current - previous) / previous) * 100);
      return `${delta > 0 ? "↑" : delta < 0 ? "↓" : "→"} ${Math.abs(delta)}% vs prior 7 days`;
    };
    const trendIds = ["activities", "minutes", "distance", "calories", "streak"];
    const trendValues = [
      [currentWeek.length, previousWeek.length],
      [sumBy(currentWeek, (item) => (Number(item.duration) || 0) / 60), sumBy(previousWeek, (item) => (Number(item.duration) || 0) / 60)],
      [sumBy(currentWeek, (item) => Number(item.distance) || 0), sumBy(previousWeek, (item) => Number(item.distance) || 0)],
      [sumBy(currentWeek, (item) => Number(item.calories) || 0), sumBy(previousWeek, (item) => Number(item.calories) || 0)],
      [activeDates(currentWeek), activeDates(previousWeek)]
    ];
    trendIds.forEach((id, index) => {
      const node = $(`#kpi-trend-${id}`); if (!node) return;
      const [current, previous] = trendValues[index];
      node.textContent = index === 3 ? trendText(current, previous) : trendText(current, previous);
      node.classList.toggle("positive", current > previous);
      node.classList.toggle("negative", current < previous);
      node.classList.toggle("flat", current === previous);
    });

    // Update the circular daily progress ring
    $("#ring-value").textContent = `${Math.round(todayMinutes)} / ${target} min`;
    const percent = Math.min(100, Math.round(todayMinutes / target * 100));
    $("#ring-percent").textContent = `${percent}%`;
    $("#activity-ring-value").style.strokeDashoffset = String(326.7 * (1 - percent / 100));
  }

  // Recent Activity Feed: displays your 5 most recent saved workouts on the dashboard
  function renderFeed(data) {
    const target = $("#activity-feed");
    const recent = [...data.activities].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    if (!recent.length) { target.innerHTML = '<div class="empty-state"><strong>No activity yet</strong>Your saved sessions will appear here.</div>'; return; }
    target.innerHTML = recent.map((activity) => {
      const date = new Date(activity.date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const distance = Number(activity.distance) > 0 ? `${Number(activity.distance).toFixed(2)} km` : `${Math.round((activity.duration || 0) / 60)} min`;
      return `<div class="feed-item"><div class="feed-icon" aria-hidden="true">${EF.Store.escapeHTML((activity.category || "A").slice(0, 1).toUpperCase())}</div><div><strong>${EF.Store.escapeHTML(activityLabel(activity))}</strong><small>${EF.Store.escapeHTML(date)} · ${EF.Store.escapeHTML(activity.category || "Activity")}</small></div><div class="feed-metric">${EF.Store.escapeHTML(distance)}<small style="display:block;color:var(--muted);font-weight:500">${Math.round((activity.duration || 0) / 60)} min</small></div></div>`;
    }).join("");
  }

  // Stacked Bar Chart: draws a graph comparing Outdoor vs. Indoor/Workout minutes over 7, 30, or 90 days
  function renderChart(data, days) {
    const canvas = $("#activity-chart");
    if (!canvas || !window.Chart) return;
    const labels = []; const outdoor = []; const workout = [];
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = new Date(); date.setDate(date.getDate() - offset);
      const key = todayKey(date);
      labels.push(days === 7 ? date.toLocaleDateString(undefined, { weekday: "short" }) : date.toLocaleDateString(undefined, { month: "numeric", day: "numeric" }));
      const daily = data.activities.filter((item) => todayKey(item.date) === key);
      outdoor.push(Math.round(daily.filter((item) => item.category === "outdoor").reduce((sum, item) => sum + (Number(item.duration) || 0), 0) / 60));
      workout.push(Math.round(daily.filter((item) => item.category !== "outdoor").reduce((sum, item) => sum + (Number(item.duration) || 0), 0) / 60));
    }
    if (activityChart) activityChart.destroy();
    activityChart = new Chart(canvas, {
      type: "bar",
      data: { labels, datasets: [
        { label: "Outdoor", data: outdoor, backgroundColor: "rgba(22,163,74,.82)", borderRadius: 5, maxBarThickness: 24, stack: "minutes" },
        { label: "Indoor and workouts", data: workout, backgroundColor: "rgba(134,239,172,.9)", borderRadius: 5, maxBarThickness: 24, stack: "minutes" }
      ] },
      options: { responsive: true, animation: EF.Motion.motionAllowed() ? { duration: 600 } : false,
        plugins: { legend: { display: true, position: "bottom", labels: { usePointStyle: true, boxWidth: 8, color: getComputedStyle(document.body).getPropertyValue("--muted") } } },
        scales: { x: { stacked: true, grid: { display: false }, ticks: { maxTicksLimit: 10 } }, y: { stacked: true, beginAtZero: true, grid: { color: "rgba(120,140,125,.12)" }, ticks: { precision: 0 } } }
      }
    });
  }

  // Activity Mix Doughnut Chart: draws a ring chart breaking down total workout time by category
  let mixChart = null;
  function renderActivityMix(data) {
    const canvas = $("#activity-mix-chart");
    if (!canvas || !window.Chart) return;
    const labels = ["Outdoor", "Indoor", "Bodyweight", "Gym", "Mind and body"];
    const totals = categories.map((category) => data.activities
      .filter((activity) => activity.category === category)
      .reduce((sum, activity) => sum + (Number(activity.duration) || 0), 0) / 60);
    if (mixChart) mixChart.destroy();
    mixChart = new Chart(canvas, {
      type: "doughnut",
      data: { labels, datasets: [{ data: totals.map((value) => Math.round(value)), backgroundColor: ["#16a34a", "#86efac", "#0f766e", "#a3e635", "#64748b"], borderWidth: 2, borderColor: getComputedStyle(document.body).getPropertyValue("--surface") || "#fff", hoverOffset: 7 }] },
      options: { responsive: true, cutout: "66%", animation: EF.Motion.motionAllowed() ? { duration: 650 } : false,
        plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8, color: getComputedStyle(document.body).getPropertyValue("--muted") } },
          tooltip: { callbacks: { label: (context) => `${context.label}: ${context.parsed} min` } } }
      }
    });
  }

  // 28-Day Consistency Calendar: draws 4 weeks of green squares showing which days you were active
  function renderHomeHeatmap(data) {
    const target = $("#home-heatmap");
    if (!target) return;
    const days = [];
    const activityByDate = new Map();
    data.activities.forEach((activity) => {
      const key = todayKey(activity.date);
      if (!key) return;
      activityByDate.set(key, (activityByDate.get(key) || 0) + (Number(activity.duration) || 0) / 60);
    });
    for (let offset = 27; offset >= 0; offset -= 1) {
      const date = new Date(); date.setDate(date.getDate() - offset);
      const key = todayKey(date); const minutes = Math.round(activityByDate.get(key) || 0);
      const level = minutes <= 0 ? 0 : minutes < 20 ? 1 : minutes < 40 ? 2 : minutes < 60 ? 3 : 4;
      days.push(`<span class="heat-cell" data-level="${level}" title="${key}: ${minutes} active minutes" aria-label="${key}: ${minutes} active minutes"></span>`);
    }
    target.innerHTML = days.join("");
  }

  // Dashboard Widget Customizer: lets you show, hide, and reorder the 4 main widget rows on the Home page
  const DASHBOARD_WIDGETS = [
    { id: "progress", label: "Daily progress and weekly chart" },
    { id: "activity-plan", label: "Recent activity and daily plan" },
    { id: "weather-goals", label: "Weather and goals" },
    { id: "insights", label: "Activity mix and calendar" }
  ];

  // Apply Saved Layout: arranges the dashboard sections in your chosen order and hides unchecked ones
  function applyDashboardLayout() {
    const container = $("#dashboard-widgets");
    if (!container) return;
    const dashboard = getData()?.dashboard || {};
    const order = Array.isArray(dashboard.widgets) ? dashboard.widgets : DASHBOARD_WIDGETS.map((item) => item.id);
    const hidden = new Set(Array.isArray(dashboard.hiddenWidgets) ? dashboard.hiddenWidgets : []);
    const byId = new Map([...container.querySelectorAll("[data-dashboard-widget]")].map((node) => [node.dataset.dashboardWidget, node]));
    const orderedIds = [...order.filter((id) => byId.has(id)), ...DASHBOARD_WIDGETS.map((item) => item.id).filter((id) => byId.has(id) && !order.includes(id))];
    orderedIds.forEach((id) => {
      const node = byId.get(id);
      node.style.display = hidden.has(id) ? "none" : "";
      container.appendChild(node);
    });
  }

  // Customize Dashboard Pop-Up: opens a modal with checkboxes and Up/Down buttons to rearrange your widgets
  function customizeDashboard() {
    const current = getData()?.dashboard || {};
    const order = [...(Array.isArray(current.widgets) ? current.widgets : DASHBOARD_WIDGETS.map((item) => item.id))];
    DASHBOARD_WIDGETS.forEach((item) => { if (!order.includes(item.id)) order.push(item.id); });
    const hidden = new Set(current.hiddenWidgets || []);
    const dialog = EF.ui.openModal("Customize your dashboard", `
      <p class="muted small">Show the sections you use and move them into the order that works for you.</p>
      <div id="dashboard-widget-rows" class="dashboard-widget-list"></div>
    `, '<button type="button" class="btn secondary" data-dashboard-cancel>Cancel</button><button type="button" class="btn" data-dashboard-save>Save layout</button>');

    function drawRows() {
      const holder = dialog.body.querySelector("#dashboard-widget-rows");
      holder.innerHTML = order.map((id, index) => {
        const item = DASHBOARD_WIDGETS.find((entry) => entry.id === id);
        if (!item) return "";
        return `<div class="dashboard-widget-row" data-widget-row="${id}">
          <label class="row" style="gap:10px;flex:1"><input type="checkbox" data-widget-visible="${id}" ${hidden.has(id) ? "" : "checked"}><span>${EF.Store.escapeHTML(item.label)}</span></label>
          <div class="row"><button class="btn ghost small-btn" type="button" data-widget-move="up" data-widget-id="${id}" aria-label="Move ${EF.Store.escapeHTML(item.label)} up" ${index === 0 ? "disabled" : ""}>Up</button><button class="btn ghost small-btn" type="button" data-widget-move="down" data-widget-id="${id}" aria-label="Move ${EF.Store.escapeHTML(item.label)} down" ${index === order.length - 1 ? "disabled" : ""}>Down</button></div>
        </div>`;
      }).join("");
      holder.querySelectorAll("[data-widget-visible]").forEach((input) => input.addEventListener("change", () => {
        if (input.checked) hidden.delete(input.dataset.widgetVisible); else hidden.add(input.dataset.widgetVisible);
      }));
      holder.querySelectorAll("[data-widget-move]").forEach((button) => button.addEventListener("click", () => {
        const index = order.indexOf(button.dataset.widgetId); const next = button.dataset.widgetMove === "up" ? index - 1 : index + 1;
        if (next < 0 || next >= order.length) return;
        [order[index], order[next]] = [order[next], order[index]]; drawRows();
      }));
    }
    drawRows();
    dialog.actions.querySelector("[data-dashboard-cancel]").onclick = dialog.close;
    dialog.actions.querySelector("[data-dashboard-save]").onclick = () => {
      EF.Store.updateData((data) => { data.dashboard = { widgets: [...order], hiddenWidgets: [...hidden] }; });
      dialog.close(); applyDashboardLayout(); EF.ui.toast("Dashboard layout saved.");
    };
  }

  // Today's Checklist ("Today's Plan"): lets you check off or delete items from your daily to-do list
  function renderPlan(data) {
    const target = $("#daily-plan-list"); const plan = data.dailyPlan;
    if (!plan.length) target.innerHTML = '<p class="small muted">Add a simple item, such as “take a short walk” or “stretch for a few minutes”.</p>';
    else target.innerHTML = plan.map((item) => `<label class="plan-item ${item.done ? "done" : ""}"><input type="checkbox" data-plan-id="${EF.Store.escapeHTML(item.id)}" ${item.done ? "checked" : ""}><span>${EF.Store.escapeHTML(item.text)}</span><button class="text-button" type="button" data-remove-plan="${EF.Store.escapeHTML(item.id)}" aria-label="Remove plan item">×</button></label>`).join("");
    const done = plan.filter((item) => item.done).length;
    $("#plan-count").textContent = `${done} / ${plan.length} done`;
    $("#plan-progress").style.width = `${plan.length ? done / plan.length * 100 : 0}%`;
    target.querySelectorAll("[data-plan-id]").forEach((input) => input.addEventListener("change", () => {
      EF.Store.updateData((state) => { const match = state.dailyPlan.find((item) => item.id === input.dataset.planId); if (match) match.done = input.checked; }); renderPlan(getData());
    }));
    target.querySelectorAll("[data-remove-plan]").forEach((button) => button.addEventListener("click", () => {
      EF.Store.updateData((state) => { state.dailyPlan = state.dailyPlan.filter((item) => item.id !== button.dataset.removePlan); }); renderPlan(getData());
    }));
  }

  // Goals Preview Card: shows progress bars for up to 3 active goals right on the Home dashboard
  function renderGoals(data) {
    const target = $("#home-goals"); const active = data.goals.filter((goal) => goal.status !== "completed").slice(0, 3);
    if (!active.length) { target.innerHTML = '<div class="empty-state"><strong>No goals set yet</strong>Create a simple goal to track a personal milestone.</div>'; return; }
    target.innerHTML = active.map((goal) => {
      const progress = calculateGoalProgress(goal, data.activities);
      return `<div style="margin-bottom:17px"><div class="between"><strong>${EF.Store.escapeHTML(goal.name)}</strong><small class="muted">${Math.round(progress.percent)}%</small></div><div class="progress" style="margin:8px 0"><span style="width:${Math.min(100, progress.percent)}%"></span></div><small class="muted">${progress.current.toFixed(progress.unit === "km" ? 2 : 0)} / ${goal.target} ${EF.Store.escapeHTML(goal.measure)}</small></div>`;
    }).join("");
  }

  // Goal Progress Math: calculates how close you are to completing a goal based on matching workouts
  function calculateGoalProgress(goal, activities) {
    const start = new Date(goal.createdAt || 0); const now = new Date();
    let from = new Date(start);
    if (goal.period === "daily") from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (goal.period === "weekly") { from = new Date(now); from.setDate(now.getDate() - 6); from.setHours(0, 0, 0, 0); }
    if (goal.period === "monthly") from = new Date(now.getFullYear(), now.getMonth(), 1);
    const eligible = activities.filter((item) => new Date(item.date) >= from && (!goal.category || goal.category === "all" || item.category === goal.category) && (!goal.activity || item.type === goal.activity));
    let current = 0;
    if (goal.measure === "minutes") current = eligible.reduce((sum, item) => sum + (item.duration || 0) / 60, 0);
    else if (goal.measure === "distance") current = eligible.reduce((sum, item) => sum + (item.distance || 0), 0);
    else if (goal.measure === "calories") current = eligible.reduce((sum, item) => sum + (item.calories || 0), 0);
    else if (goal.measure === "activities") current = eligible.length;
    else if (goal.measure === "repetitions") current = eligible.reduce((sum, item) => sum + (item.reps || 0), 0);
    return { current, percent: Number(goal.target) > 0 ? current / Number(goal.target) * 100 : 0, unit: goal.measure === "distance" ? "km" : "" };
  }

  // Live Greeting & Clock: updates the "Good morning/afternoon/evening" text, today's date, and ticking clock
  function renderClock() {
    const now = new Date();
    $("#welcome-title").textContent = `Good ${now.getHours() < 12 ? "morning" : now.getHours() < 18 ? "afternoon" : "evening"}.`;
    $("#today-date").textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    $("#live-clock").textContent = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  }

  // Weather Snapshot Card: fetches and displays the current temperature and upcoming forecast for your last saved location
  async function renderWeatherPreview(data) {
    const target = $("#home-weather"); const coords = data.settings.lastCoords;
    if (!coords || !EF.Weather?.apiKey()) return;
    target.innerHTML = '<div class="skeleton" style="height:75px"></div>';
    const result = await EF.Weather.fetchBundle(coords.lat, coords.lon);
    if (!result.current) { target.innerHTML = `<p class="small muted">${EF.Store.escapeHTML(result.errors.current || "Weather unavailable")}</p><a href="settings.html" class="text-button">Check weather settings →</a>`; return; }
    const current = result.current; const forecast = result.forecast?.list?.slice(0, 5) || [];
    target.innerHTML = `<div class="weather-now"><div><div class="weather-temp">${Math.round(current.main.temp)}°</div><strong>${EF.Store.escapeHTML(current.weather?.[0]?.description || "Conditions loaded")}</strong><div class="muted small">${EF.Store.escapeHTML(current.name || "Selected location")}</div></div><div class="pill green">${current.main.feels_like != null ? `Feels ${Math.round(current.main.feels_like)}°` : "Live data"}</div></div><div class="forecast-strip" style="margin-top:14px">${forecast.map((slot) => `<div class="forecast-slot"><span>${EF.Weather.formatLocal(slot.dt, result.forecast.city?.timezone || current.timezone)}</span><strong>${Math.round(slot.main.temp)}°</strong><small>${Math.round((slot.pop || 0) * 100)}% rain</small></div>`).join("")}</div><p class="small muted" style="margin:8px 0 0">${result.savedData ? "Showing saved weather data." : "Weather data by OpenWeather."}</p>`;
  }

  // Quick Log Pop-Up Window: opens a fast form so you can manually type in a workout without using the full Tracker page
  function quickLog() {
    const modal = EF.ui.openModal("Quick log an activity", `
      <form id="quick-log-form"><div class="field"><label for="quick-type">Activity</label><select id="quick-type"><option data-cat="outdoor">Walk</option><option data-cat="outdoor">Run</option><option data-cat="outdoor">Ride</option><option data-cat="outdoor">Hike</option><option data-cat="indoor">Treadmill</option><option data-cat="indoor">Stationary bike</option><option data-cat="bodyweight">Push-ups</option><option data-cat="bodyweight">Squats</option><option data-cat="gym">Strength training</option><option data-cat="mind">Yoga</option><option data-cat="mind">Stretching</option></select></div><div class="form-row"><div class="field"><label for="quick-duration">Duration (minutes)</label><input id="quick-duration" type="number" min="1" max="1440" value="20" required></div><div class="field"><label for="quick-distance">Distance (km, optional)</label><input id="quick-distance" type="number" min="0" step="0.01" placeholder="0.00"></div></div><div class="field"><label for="quick-reps">Repetitions (optional)</label><input id="quick-reps" type="number" min="0" placeholder="0"></div><div class="field"><label for="quick-notes">Notes (optional)</label><textarea id="quick-notes" maxlength="160" placeholder="How did the session feel?"></textarea></div></form>`, '<button type="button" class="btn secondary" data-cancel>Cancel</button><button type="button" class="btn" id="quick-log-save">Save activity</button>');
    modal.actions.querySelector("[data-cancel]").onclick = modal.close;
    modal.actions.querySelector("#quick-log-save").onclick = () => {
      const form = modal.body.querySelector("#quick-log-form");
      if (!form.reportValidity()) return;
      const type = form.querySelector("#quick-type").value;
      const option = form.querySelector("#quick-type").selectedOptions[0];
      const category = option.dataset.cat;
      const duration = Number(form.querySelector("#quick-duration").value) * 60;
      const distance = Number(form.querySelector("#quick-distance").value || 0);
      const reps = Number(form.querySelector("#quick-reps").value || 0);
      EF.Store.updateData((data) => data.activities.push({ id: EF.Store.createId("activity"), type, category, date: new Date().toISOString(), duration, distance, reps, sets: 0, calories: 0, notes: form.querySelector("#quick-notes").value.trim(), route: null }));
      modal.close(); renderAll(); EF.ui.toast("Activity saved to your history.");
    };
  }

  // Master Dashboard Refresher: draws all stats, charts, lists, weather, and custom widget layout at once
  function renderAll() {
    const data = getData(); if (!data) return;
    renderKPIs(data); renderFeed(data); renderPlan(data); renderGoals(data); renderClock();
    renderWeatherPreview(data); renderChart(data, Number($("#chart-range").value || 7));
    renderActivityMix(data); renderHomeHeatmap(data); applyDashboardLayout();
    EF.Motion?.init(document.querySelector(".page-content"));
  }

  // Button & Form Listeners & Startup: connects chart dropdowns, Quick Log, Customize, Today's Plan input, and starts the live clock
  $("#chart-range").addEventListener("change", () => renderChart(getData(), Number($("#chart-range").value)));
  $("#refresh-activity").addEventListener("click", () => { renderAll(); EF.ui.toast("Activity data refreshed."); });
  $("#quick-log-open").addEventListener("click", quickLog);
  $("#dashboard-customize")?.addEventListener("click", customizeDashboard);
  $("#plan-add-form").addEventListener("submit", (event) => {
    event.preventDefault(); const input = $("#plan-new-item"); const value = input.value.trim();
    if (!value) return;
    EF.Store.updateData((data) => data.dailyPlan.push({ id: EF.Store.createId("plan"), text: value, done: false })); input.value = ""; renderPlan(getData());
  });
  renderAll(); window.setInterval(renderClock, 1000);
})();