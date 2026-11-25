/*
- PURPOSE:
- Private-by-default profile display, editable profile form, avatar handling,
- and profile accent-color presets.
 */
(function () {
  "use strict";

  // Setup: grabs the main app object and helper shortcuts for selecting HTML elements and reading saved data
  const EF = window.ExerFit;
  const $ = (selector) => document.querySelector(selector);
  const getData = () => EF.Store.getData();

  // Initials Maker: takes the first letters of your first and last name (e.g., "John Doe" -> "JD") when you have no photo
  function initials(name) {
    return String(name || "E")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((item) => item[0])
      .join("")
      .toUpperCase();
  }

  // Profile Page Display: fills in your personal info, lifetime workout totals, badges, and profile picture across the page
  function render() {
    const data = getData();
    const profile = data.profile;
    const activities = data.activities;

    // Show personal details (name, username, bio, location, birthday, height, weight)
    $("#profile-name").textContent = profile.fullName || "ExerFit Member";
    $("#profile-username").textContent = `@${profile.username || "member"}`;
    $("#profile-bio").textContent = profile.bio || "Not added";
    $("#profile-location").textContent = profile.location || "Not added";
    $("#profile-birthday").textContent = profile.birthday
      ? new Date(`${profile.birthday}T00:00:00`).toLocaleDateString()
      : "Not added";
    $("#profile-height").textContent = profile.height
      ? `${profile.height} cm`
      : "Not added";
    $("#profile-weight").textContent = profile.weight
      ? `${profile.weight} kg`
      : "Not added";

    // Calculate and show lifetime workout count, active minutes, distance, and unlocked badges
    $("#profile-activity-count").textContent = activities.length;
    $("#profile-total-minutes").textContent = Math.round(
      activities.reduce((sum, item) => sum + (item.duration || 0), 0) / 60,
    );
    $("#profile-total-distance").textContent =
      `${activities.reduce((sum, item) => sum + (item.distance || 0), 0).toFixed(2)} km`;
    const badges = [
      activities.length >= 1 ? "First session" : null,
      activities.length >= 3 ? "Three sessions" : null,
      activities.length >= 5 ? "Five sessions" : null,
    ].filter(Boolean);
    $("#profile-badge-count").textContent = badges.length;
    $("#profile-badges").innerHTML = badges.length
      ? badges
          .map(
            (name) =>
              `<span class="badge-item">${EF.Store.escapeHTML(name)} · Earned</span>`,
          )
          .join("")
      : '<span class="badge-item locked">First session · Locked</span>';

    // Update your profile photo (or initials) on the main profile card, top header bar, and left sidebar
    const avatar = $("#profile-avatar");
    if (profile.avatar) {
      avatar.innerHTML = "";
      const image = document.createElement("img");
      image.src = profile.avatar;
      image.alt = "Profile photo";
      avatar.appendChild(image);
    } else avatar.textContent = initials(profile.fullName);
    const headerAvatar = document.querySelector(".topbar-right .avatar");
    if (headerAvatar) {
      headerAvatar.innerHTML = "";
      if (profile.avatar) {
        const image = document.createElement("img");
        image.src = profile.avatar;
        image.alt = "";
        headerAvatar.appendChild(image);
      } else headerAvatar.textContent = initials(profile.fullName);
    }
    const sidebarAvatar = document.querySelector(".sidebar .avatar");
    if (sidebarAvatar) {
      sidebarAvatar.innerHTML = "";
      if (profile.avatar) {
        const image = document.createElement("img");
        image.src = profile.avatar;
        image.alt = "";
        sidebarAvatar.appendChild(image);
      } else sidebarAvatar.textContent = initials(profile.fullName);
    }
  }

  // Edit Profile Pop-Up Window: opens a modal form so you can edit your details, upload a photo, and pick an accent color
  function openEditor() {
    const profile = getData().profile;
    const modal = EF.ui.openModal(
      "Edit profile",
      `
      <form id="profile-form"><div class="field"><label for="edit-full-name">Full name</label><input id="edit-full-name" maxlength="80" required value="${EF.Store.escapeHTML(profile.fullName)}"></div>
      <div class="field"><label for="edit-username">Username</label><input id="edit-username" maxlength="30" pattern="[A-Za-z0-9_.-]+" value="${EF.Store.escapeHTML(profile.username)}"><small class="field-help">Letters, numbers, dots, dashes, or underscores.</small></div>
      <div class="field"><label for="edit-bio">Bio <span id="bio-count" class="muted">${(profile.bio || "").length}/160</span></label><textarea id="edit-bio" maxlength="160" placeholder="A little about your activity interests">${EF.Store.escapeHTML(profile.bio)}</textarea></div>
      <div class="form-row"><div class="field"><label for="edit-location">Location</label><input id="edit-location" maxlength="80" value="${EF.Store.escapeHTML(profile.location)}"></div><div class="field"><label for="edit-birthday">Birthday</label><input id="edit-birthday" type="date" value="${EF.Store.escapeHTML(profile.birthday)}"></div></div>
      <div class="form-row"><div class="field"><label for="edit-gender">Gender (optional)</label><select id="edit-gender"><option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Non-binary</option><option>Self-describe</option></select></div><div class="field"><label for="edit-height">Height in cm (optional)</label><input id="edit-height" type="number" min="50" max="250" value="${EF.Store.escapeHTML(profile.height)}"></div></div>
      <div class="field"><label for="edit-weight">Weight in kg (optional, private)</label><input id="edit-weight" type="number" min="10" max="400" step="0.1" value="${EF.Store.escapeHTML(profile.weight)}"><small class="field-help">Optional profile information only. ExerFit does not use it to rank people or suggest weight changes.</small></div>
      <div class="field"><label for="edit-avatar">Profile photo (optional, image up to 2 MB)</label><input id="edit-avatar" type="file" accept="image/*"><div id="edit-avatar-preview" class="avatar-preview-note">${profile.avatar ? "A profile photo is currently selected." : "No profile photo selected."}</div><button type="button" class="btn ghost small-btn" id="remove-avatar">Remove profile photo</button></div>
      <div class="field"><label>Accent preset</label><div class="row wrap"><button type="button" class="btn secondary small-btn" data-accent="#16a34a">Green</button><button type="button" class="btn secondary small-btn" data-accent="#0d9488">Teal</button><button type="button" class="btn secondary small-btn" data-accent="#2563eb">Blue</button><button type="button" class="btn secondary small-btn" data-accent="#7c3aed">Violet</button></div><label for="profile-custom-accent" style="margin-top:10px">Custom accent color</label><input id="profile-custom-accent" type="color" value="${EF.Store.escapeHTML(getData().settings.accent || "#16a34a")}" aria-label="Choose a custom accent color"></div>
    </form>`,
      '<button type="button" class="btn secondary" data-cancel>Cancel</button><button type="button" class="btn" id="profile-save">Save profile</button>',
    );

    // Set initial values and live character counter for the bio box
    const form = modal.body.querySelector("#profile-form");
    form.querySelector("#edit-gender").value = profile.gender || "";
    form.querySelector("#edit-bio").addEventListener("input", (event) => {
      form.querySelector("#bio-count").textContent =
        `${event.target.value.length}/160`;
    });
    let accent = getData().settings.accent || "#16a34a";
    let avatarData = profile.avatar || "";
    const preview = form.querySelector("#edit-avatar-preview");
    const updateAvatarPreview = () => {
      preview.textContent = avatarData
        ? "A profile photo is selected."
        : "No profile photo selected.";
    };

    // Accent Color Buttons & Color Picker: lets you pick a preset color (Green, Teal, Blue, Violet) or any custom color
    form.querySelectorAll("[data-accent]").forEach((button) =>
      button.addEventListener("click", () => {
        accent = button.dataset.accent;
        form.querySelector("#profile-custom-accent").value = accent;
        form
          .querySelectorAll("[data-accent]")
          .forEach(
            (item) =>
              (item.style.borderColor =
                item === button ? "var(--green)" : "var(--line)"),
          );
      }),
    );
    form
      .querySelector("#profile-custom-accent")
      .addEventListener("input", (event) => {
        accent = event.target.value;
        form
          .querySelectorAll("[data-accent]")
          .forEach(
            (item) =>
              (item.style.borderColor =
                item.dataset.accent === accent
                  ? "var(--green)"
                  : "var(--line)"),
          );
      });

    // Profile Photo Upload & Removal: checks that the image is under 2 MB, reads it into browser storage, or clears it
    form.querySelector("#remove-avatar").addEventListener("click", () => {
      avatarData = "";
      form.querySelector("#edit-avatar").value = "";
      updateAvatarPreview();
      EF.ui.toast("Profile photo will be removed when you save.");
    });
    form
      .querySelector("#edit-avatar")
      .addEventListener("change", async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
          EF.ui.toast("Choose an image smaller than 2 MB.", "error");
          event.target.value = "";
          return;
        }
        try {
          avatarData = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          updateAvatarPreview();
        } catch (error) {
          EF.ui.toast("The selected photo could not be read.", "error");
        }
      });

    // Save Profile Button Handler: saves your updated info and accent color, refreshes the page, and applies the new theme color
    modal.actions.querySelector("[data-cancel]").onclick = modal.close;
    modal.actions.querySelector("#profile-save").onclick = () => {
      if (!form.reportValidity()) return;
      const values = {
        fullName: form.querySelector("#edit-full-name").value.trim(),
        username: form.querySelector("#edit-username").value.trim(),
        bio: form.querySelector("#edit-bio").value.trim(),
        location: form.querySelector("#edit-location").value.trim(),
        birthday: form.querySelector("#edit-birthday").value,
        gender: form.querySelector("#edit-gender").value,
        height: form.querySelector("#edit-height").value,
        weight: form.querySelector("#edit-weight").value,
        avatar: avatarData,
      };
      if (!values.fullName) return;
      EF.Store.updateData((data) => {
        data.profile = { ...data.profile, ...values };
        data.settings.accent = accent;
      });
      modal.close();
      render();
      EF.layout.applyTheme();
      EF.ui.toast("Profile saved.");
    };
  }

  // Button Listeners & Startup: connects both "Edit" buttons and displays your profile when the page loads
  $("#edit-profile-open").addEventListener("click", openEditor);
  $("#edit-profile-inline").addEventListener("click", openEditor);
  render();
})();
