/*
- PURPOSE:
- Shared reveal, count-up, tilt, and reduced-motion helpers.
 */
(function () {
  "use strict";

  // Setup & Animation Settings Checker: checks if the user wants full animations, reduced animations, or no animations at all
  const EF = (window.ExerFit = window.ExerFit || {});
  function motionMode() {
    return EF.Store?.getData()?.settings?.motion || "full";
  }
  function effectiveMotionMode() {
    const selected = motionMode();
    if (selected === "off") return "off";
    if (
      selected === "reduced" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return "reduced";
    return "full";
  }
  function motionAllowed() {
    return effectiveMotionMode() === "full";
  }

  // Main Animation Starter: turns on scroll fade-ins, rolling numbers, and 3D card tilt effects across the page
  function init(root = document) {
    const mode = effectiveMotionMode();
    document.documentElement.dataset.motion = mode;

    // If animations are turned off or reduced, show everything immediately without sliding/fading in
    if (mode !== "full") {
      root
        .querySelectorAll?.(".reveal")
        .forEach((item) => item.classList.add("visible"));
      return;
    }

    // Scroll Fade-In Effect: smoothly reveals elements with the "reveal" class as you scroll them into view
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) =>
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("visible");
              observer.unobserve(entry.target);
            }
          }),
        { threshold: 0.12 },
      );
      root
        .querySelectorAll?.(".reveal:not(.visible)")
        .forEach((item) => observer.observe(item));
    } else
      root
        .querySelectorAll?.(".reveal")
        .forEach((item) => item.classList.add("visible"));

    // Rolling Number Counter: animates numbers (like stats) counting up from 0 to their final value
    root.querySelectorAll?.("[data-count]").forEach((element) => {
      if (element.dataset.countDone) return;
      element.dataset.countDone = "1";
      const target = Number(element.dataset.count || 0);
      const suffix = element.dataset.suffix || "";
      if (!Number.isFinite(target)) return;
      const duration = motionMode() === "reduced" ? 350 : 850;
      const start = performance.now();
      function tick(now) {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        element.textContent = `${Math.round(target * eased).toLocaleString()}${suffix}`;
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });

    // 3D Hover Tilt Effect: slightly tilts cards toward your mouse cursor when hovering over them on a computer
    if (
      mode === "full" &&
      matchMedia("(hover: hover) and (pointer: fine)").matches
    ) {
      root.querySelectorAll?.(".tilt-card").forEach((card) => {
        if (card.dataset.tiltReady) return;
        card.dataset.tiltReady = "1";
        card.addEventListener("pointermove", (event) => {
          const rect = card.getBoundingClientRect();
          const x = (event.clientX - rect.left) / rect.width - 0.5;
          const y = (event.clientY - rect.top) / rect.height - 0.5;
          card.style.transform = `perspective(850px) rotateX(${(-y * 4).toFixed(2)}deg) rotateY(${(x * 5).toFixed(2)}deg) translateY(-2px)`;
        });
        card.addEventListener("pointerleave", () => {
          card.style.transform = "";
        });
      });
    }
  }

  // Share Tools: makes these animation helpers available to every page in the app
  EF.Motion = { init, motionAllowed, motionMode, effectiveMotionMode };
})();
