/* =========================================================
   FILE: ui.js
   PURPOSE: Shared notifications, modal dialogs, and small UI helpers.
========================================================= */
export function refreshIcons(scope = document) {
  if (window.lucide?.createIcons) window.lucide.createIcons();
}
export function escapeHTML(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}
export function showToast(message, type = "success", duration = 3400) {
  const region = document.getElementById("toast-region");
  if (!region) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type === "success" ? "" : type}`;
  const icon =
    type === "error"
      ? "alert-circle"
      : type === "warning"
        ? "alert-triangle"
        : type === "info"
          ? "info"
          : "check-circle-2";
  toast.innerHTML = `<i data-lucide="${icon}"></i><span>${escapeHTML(message)}</span>`;
  region.append(toast);
  refreshIcons(toast);
  window.setTimeout(() => toast.remove(), duration);
}
export function openModal({
  title,
  content = "",
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  showCancel = true,
  confirmVariant = "button-primary",
}) {
  const backdrop = document.getElementById("app-modal-backdrop");
  if (!backdrop) return;
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-content").innerHTML = content;
  const actions = document.getElementById("modal-actions");
  actions.innerHTML = "";
  if (showCancel) {
    const cancel = document.createElement("button");
    cancel.className = "button button-secondary";
    cancel.type = "button";
    cancel.textContent = cancelText;
    cancel.addEventListener("click", () => {
      closeModal();
      onCancel?.();
    });
    actions.append(cancel);
  }
  if (onConfirm) {
    const confirm = document.createElement("button");
    confirm.className = `button ${confirmVariant}`;
    confirm.type = "button";
    confirm.textContent = confirmText;
    confirm.addEventListener("click", () => onConfirm(closeModal));
    actions.append(confirm);
  }
  backdrop.classList.remove("is-hidden");
  document.body.classList.add("modal-open");
  refreshIcons(backdrop);
}
export function closeModal() {
  const backdrop = document.getElementById("app-modal-backdrop");
  backdrop?.classList.add("is-hidden");
  document.body.classList.remove("modal-open");
}
export function bindModalChrome() {
  document.getElementById("modal-close")?.addEventListener("click", closeModal);
  document
    .getElementById("app-modal-backdrop")
    ?.addEventListener("click", (event) => {
      if (event.target.id === "app-modal-backdrop") closeModal();
    });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
}
export function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}
export function formatDistance(meters, unit = "km") {
  if (!Number.isFinite(meters)) return "—";
  return unit === "mi"
    ? `${(meters / 1609.344).toFixed(2)} mi`
    : `${(meters / 1000).toFixed(2)} km`;
}
