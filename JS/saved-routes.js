/* =========================================================
   FILE: saved-routes.js
   PURPOSE: Manages the Saved Routes floating panel and Add Route library.
   Saved routes are navigation plans, not completed activities.
========================================================= */
import { getUserData, saveUserData } from "./storage.js";
import {
  drawPlannedRoute,
  showDestination,
  centerOn,
  refreshDataLayers,
} from "./map.js";
import { startNavigation } from "./navigation.js";
import {
  openModal,
  showToast,
  formatDistance,
  formatDuration,
  escapeHTML,
  refreshIcons,
} from "./ui.js";

export function mountSavedRoutesPanel(container) {
  const routes = getUserData().routes;
  const list = routes.length
    ? routes
        .map(
          (route) => `
    <article class="list-card">
      <div class="list-card-top"><div><h3>${escapeHTML(route.name || "Saved route")}</h3><p>${escapeHTML(route.start?.name || "Start")} → ${escapeHTML(route.destination?.name || "Destination")}</p></div><span class="recording-status">${escapeHTML(route.mode || "walking")}</span></div>
      <div class="list-card-meta"><span><i data-lucide="route"></i>${formatDistance(route.distanceMeters)}</span><span><i data-lucide="clock"></i>${formatDuration((route.durationSeconds || 0) * 1000)}</span><span><i data-lucide="calendar"></i>${new Date(route.createdAt).toLocaleDateString()}</span></div>
      <div class="list-card-actions"><button class="button button-secondary" type="button" data-view-route="${escapeHTML(route.id)}"><i data-lucide="eye"></i> View</button><button class="button button-primary" type="button" data-navigate-route="${escapeHTML(route.id)}"><i data-lucide="navigation"></i> Navigate</button><button class="button button-secondary" type="button" data-rename-route="${escapeHTML(route.id)}"><i data-lucide="pencil"></i> Rename</button><button class="button button-danger" type="button" data-delete-route="${escapeHTML(route.id)}"><i data-lucide="trash-2"></i></button></div>
    </article>`,
        )
        .join("")
    : `<div class="empty-state"><i data-lucide="route"></i><strong>No saved routes yet</strong><p>Search a destination on the map, generate a route, then save it to your library.</p></div>`;
  container.innerHTML = `<p class="panel-intro">Your route library stores planned journeys separately from completed activities.</p><div class="panel-section-title"><span>Your routes</span><small>${routes.length} saved</small></div><div class="panel-list">${list}</div>`;
  container.dataset.panel = "routes";
  refreshIcons(container);
  container.querySelectorAll("[data-view-route]").forEach((button) =>
    button.addEventListener("click", () => {
      const route = routes.find((item) => item.id === button.dataset.viewRoute);
      if (!route) return;
      drawPlannedRoute(route.coordinates);
      showDestination(
        route.destination.lat,
        route.destination.lon,
        route.destination.name,
      );
      showToast(`Showing ${route.name} on the map.`, "info");
    }),
  );
  container.querySelectorAll("[data-navigate-route]").forEach((button) =>
    button.addEventListener("click", () => {
      const route = routes.find(
        (item) => item.id === button.dataset.navigateRoute,
      );
      if (!route) return;
      startNavigation(route);
      showDestination(
        route.destination.lat,
        route.destination.lon,
        route.destination.name,
      );
      window.dispatchEvent(
        new CustomEvent("exerfit:open-panel", {
          detail: { panel: "activity" },
        }),
      );
    }),
  );
  container.querySelectorAll("[data-rename-route]").forEach((button) =>
    button.addEventListener("click", () => {
      const route = routes.find(
        (item) => item.id === button.dataset.renameRoute,
      );
      if (!route) return;
      openModal({
        title: "Rename route",
        content: `<label class="form-field"><span>Route name</span><input class="modal-form-input" id="rename-route-input" maxlength="60" value="${escapeHTML(route.name)}"></label>`,
        confirmText: "Save name",
        onConfirm: (close) => {
          const name = document
            .getElementById("rename-route-input")
            .value.trim();
          if (!name) {
            showToast("Enter a route name.", "warning");
            return;
          }
          const data = getUserData();
          const target = data.routes.find((item) => item.id === route.id);
          target.name = name;
          saveUserData(data);
          close();
          mountSavedRoutesPanel(container);
          refreshDataLayers();
          showToast("Route name updated.");
        },
      });
    }),
  );
  container.querySelectorAll("[data-delete-route]").forEach((button) =>
    button.addEventListener("click", () => {
      const route = routes.find(
        (item) => item.id === button.dataset.deleteRoute,
      );
      if (!route) return;
      openModal({
        title: "Delete saved route?",
        content: `<p><strong>${escapeHTML(route.name)}</strong> will be removed from your route library. Completed activity records will not be affected.</p>`,
        confirmText: "Delete route",
        confirmVariant: "button-danger",
        onConfirm: (close) => {
          const data = getUserData();
          data.routes = data.routes.filter((item) => item.id !== route.id);
          saveUserData(data);
          close();
          mountSavedRoutesPanel(container);
          refreshDataLayers();
          showToast("Saved route deleted.", "info");
        },
      });
    }),
  );
}
