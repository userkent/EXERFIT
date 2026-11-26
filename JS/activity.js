/* FILE PURPOSE: Builds and controls the outdoor GPS activity recording panel. */
/* =========================================================
   FILE: activity.js
   PURPOSE: Controls the outdoor Activity floating panel. The GPS logic
   itself lives in gps-tracker.js; this file updates the interface,
   keeps actual track points, and stores completed activity records.
========================================================= */
import GPSTracker from "./gps-tracker.js";
import { getUserData, saveUserData, createId } from "./storage.js";
import {
  drawRecordedTrack,
  locateOnMap,
  centerOn,
  refreshDataLayers,
  clearRecordedTrack,
} from "./map.js";
import {
  startNavigation,
  stopNavigation,
  updateNavigation,
  getActiveNavigation,
} from "./navigation.js";
import {
  showToast,
  openModal,
  formatDistance,
  formatDuration,
  escapeHTML,
  refreshIcons,
} from "./ui.js";

let tracker = null;
let selectedType = "walking";
let followLocation = true;
let displayTimer = null;
let navigationListenerAttached = false;

const typeLabel = (value) =>
  ({
    walking: "Walking",
    running: "Running",
    cycling: "Cycling",
    hiking: "Hiking",
  })[value] || "Walking";
function metric(value) {
  return Number.isFinite(value) ? value : 0;
}

export function getActivityPanelMarkup() {
  const active = Boolean(tracker?.isRecording);
  const paused = Boolean(tracker?.isPaused);
  const snapshot = tracker?.getSnapshot() || {
    distanceMeters: 0,
    elapsedMs: 0,
    currentSpeed: 0,
    averageSpeed: 0,
    paceMinutes: null,
    points: [],
  };
  const statusText = active
    ? paused
      ? "Paused"
      : "Recording"
    : "Ready to record";
  const statusClass = active ? (paused ? "paused" : "recording") : "";
  return `
    <p class="panel-intro">Record a real GPS track while you walk, run, cycle, or hike. Keep this page open while tracking.</p>
    <div class="form-field"><label for="activity-type">Activity type</label><select id="activity-type" ${active ? "disabled" : ""}><option value="walking" ${selectedType === "walking" ? "selected" : ""}>Walking</option><option value="running" ${selectedType === "running" ? "selected" : ""}>Running</option><option value="cycling" ${selectedType === "cycling" ? "selected" : ""}>Cycling</option><option value="hiking" ${selectedType === "hiking" ? "selected" : ""}>Hiking</option></select></div>
    <div class="form-inline" style="justify-content:space-between;margin:3px 0 12px"><span class="recording-status ${statusClass}" id="recording-status"><span class="status-dot"></span><span id="recording-status-text">${statusText}</span></span><label class="toggle-row" style="padding:0;gap:7px"><span style="font-size:9px;color:#748278">Follow me</span><input type="checkbox" id="follow-location" ${followLocation ? "checked" : ""}><span class="toggle-switch"></span></label></div>
    <div class="metric-grid">
      <div class="metric-card"><small>Distance traveled</small><strong id="activity-distance">${formatDistance(snapshot.distanceMeters)}</strong><span>Actual GPS distance</span></div>
      <div class="metric-card"><small>Elapsed time</small><strong id="activity-duration">${formatDuration(snapshot.elapsedMs)}</strong><span>Active recording time</span></div>
      <div class="metric-card"><small>Current speed</small><strong id="activity-speed">${(metric(snapshot.currentSpeed) * 3.6).toFixed(1)}</strong><span>km/h</span></div>
      <div class="metric-card"><small>Average pace</small><strong id="activity-pace">${snapshot.paceMinutes ? `${Math.floor(snapshot.paceMinutes)}:${String(Math.round((snapshot.paceMinutes % 1) * 60)).padStart(2, "0")}` : "—"}</strong><span>min/km</span></div>
    </div>
    <div class="activity-controls">
      <button class="button button-primary" id="activity-start" type="button" ${active ? "disabled" : ""}><i data-lucide="play"></i> Start</button>
      <button class="button button-secondary" id="activity-pause" type="button" ${!active || paused ? "disabled" : ""}><i data-lucide="pause"></i> Pause</button>
      <button class="button button-secondary" id="activity-resume" type="button" ${!active || !paused ? "disabled" : ""}><i data-lucide="play"></i> Resume</button>
      <button class="button button-danger" id="activity-finish" type="button" ${!active ? "disabled" : ""}><i data-lucide="square"></i> Finish</button>
    </div>
    <div class="activity-controls"><button class="button button-secondary" id="activity-add-route" type="button"><i data-lucide="route"></i> Add Route</button><button class="button button-secondary" id="activity-stop-route" type="button" ${getActiveNavigation() ? "" : "disabled"}><i data-lucide="x-circle"></i> Stop guidance</button></div>
    <div class="route-guidance ${getActiveNavigation() ? "" : "is-hidden"}" id="nav-guidance"><i data-lucide="navigation"></i><div><strong>Navigation ready</strong><small>Choose a saved route to follow it while recording.</small></div></div>
    <p class="settings-note" id="gps-note">${snapshot.points?.length ? `${snapshot.points.length} GPS points recorded.` : "GPS permission is requested when you press Start. Poor-accuracy and duplicate points are filtered."}</p>`;
}

function updateActivityMetrics(snapshot) {
  const distance = document.getElementById("activity-distance");
  if (!distance) return;
  distance.textContent = formatDistance(snapshot.distanceMeters);
  document.getElementById("activity-duration").textContent = formatDuration(
    snapshot.elapsedMs,
  );
  document.getElementById("activity-speed").textContent = (
    metric(snapshot.currentSpeed) * 3.6
  ).toFixed(1);
  const pace = snapshot.paceMinutes;
  document.getElementById("activity-pace").textContent =
    pace && Number.isFinite(pace)
      ? `${Math.floor(pace)}:${String(Math.round((pace % 1) * 60)).padStart(2, "0")}`
      : "—";
  const note = document.getElementById("gps-note");
  if (note)
    note.textContent = `${snapshot.points.length} accepted GPS point${snapshot.points.length === 1 ? "" : "s"} · GPS accuracy ${snapshot.accuracy ? `±${Math.round(snapshot.accuracy)} m` : "waiting"}.`;
}
function setStatus(status) {
  const pill = document.getElementById("recording-status");
  if (!pill) return;
  pill.className = `recording-status ${status === "recording" ? "recording" : status === "paused" ? "paused" : ""}`;
  document.getElementById("recording-status-text").textContent =
    status === "recording"
      ? "Recording"
      : status === "paused"
        ? "Paused"
        : "Ready to record";
  const start = document.getElementById("activity-start"),
    pause = document.getElementById("activity-pause"),
    resume = document.getElementById("activity-resume"),
    finish = document.getElementById("activity-finish"),
    type = document.getElementById("activity-type");
  if (start) start.disabled = status !== "idle";
  if (pause) pause.disabled = status !== "recording";
  if (resume) resume.disabled = status !== "paused";
  if (finish) finish.disabled = status === "idle";
  if (type) type.disabled = status !== "idle";
}
function onTrackerUpdate(snapshot, meta) {
  updateActivityMetrics(snapshot);
  if (meta.accepted && meta.point) {
    drawRecordedTrack(snapshot.points);
    locateOnMap(meta.point.lat, meta.point.lon, meta.point.accuracy || 0);
    if (followLocation) centerOn(meta.point.lat, meta.point.lon, 17);
    if (getActiveNavigation()) updateNavigation(meta.point);
  } else if (meta.reason === "accuracy") {
    const note = document.getElementById("gps-note");
    if (note)
      note.textContent = `GPS accuracy is currently too low (±${Math.round(snapshot.accuracy)} m). Waiting for a clearer fix.`;
  }
}
function beginTimer() {
  window.clearInterval(displayTimer);
  displayTimer = window.setInterval(() => {
    if (tracker?.isRecording) updateActivityMetrics(tracker.getSnapshot());
  }, 1000);
}
function finishTimer() {
  window.clearInterval(displayTimer);
  displayTimer = null;
}

function finishAndSave() {
  if (!tracker?.isRecording) return;
  const summary = tracker.finish();
  finishTimer();
  stopNavigation(false);
  setStatus("idle");
  if (summary.points.length < 2 || summary.distanceMeters < 2) {
    showToast(
      "Not enough GPS movement was recorded to save an activity.",
      "warning",
    );
    return;
  }
  const activity = {
    id: createId("activity"),
    type: selectedType,
    distanceMeters: summary.distanceMeters,
    durationMs: summary.elapsedMs,
    averageSpeed: summary.averageSpeed,
    averagePaceMinutes: summary.paceMinutes,
    points: summary.points,
    startedAt: summary.startedAt,
    finishedAt: new Date().toISOString(),
  };
  openModal({
    title: "Save completed activity",
    content: `<p>Your ${typeLabel(selectedType).toLowerCase()} has been recorded.</p><div class="metric-grid"><div class="metric-card"><small>Distance</small><strong>${formatDistance(activity.distanceMeters)}</strong></div><div class="metric-card"><small>Duration</small><strong>${formatDuration(activity.durationMs)}</strong></div></div><p style="margin:12px 0 0">Save this GPS track to your activity history?</p>`,
    confirmText: "Save activity",
    cancelText: "Discard",
    onConfirm: (close) => {
      const data = getUserData();
      data.activities.unshift(activity);
      saveUserData(data);
      refreshDataLayers();
      close();
      clearRecordedTrack();
      tracker = null;
      showToast("Activity saved to History.", "success");
      window.dispatchEvent(new CustomEvent("exerfit:activity-saved"));
      const container = document.getElementById("panel-content");
      if (container?.dataset.panel === "activity")
        mountActivityPanel(container);
    },
    onCancel: () => {
      clearRecordedTrack();
      tracker = null;
      const container = document.getElementById("panel-content");
      if (container?.dataset.panel === "activity")
        mountActivityPanel(container);
    },
  });
}

export function mountActivityPanel(container) {
  container.innerHTML = getActivityPanelMarkup();
  container.dataset.panel = "activity";
  refreshIcons(container);
  const typeSelect = container.querySelector("#activity-type");
  typeSelect?.addEventListener("change", (event) => {
    selectedType = event.target.value;
  });
  container
    .querySelector("#follow-location")
    ?.addEventListener("change", (event) => {
      followLocation = event.target.checked;
    });
  container.querySelector("#activity-start")?.addEventListener("click", () => {
    if (tracker?.isRecording) return;
    selectedType = typeSelect?.value || selectedType;
    clearRecordedTrack();
    tracker = new GPSTracker({
      onUpdate: onTrackerUpdate,
      onError: (message) => {
        showToast(message, "error", 5500);
      },
      onStatus: setStatus,
    });
    if (tracker.start()) {
      beginTimer();
      const activeRoute = getActiveNavigation();
      if (activeRoute) startNavigation(activeRoute, { externalGPS: true });
      showToast(`${typeLabel(selectedType)} recording started.`, "success");
    }
  });
  container.querySelector("#activity-pause")?.addEventListener("click", () => {
    tracker?.pause();
    showToast("Activity paused.", "info");
  });
  container.querySelector("#activity-resume")?.addEventListener("click", () => {
    tracker?.resume();
    showToast("Activity resumed.", "success");
  });
  container
    .querySelector("#activity-finish")
    ?.addEventListener("click", finishAndSave);
  container
    .querySelector("#activity-stop-route")
    ?.addEventListener("click", () => {
      stopNavigation(false);
      showToast("Route guidance stopped. GPS recording can continue.", "info");
    });
  container
    .querySelector("#activity-add-route")
    ?.addEventListener("click", openSavedRoutePicker);
  if (!navigationListenerAttached) {
    window.addEventListener("exerfit:navigation-state", (event) => {
      const stopButton = document.getElementById("activity-stop-route");
      if (stopButton) stopButton.disabled = !event.detail?.active;
    });
    navigationListenerAttached = true;
  }
  if (tracker?.isRecording) beginTimer();
}

function openSavedRoutePicker() {
  const routes = getUserData().routes;
  if (!routes.length) {
    openModal({
      title: "No saved routes yet",
      content:
        "<p>Search for a destination on the map, generate a route, and save it. You can then load it here while recording.</p>",
      showCancel: false,
      confirmText: "Got it",
      onConfirm: (close) => close(),
    });
    return;
  }
  const options = routes
    .map(
      (route) =>
        `<button class="modal-route-option" type="button" data-route-id="${escapeHTML(route.id)}"><i data-lucide="route"></i><span><strong>${escapeHTML(route.name)}</strong><small>${formatDistance(route.distanceMeters)} · ${escapeHTML(route.mode)}</small></span></button>`,
    )
    .join("");
  openModal({
    title: "Add a saved route",
    content: `<p>Choose a planned route to display over your live GPS track.</p><div>${options}</div>`,
    showCancel: true,
    onConfirm: (close) => close(),
    confirmText: "Close",
  });
  document.querySelectorAll("[data-route-id]").forEach((button) =>
    button.addEventListener("click", () => {
      const route = routes.find((item) => item.id === button.dataset.routeId);
      if (!route) return;
      startNavigation(route, { externalGPS: Boolean(tracker?.isRecording) });
      closeModalSafe();
      showToast(
        `Following ${route.name}. Your real GPS track remains separate.`,
        "success",
      );
      const content = document.getElementById("panel-content");
      if (content?.dataset.panel === "activity") mountActivityPanel(content);
    }),
  );
  refreshIcons(document.getElementById("app-modal-backdrop"));
}
function closeModalSafe() {
  document.getElementById("modal-close")?.click();
}

export function getTracker() {
  return tracker;
}
