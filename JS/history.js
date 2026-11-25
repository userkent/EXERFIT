/*
- PURPOSE:
- Activity history statistics, filters, sorting, details, deletion, charts, and CSV export.
 */
(function () {
  "use strict";

  // Setup: grabs the main app object, helper shortcuts for dates and time formatting (e.g., "5m 30s"), and a chart placeholder
  const EF = window.ExerFit;
  const $ = (selector) => document.querySelector(selector);
  let chart = null;
  const getData = () => EF.Store.getData();
  const dateKey = (value) => EF.Store.localDateKey(value);
  const fmtDuration = (seconds) =>
    `${Math.floor((seconds || 0) / 60)}m ${Math.round((seconds || 0) % 60)}s`;
  const fmtClock = (seconds) => {
    const total = Math.max(0, Number(seconds) || 0);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = Math.floor(total % 60);
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${minutes}:${String(secs).padStart(2, "0")}`;
  };
  function sessionStats(item) {
    if (item.category === "outdoor") {
      const pace = Number(item.paceSecondsPerKm) || 0;
      const paceText = item.type === "Cycling" && item.speedKph ? `${item.speedKph} km/h` : pace ? `${Math.floor(pace / 60)}:${String(Math.round(pace % 60)).padStart(2, "0")} /km` : "Pace not recorded";
      return `${paceText}${item.simulation ? " · Simulation" : ""}`;
    }
    if (item.category === "indoor") {
      const bits = [];
      if (item.intensity) bits.push(`${item.intensity} ${item.type === "Treadmill" ? "km/h" : item.type === "Stationary Bike" ? "speed / resistance" : "intensity"}`);
      if (item.incline) bits.push(`${item.incline}% incline`);
      if (item.machineCount) bits.push(`${item.machineCount} ${item.countLabel || "counts"}`);
      return bits.join(" · ") || (item.distance ? `${Number(item.distance).toFixed(2)} km machine distance` : "Machine session");
    }
    if (item.category === "bodyweight") {
      const hold = Number(item.totalHoldSeconds) || 0;
      return `${Number(item.sets) || 0} sets · ${Number(item.reps) || 0} reps${hold ? ` · ${fmtClock(hold)} hold` : ""}`;
    }
    if (item.category === "gym") return `${Number(item.volumeKg || 0).toFixed(1)} kg volume · ${Number(item.sets) || 0} sets · ${Number(item.reps) || 0} reps`;
    if (item.category === "mind") return [item.focus, item.cycles ? `${item.cycles} cycles / rounds` : "", item.mood ? `Mood: ${item.mood}` : ""].filter(Boolean).join(" · ") || "Mindful session";
    return `${Number(item.reps) || 0} reps · ${Number(item.sets) || 0} sets`;
  }

  // Search, Filter & Sort: narrows down your saved workouts by keyword, category, and date range, then sorts the list
  function filteredActivities() {
    const data = getData();
    const query = $("#history-search").value.trim().toLowerCase();
    const category = $("#history-category").value;
    const from = $("#history-from").value;
    const to = $("#history-to").value;
    let activities = [...data.activities].filter((item) => {
      const date = dateKey(item.date);
      return (
        (category === "all" || item.category === category) &&
        (!from || date >= from) &&
        (!to || date <= to) &&
        (!query ||
          `${item.type} ${item.category} ${item.notes || ""}`
            .toLowerCase()
            .includes(query))
      );
    });
    const sort = $("#history-sort").value;
    activities.sort((a, b) =>
      sort === "oldest"
        ? new Date(a.date) - new Date(b.date)
        : sort === "duration"
          ? (b.duration || 0) - (a.duration || 0)
          : sort === "distance"
            ? (b.distance || 0) - (a.distance || 0)
            : new Date(b.date) - new Date(a.date),
    );
    return activities;
  }

  // Personal Records Finder: scans all workouts to find your highest distance, longest time, and most reps for each exercise
  function personalRecords(activities) {
    const grouped = new Map();
    activities.forEach((item) => {
      const name = item.type || item.category || "Activity";
      const current = grouped.get(name) || {
        type: name,
        distance: 0,
        duration: 0,
        reps: 0,
        volumeKg: 0,
      };
      current.volumeKg = Math.max(current.volumeKg, Number(item.volumeKg) || 0);
      current.distance = Math.max(current.distance, Number(item.distance) || 0);
      current.duration = Math.max(current.duration, Number(item.duration) || 0);
      current.reps = Math.max(current.reps, Number(item.reps) || 0);
      grouped.set(name, current);
    });
    const result = [];
    grouped.forEach((record) => {
      if (record.distance > 0)
        result.push({
          label: `${record.type} · longest distance`,
          value: `${record.distance.toFixed(2)} km`,
        });
      if (record.duration > 0)
        result.push({
          label: `${record.type} · longest session`,
          value: fmtDuration(record.duration),
        });
      if (record.reps > 0)
        result.push({ label: `${record.type} · most repetitions`, value: `${record.reps} reps` });
      if (record.volumeKg > 0)
        result.push({ label: `${record.type} · highest volume`, value: `${record.volumeKg.toFixed(1)} kg` });
    });
    return result.sort((a, b) => a.label.localeCompare(b.label));
  }

  // Personal Records Card Display: shows up to 12 of your best records on the page
  function renderPersonalRecords() {
    const target = $("#history-personal-records");
    const records = personalRecords(getData().activities);
    target.innerHTML = records.length
      ? records
          .slice(0, 12)
          .map(
            (item) =>
              `<div class="profile-data"><small>${EF.Store.escapeHTML(item.label)}</small><strong>${EF.Store.escapeHTML(item.value)}</strong></div>`,
          )
          .join("")
      : '<p class="small muted">Your best saved distance, session duration, and repetition entries will appear here.</p>';
  }

  // Top Summary Numbers: calculates and displays your all-time workouts, minutes, distance, calories, and record count
  function renderStats(activities) {
    const all = getData().activities;
    $("#history-total").textContent = all.length;
    $("#history-minutes").textContent = Math.round(
      all.reduce((sum, item) => sum + (item.duration || 0), 0) / 60,
    );
    const distance = all.reduce((sum, item) => sum + (item.distance || 0), 0);
    $("#history-distance").textContent = `${distance.toFixed(2)} km`;
    $("#history-calories").textContent = Math.round(
      all.reduce((sum, item) => sum + (Number(item.calories) || 0), 0),
    ).toLocaleString();
    const records = personalRecords(all);
    $("#history-records").textContent = records.length;
    $("#history-result-count").textContent = `${activities.length} records`;
  }

  // Desktop Workouts Table: fills the table rows with matching workouts and connects their "View" and "Delete" buttons
  function renderTable(activities) {
    const body = $("#history-table-body");
    const empty = $("#history-empty");
    if (!activities.length) {
      body.innerHTML =
        '<tr><td colspan="8" class="muted">No matching activity records.</td></tr>';
      empty.hidden = false;
    } else {
      empty.hidden = true;
      body.innerHTML = activities
        .map(
          (item) =>
            `<tr><td><strong>${EF.Store.escapeHTML(item.type || "Activity")}</strong></td><td>${EF.Store.escapeHTML(item.category || "—")}</td><td>${EF.Store.escapeHTML(new Date(item.date).toLocaleDateString())}</td><td>${fmtDuration(item.duration)}</td><td>${Number(item.distance || 0) > 0 ? `${Number(item.distance).toFixed(2)} km` : "—"}</td><td>${Number(item.calories || 0) ? `${Math.round(item.calories)} kcal` : "—"}</td><td>${EF.Store.escapeHTML(sessionStats(item))}</td><td><div class="row-actions"><button class="text-button" data-view-activity="${EF.Store.escapeHTML(item.id)}" type="button">View</button><button class="text-button" data-delete-activity="${EF.Store.escapeHTML(item.id)}" type="button">Delete</button></div></td></tr>`,
        )
        .join("");
    }
    document
      .querySelectorAll("[data-view-activity]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          viewActivity(button.dataset.viewActivity),
        ),
      );
    document.querySelectorAll("[data-delete-activity]").forEach((button) =>
      button.addEventListener("click", () =>
        EF.ui.confirmDelete("activity", () => {
          EF.Store.updateData((data) => {
            data.activities = data.activities.filter(
              (item) => item.id !== button.dataset.deleteActivity,
            );
          });
          render();
          EF.ui.toast("Activity deleted.");
        }),
      ),
    );
    renderMobileCards(activities);
  }

  // Mobile Phone Cards: creates stacked workout cards for smaller phone screens instead of a wide table
  function renderMobileCards(activities) {
    let container = document.getElementById("history-mobile-cards");
    if (!container) {
      container = document.createElement("div");
      container.id = "history-mobile-cards";
      container.className = "history-mobile-cards";
      document.querySelector(".table-wrap").after(container);
    }
    container.innerHTML = activities
      .map(
        (item) =>
          `<article class="card history-mobile-card"><div class="between"><strong>${EF.Store.escapeHTML(item.type || "Activity")}</strong><span class="pill">${EF.Store.escapeHTML(item.category || "Activity")}</span></div><p class="small muted">${new Date(item.date).toLocaleString()}</p><div class="between"><span>${fmtDuration(item.duration)}</span><strong>${Number(item.distance || 0) > 0 ? `${Number(item.distance).toFixed(2)} km` : "No distance"}</strong></div><small class="muted">${Number(item.calories || 0) ? `${Math.round(item.calories)} kcal estimate` : "No calorie estimate"} · ${EF.Store.escapeHTML(sessionStats(item))}</small><div class="row" style="justify-content:flex-end;margin-top:9px"><button class="text-button" data-view-activity="${EF.Store.escapeHTML(item.id)}">View</button><button class="text-button" data-delete-activity="${EF.Store.escapeHTML(item.id)}">Delete</button></div></article>`,
      )
      .join("");
    container
      .querySelectorAll("[data-view-activity]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          viewActivity(button.dataset.viewActivity),
        ),
      );
    container.querySelectorAll("[data-delete-activity]").forEach((button) =>
      button.addEventListener("click", () =>
        EF.ui.confirmDelete("activity", () => {
          EF.Store.updateData((data) => {
            data.activities = data.activities.filter(
              (item) => item.id !== button.dataset.deleteActivity,
            );
          });
          render();
        }),
      ),
    );
  }

  // Workout Details Pop-Up & Route Map: opens a modal showing full stats, notes, and a Leaflet map if GPS points were saved
  let detailRouteMap = null;
  function viewActivity(id) {
    const item = getData().activities.find((activity) => activity.id === id);
    if (!item) return;
    if (detailRouteMap) {
      detailRouteMap.remove();
      detailRouteMap = null;
    }
    const routeText = item.route?.length
      ? `${item.route.length} saved GPS points`
      : "No GPS route saved";
    const routeSection =
      item.route?.length && window.L
        ? '<div style="margin-top:16px"><strong>Recorded route</strong><div id="history-route-map" style="margin-top:8px"></div><p class="small muted" id="history-route-note"></p></div>'
        : "";
    const dialog = EF.ui.openModal(
      `${item.type || "Activity"} details`,
      `<div class="grid two"><div class="profile-data"><small>Date</small><strong>${new Date(item.date).toLocaleString()}</strong></div><div class="profile-data"><small>Category</small><strong>${EF.Store.escapeHTML(item.category || "—")}</strong></div><div class="profile-data"><small>Duration</small><strong>${fmtDuration(item.duration)}</strong></div><div class="profile-data"><small>Distance</small><strong>${Number(item.distance || 0) > 0 ? `${Number(item.distance).toFixed(2)} km` : "Not recorded"}</strong></div><div class="profile-data"><small>Session stats</small><strong>${EF.Store.escapeHTML(sessionStats(item))}</strong></div><div class="profile-data"><small>Estimated calories</small><strong>${Number(item.calories || 0) ? `${Math.round(item.calories)} kcal` : "Not estimated"}</strong></div>${item.category === "gym" ? `<div class="profile-data"><small>Total volume lifted</small><strong>${Number(item.volumeKg || 0).toFixed(1)} kg</strong></div>${item.activeDuration !== undefined ? `<div class="profile-data"><small>Active time / rest</small><strong>${fmtDuration(item.activeDuration)} active · ${fmtDuration(item.restSeconds)} rest</strong></div>` : ""}` : ""}${item.category === "bodyweight" && item.activeDuration !== undefined ? `<div class="profile-data"><small>Active time / rest</small><strong>${fmtDuration(item.activeDuration)} active · ${fmtDuration(item.restSeconds)} rest</strong></div>` : ""}${item.category === "bodyweight" && item.totalHoldSeconds ? `<div class="profile-data"><small>Total hold time</small><strong>${fmtDuration(item.totalHoldSeconds)}</strong></div>` : ""}${item.category === "mind" && item.targetDuration ? `<div class="profile-data"><small>Target duration</small><strong>${fmtDuration(item.targetDuration)}</strong></div>` : ""}<div class="profile-data"><small>Route</small><strong>${routeText}</strong></div></div>${item.setDetails?.length ? `<div style="margin-top:14px"><strong>Set log</strong><div class="stack" style="margin-top:8px">${item.setDetails.map((set, index) => `<div class="set-log-row">Set ${index + 1}: ${set.holdSeconds ? `${set.holdSeconds}s hold` : set.weight !== undefined ? `${set.weight} ${EF.Store.escapeHTML(set.unit || "kg")} × ${set.reps} reps` : `${set.reps || 0} reps`}</div>`).join("")}</div></div>` : ""}${routeSection}<p class="small muted" style="margin-top:15px">${EF.Store.escapeHTML(item.notes || "No notes saved.")}${item.simulation ? " · This session used simulation mode." : ""}</p>`,
      '<button type="button" class="btn" data-modal-close>Close</button>',
    );

    // Draw the saved GPS path with Start and Finish markers if route points exist
    if (routeSection) {
      const coords = item.route.filter(
        (point) =>
          Array.isArray(point) &&
          point.length === 2 &&
          Number.isFinite(Number(point[0])) &&
          Number.isFinite(Number(point[1])),
      );
      if (coords.length > 1) {
        const mapNode = dialog.body.querySelector("#history-route-map");
        if (mapNode) {
          detailRouteMap = L.map(mapNode, {
            scrollWheelZoom: false,
            attributionControl: true,
          }).setView(coords[0], 13);
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
          }).addTo(detailRouteMap);
          const line = L.polyline(coords, {
            color: "#16a34a",
            weight: 5,
            opacity: 0.9,
          }).addTo(detailRouteMap);
          L.circleMarker(coords[0], {
            radius: 6,
            color: "#fff",
            weight: 2,
            fillColor: "#16a34a",
            fillOpacity: 1,
          })
            .addTo(detailRouteMap)
            .bindTooltip("Start");
          L.circleMarker(coords[coords.length - 1], {
            radius: 6,
            color: "#fff",
            weight: 2,
            fillColor: "#111827",
            fillOpacity: 1,
          })
            .addTo(detailRouteMap)
            .bindTooltip("Finish");
          detailRouteMap.fitBounds(line.getBounds(), { padding: [18, 18] });
          dialog.body.querySelector("#history-route-note").textContent =
            item.simulation
              ? "Simulated route points — not a real GPS recording."
              : "Map preview of the recorded GPS points. OpenStreetMap contributors provide the map data.";
        }
      } else
        dialog.body.querySelector("#history-route-map").textContent =
          "The saved route does not contain enough valid map points.";
    }

    // Clean up the map when the user closes the pop-up window
    const cleanup = (event) => {
      if (event.type === "keydown" && event.key !== "Escape") return;
      if (
        event.type === "click" &&
        event.target !== dialog.backdrop &&
        !event.target.closest("[data-modal-close]")
      )
        return;
      if (detailRouteMap) {
        detailRouteMap.remove();
        detailRouteMap = null;
      }
      document.removeEventListener("keydown", cleanup);
      dialog.backdrop.removeEventListener("click", cleanup);
    };
    document.addEventListener("keydown", cleanup);
    dialog.backdrop.addEventListener("click", cleanup);
  }

  // 14-Day Line Chart: draws a graph showing how many active minutes you logged over the last two weeks
  function renderChart(activities) {
    if (!window.Chart) return;
    const days = 14;
    const labels = [];
    const values = [];
    for (let index = days - 1; index >= 0; index -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - index);
      const key = dateKey(date);
      labels.push(
        date.toLocaleDateString(undefined, {
          month: "numeric",
          day: "numeric",
        }),
      );
      values.push(
        Math.round(
          activities
            .filter((item) => dateKey(item.date) === key)
            .reduce((sum, item) => sum + (item.duration || 0), 0) / 60,
        ),
      );
    }
    if (chart) chart.destroy();
    chart = new Chart($("#history-chart"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Minutes",
            data: values,
            borderColor: "#16a34a",
            backgroundColor: "rgba(22,163,74,.12)",
            fill: true,
            tension: 0.35,
            pointRadius: 2,
          },
        ],
      },
      options: {
        responsive: true,
        animation: EF.Motion.motionAllowed() ? { duration: 550 } : false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } },
          x: { grid: { display: false }, ticks: { maxTicksLimit: 7 } },
        },
      },
    });
  }

  // 84-Day Activity Calendar (Heatmap): draws 12 weeks of colored squares where darker green means more workout minutes
  function renderHeatmap() {
    const activities = getData().activities;
    const host = $("#history-heatmap");
    host.innerHTML = "";
    const values = new Map();
    activities.forEach((item) => {
      const key = dateKey(item.date);
      values.set(key, (values.get(key) || 0) + (item.duration || 0) / 60);
    });
    for (let i = 83; i >= 0; i -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const minutes = values.get(dateKey(date)) || 0;
      const level =
        minutes === 0
          ? 0
          : minutes < 20
            ? 1
            : minutes < 45
              ? 2
              : minutes < 75
                ? 3
                : 4;
      const cell = document.createElement("span");
      cell.className = "heat-cell";
      cell.dataset.level = String(level);
      cell.title = `${dateKey(date)}: ${Math.round(minutes)} active minutes`;
      host.appendChild(cell);
    }
  }

  // CSV Spreadsheet Export: turns all your saved workouts into a downloadable .csv file you can open in Excel
  function toCSV(rows) {
    const fields = [
      "type",
      "category",
      "date",
      "duration",
      "distance",
      "calories",
      "reps", "sets", "paceSecondsPerKm", "speedKph", "intensity", "incline",
      "machineCount", "countLabel", "activeMetric", "volumeKg", "weightUnit", "totalHoldSeconds",
      "activeDuration", "restSeconds", "targetSets", "targetReps", "targetHoldSeconds", "focus", "mood", "durationMode",
      "targetDuration", "cycles", "setDetails", "notes",
    ];
    const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    return [
      fields.join(","),
      ...rows.map((row) => fields.map((field) => quote(field === "setDetails" ? JSON.stringify(row[field] || []) : row[field])).join(",")),
    ].join("\n");
  }
  function exportCSV() {
    EF.Store.downloadFile(
      "exerfit-activities.csv",
      toCSV(getData().activities),
      "text/csv",
    );
    EF.ui.toast("CSV export created.");
  }

  // Main Page Refresh & Startup: updates the whole page whenever you search, filter, sort, or click "Export CSV"
  function render() {
    const activities = filteredActivities();
    renderStats(activities);
    renderTable(activities);
    renderChart(activities);
    renderHeatmap();
    renderPersonalRecords();
  }

  [
    "#history-search",
    "#history-category",
    "#history-from",
    "#history-to",
    "#history-sort",
  ].forEach((selector) => $(selector).addEventListener("input", render));
  $("#export-history-csv").addEventListener("click", exportCSV);
  render();
})();
