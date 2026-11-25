/*
- PURPOSE:
- Landing-page navigation, FAQ behavior, scroll reveals, and the isolated tracker demo.
 */
(function () {
  "use strict";

  // Top Menu Scroll Effect: changes the look of the top navigation bar after you scroll down 30 pixels
  const nav = document.getElementById("landing-nav");
  const onScroll = () => nav?.classList.toggle("scrolled", window.scrollY > 30);
  onScroll(); window.addEventListener("scroll", onScroll, { passive: true });

  // FAQ Dropdown Buttons: opens or closes the answer when you click a question and switches the "+" icon to "−"
  document.querySelectorAll(".faq-q").forEach((button) => {
    button.addEventListener("click", () => {
      const item = button.closest(".faq-item");
      const open = item.classList.toggle("open");
      button.setAttribute("aria-expanded", String(open));
      button.querySelector("span").textContent = open ? "−" : "+";
    });
  });

  // Pretend Tracker Demo: powers the interactive sample workout on the home page (does not use GPS or save real workouts)
  const startButton = document.getElementById("demo-start");
  if (startButton) {
    // Grab all the buttons, number displays, and status text inside the demo box
    const pauseButton = document.getElementById("demo-pause");
    const finishButton = document.getElementById("demo-finish");
    const timeNode = document.getElementById("demo-time");
    const distanceNode = document.getElementById("demo-distance");
    const paceNode = document.getElementById("demo-pace");
    const statusNode = document.getElementById("demo-status");
    const noteNode = document.getElementById("demo-note");

    // Demo Timer & Display Updater: tracks elapsed seconds and updates the MM:SS clock, fake distance, and pace
    let elapsed = 0; let timer = null; let running = false; let finished = false;
    const formatTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    const render = () => {
      timeNode.textContent = formatTime(elapsed);
      const distance = elapsed * 0.0025;
      distanceNode.textContent = `${distance.toFixed(2)} km`;
      paceNode.textContent = distance > 0 ? "6:40 /km" : "—";
    };
    const stopTimer = () => { if (timer) window.clearInterval(timer); timer = null; running = false; };

    // Start Button: starts counting up every second and turns on the Pause and Finish buttons
    startButton.addEventListener("click", () => {
      if (finished) { elapsed = 0; finished = false; render(); }
      if (running) return;
      running = true; statusNode.textContent = "Demo running"; noteNode.textContent = "Simulated values only — this session is not saved.";
      startButton.disabled = true; pauseButton.disabled = false; finishButton.disabled = false;
      timer = window.setInterval(() => { elapsed += 1; render(); }, 1000);
    });

    // Pause / Resume Button: freezes the timer when paused and continues counting when resumed
    pauseButton.addEventListener("click", () => {
      if (running) { stopTimer(); pauseButton.textContent = "Resume"; statusNode.textContent = "Paused"; }
      else if (!finished) { running = true; pauseButton.textContent = "Pause"; statusNode.textContent = "Demo running"; timer = window.setInterval(() => { elapsed += 1; render(); }, 1000); }
    });

    // Finish / Reset Button: stops the demo when finished, or resets everything back to 00:00 when clicked again
    finishButton.addEventListener("click", () => {
      if (finished) {
        elapsed = 0; finished = false; finishButton.textContent = "Finish"; startButton.textContent = "Start";
        pauseButton.textContent = "Pause"; startButton.disabled = false; pauseButton.disabled = true; finishButton.disabled = true;
        render(); statusNode.textContent = "Ready to start"; noteNode.textContent = "Illustrative route and weather only. No live location is used.";
        return;
      }
      stopTimer(); finished = true; statusNode.textContent = "Demo finished"; pauseButton.disabled = true; finishButton.textContent = "Reset"; startButton.disabled = false; startButton.textContent = "Restart";
      noteNode.textContent = "Finished simulated session. Nothing was added to your real activity history.";
    });
    render();
  }

  // Scroll Fade-In Animations: smoothly reveals cards and sections as you scroll down the page
  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add("visible"); observer.unobserve(entry.target); }
    }), { threshold: .12 });
    document.querySelectorAll(".reveal").forEach((item) => observer.observe(item));
  } else document.querySelectorAll(".reveal").forEach((item) => item.classList.add("visible"));
})();