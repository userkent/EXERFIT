/* =========================================================
   FILE: drag-cards.js
   PURPOSE: Lets map overlay cards be moved around the map.
   HOW IT WORKS:
   - Each card has data-draggable-card and an optional handle selector.
   - Pointer events support mouse, pen, and touch.
   - Card positions are remembered separately for each signed-in user.
   MODIFY HERE: Change POSITION_STORAGE_PREFIX to rename the saved layout key.
========================================================= */

const POSITION_STORAGE_PREFIX = "exerfit.card-positions";

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function getPositionStorageKey() {
  try {
    const session = JSON.parse(localStorage.getItem("exerfit.session") || "{}");
    return `${POSITION_STORAGE_PREFIX}.${session.userId || "guest"}`;
  } catch (error) {
    return `${POSITION_STORAGE_PREFIX}.guest`;
  }
}

function readPositions() {
  try {
    return JSON.parse(localStorage.getItem(getPositionStorageKey()) || "{}");
  } catch (error) {
    return {};
  }
}

function savePositions(positions) {
  try {
    localStorage.setItem(getPositionStorageKey(), JSON.stringify(positions));
  } catch (error) {
    // Dragging still works for this page view if browser storage is full or disabled.
    console.warn("ExerFit could not remember the map card layout.", error);
  }
}

/**
 * Add dragging to the cards inside the map workspace.
 * @param {string} workspaceId ID of the map container that bounds the cards.
 */
export function initDraggableCards(workspaceId = "map-workspace") {
  const workspace = document.getElementById(workspaceId);
  if (!workspace) return;

  const cards = [...workspace.querySelectorAll("[data-draggable-card]")];
  const positions = readPositions();

  // Restore a saved position without changing a card that has never been moved.
  cards.forEach((card) => {
    const cardKey = card.dataset.dragKey || card.id;
    const saved = positions[cardKey];
    if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y))
      return;
    applyPosition(card, workspace, saved.x, saved.y, saved.h);
  });

  cards.forEach((card) => {
    if (card.dataset.dragReady === "true") return;
    const handleSelector = card.dataset.dragHandle;
    const handle = handleSelector ? card.querySelector(handleSelector) : card;
    if (!handle) return;

    card.dataset.dragReady = "true";
    handle.classList.add("is-drag-handle");

    let activePointerId = null;
    let startPointerX = 0;
    let startPointerY = 0;
    let startLeft = 0;
    let startTop = 0;
    let moved = false;

    const onPointerDown = (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      if (event.isPrimary === false) return;

      // Header controls remain clickable; they are not drag handles.
      if (
        event.target.closest(
          'button, a, input, select, textarea, label, [contenteditable="true"]',
        )
      )
        return;
      if (card.classList.contains("is-hidden") || card.hidden) return;

      const workspaceRect = workspace.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      activePointerId = event.pointerId;
      startPointerX = event.clientX;
      startPointerY = event.clientY;
      startLeft = cardRect.left - workspaceRect.left;
      startTop = cardRect.top - workspaceRect.top;
      const startHeight = cardRect.height;
      moved = false;

      // Convert right/bottom anchored cards to left/top coordinates without a visible jump.
      // Keep the measured height so tall panels retain their scrollable card layout.
      applyPosition(card, workspace, startLeft, startTop, startHeight);
      card.classList.add("is-dragging");
      document.body.classList.add("dragging-map-card");
      event.preventDefault();
      event.stopPropagation();
    };

    const onPointerMove = (event) => {
      if (activePointerId === null || event.pointerId !== activePointerId)
        return;
      const deltaX = event.clientX - startPointerX;
      const deltaY = event.clientY - startPointerY;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 3) moved = true;

      const workspaceWidth = workspace.clientWidth;
      const workspaceHeight = workspace.clientHeight;
      const nextX = clamp(
        startLeft + deltaX,
        0,
        workspaceWidth - card.offsetWidth,
      );
      const nextY = clamp(
        startTop + deltaY,
        0,
        workspaceHeight - card.offsetHeight,
      );
      card.style.left = `${nextX}px`;
      card.style.top = `${nextY}px`;
      event.preventDefault();
    };

    const onPointerUp = (event) => {
      if (activePointerId === null || event.pointerId !== activePointerId)
        return;
      activePointerId = null;
      card.classList.remove("is-dragging");
      document.body.classList.remove("dragging-map-card");

      if (moved) {
        const cardKey = card.dataset.dragKey || card.id;
        const currentPositions = readPositions();
        currentPositions[cardKey] = {
          x: Math.round(Number.parseFloat(card.style.left) || 0),
          y: Math.round(Number.parseFloat(card.style.top) || 0),
          h: Math.round(card.getBoundingClientRect().height),
        };
        savePositions(currentPositions);
      }
    };

    handle.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  });

  // Keep stored positions visible and within the map after a resize or orientation change.
  window.addEventListener("resize", () => {
    cards.forEach((card) => {
      if (!card.style.left || !card.style.top) return;
      const x = clamp(
        Number.parseFloat(card.style.left) || 0,
        0,
        workspace.clientWidth - card.offsetWidth,
      );
      const y = clamp(
        Number.parseFloat(card.style.top) || 0,
        0,
        workspace.clientHeight - card.offsetHeight,
      );
      card.style.left = `${x}px`;
      card.style.top = `${y}px`;
    });
  });
}

function applyPosition(card, workspace, x, y, height) {
  const safeX = clamp(x, 0, workspace.clientWidth - card.offsetWidth);
  const safeY = clamp(y, 0, workspace.clientHeight - card.offsetHeight);
  card.style.left = `${safeX}px`;
  card.style.top = `${safeY}px`;
  card.style.right = "auto";
  card.style.bottom = "auto";
  if (Number.isFinite(height) && height > 0) card.style.height = `${height}px`;
}
