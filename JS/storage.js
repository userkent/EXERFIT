/*
- PURPOSE:
- Central storage helpers for local accounts and per-account ExerFit data.
- Other scripts use this file instead of accessing localStorage directly.
 */
(function () {
  "use strict";

  // Setup & Storage Keys: creates the main app object and names the browser storage slots for user accounts and active logins
  const EF = (window.ExerFit = window.ExerFit || {});
  const USERS_KEY = "exerfit_users_v1";
  const SESSION_KEY = "exerfit_session_v1";

  // Starter Account Template: creates a blank profile, default settings, and empty workout/goal lists for every new user
  function defaultData(user) {
    return {
      profile: {
        fullName: user?.name || "ExerFit Member",
        username: (user?.email || "member").split("@")[0],
        email: user?.email || "",
        bio: "",
        location: "",
        birthday: "",
        gender: "",
        height: "",
        weight: "",
        avatar: "",
      },
      settings: {
        theme: "system",
        accent: "#16a34a",
        motion: "full",
        distanceUnit: "km",
        temperatureUnit: "C",
        weekStart: "monday",
        activeGoalMinutes: 30,
        defaultActivity: "Walk",
        defaultMapStyle: "standard",
        runningPaceSecondsPerKm: 420,
        apiKey: "",
        dailyReminder: false,
        reminderTime: "18:00",
        weeklySummary: false,
        profileVisibility: "private",
        showRoutes: false,
      },
      activities: [],
      goals: [],
      routes: [],
      dashboard: {
        widgets: ["progress", "activity-plan", "weather-goals", "insights"],
        hiddenWidgets: [],
      },
      dailyPlan: [],
    };
  }

  // Safe Browser Reader & Writer: loads and saves data into browser localStorage without crashing if storage is full or blocked
  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (error) {
      console.warn("ExerFit could not read saved data:", error);
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error("ExerFit could not save data:", error);
      EF.ui?.toast(
        "Could not save. Browser storage may be full or blocked.",
        "error",
      );
      return false;
    }
  }

  // User Accounts & Login Session Helpers: manages the list of registered users and remembers who is currently logged in
  function getUsers() {
    const users = readJSON(USERS_KEY, []);
    return Array.isArray(users) ? users : [];
  }
  function saveUsers(users) {
    return writeJSON(USERS_KEY, users);
  }
  function getSession() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    } catch (error) {
      console.warn("Session data could not be read:", error);
      return null;
    }
  }
  function setSession(userId) {
    try {
      if (userId)
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ userId }));
      else sessionStorage.removeItem(SESSION_KEY);
      return true;
    } catch (error) {
      console.warn("Session storage is unavailable:", error);
      return false;
    }
  }
  function currentUser() {
    const session = getSession();
    if (!session?.userId) return null;
    return getUsers().find((user) => user.id === session.userId) || null;
  }
  function dataKey(userId) {
    return `exerfit_data_${userId}`;
  }

  // Load Personal Account Data: fetches the logged-in user's profile, settings, and workouts, filling in any missing default fields
  function getData(userId) {
    const user =
      getUsers().find((item) => item.id === (userId || currentUser()?.id)) ||
      currentUser();
    if (!user) return null;
    const key = dataKey(user.id);
    const saved = readJSON(key, null);
    const base = defaultData(user);
    if (!saved || typeof saved !== "object") {
      writeJSON(key, base);
      return base;
    }
    // Combine saved data with default fields so older backups stay compatible
    return {
      ...base,
      ...saved,
      profile: { ...base.profile, ...(saved.profile || {}) },
      settings: { ...base.settings, ...(saved.settings || {}) },
      activities: Array.isArray(saved.activities) ? saved.activities : [],
      goals: Array.isArray(saved.goals) ? saved.goals : [],
      routes: Array.isArray(saved.routes) ? saved.routes : [],
      dashboard: {
        ...base.dashboard,
        ...(saved.dashboard || {}),
        hiddenWidgets: Array.isArray(saved.dashboard?.hiddenWidgets)
          ? saved.dashboard.hiddenWidgets
          : [],
      },
      dailyPlan: Array.isArray(saved.dailyPlan) ? saved.dailyPlan : [],
    };
  }

  // Save & Update Account Data: writes changes back to the user's personal browser storage slot
  function saveData(data, userId) {
    const user =
      getUsers().find((item) => item.id === (userId || currentUser()?.id)) ||
      currentUser();
    if (!user || !data) return false;
    return writeJSON(dataKey(user.id), data);
  }

  function updateData(mutator, userId) {
    const data = getData(userId);
    if (!data) return null;
    mutator(data);
    saveData(data, userId);
    return data;
  }

  // Date Formatter (YYYY-MM-DD): converts timestamps into local calendar dates for streaks, charts, and heatmaps
  function localDateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  // Unique ID Generator: builds random IDs (like "goal_m1a2b3_x9y8z7") for new workouts, goals, and plan items
  function createId(prefix = "item") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // Text Safety Cleaner (XSS Protection): turns special symbols like < and > into safe text so user input can't break the page HTML
  function escapeHTML(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  }

  // File Downloader: creates a downloadable file (used when exporting CSV spreadsheets or JSON backups)
  function downloadFile(filename, content, mime = "text/plain") {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Share Tools: makes all storage, session, and helper functions available to every other JavaScript file
  EF.Store = {
    readJSON,
    writeJSON,
    getUsers,
    saveUsers,
    getSession,
    setSession,
    currentUser,
    getData,
    saveData,
    updateData,
    createId,
    localDateKey,
    escapeHTML,
    downloadFile,
    defaultData,
  };
})();
