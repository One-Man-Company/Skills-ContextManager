/* ═══════════════════════════════════════════════════════
   Context Manager Web — Frontend Application Logic
   ═══════════════════════════════════════════════════════ */

// ── State ──
let contexts = [];
let librarySkills = [];
let libraryWorkflows = [];
let selectedContext = null;
let contextSkills = [];
let contextWorkflows = [];
let currentLibraryTab = "skills";
let libraryFavFilter = false;
let libraryActiveFilter = null; // null = all, true = active, false = inactive
let favorites = JSON.parse(localStorage.getItem('library-favorites') || '{}');
let aiSettings = JSON.parse(localStorage.getItem('ai-settings') || '{}');
let librarySearchInDesc = false;

// ── Editor State ──
let editorContext = null; // { contextName, skillName } or { skillName } for library
let editorSource = null; // 'context' or 'library'
let editorFiles = [];
let editorCurrentFile = null;
let editorDirty = false;
let editorExpandedFolders = new Set(); // Track expanded folders in tree

// ════════════════════════════════════════════ API HELPERS ══════════════════════════════

async function api(url, method = "GET", body = null) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) {
    if (body instanceof FormData) {
      delete opts.headers["Content-Type"]; // Let browser set boundary
      opts.body = body;
    } else {
      opts.body = JSON.stringify(body);
    }
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "API Error");
  }
  return res.json();
}

// ════════════════════════════════════════════ TOAST ══════════════════════════════

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(40px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ════════════════════════════════════════════ DIALOG SYSTEM ══════════════════════════════

function showDialog(html) {
  const overlay = document.getElementById("dialog-overlay");
  document.getElementById("dialog-content").innerHTML = html;
  overlay.classList.add("active");
}

function closeDialog() {
  document.getElementById("dialog-overlay").classList.remove("active");
}

document.getElementById("dialog-overlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeDialog();
});

// ════════════════════════════════════════════ SETTINGS PROFILES ══════════════════════════════

async function loadSettingsProfilesList() {
  try {
    const profiles = await api("/api/settings-profiles");
    const dropdown = document.getElementById("settings-profile-dropdown");
    const currentValue = dropdown.value;

    // Keep the first option (placeholder)
    dropdown.innerHTML =
      '<option value="">-- Select Settingsprofile --</option>';

    profiles.forEach((profile) => {
      const option = document.createElement("option");
      option.value = profile.name;
      option.textContent = profile.name;
      dropdown.appendChild(option);
    });

    // Restore selection if it still exists
    if (currentValue && profiles.some((p) => p.name === currentValue)) {
      dropdown.value = currentValue;
    }

    updateProfileButtonsState();
  } catch (e) {
    console.error("Failed to load settings profiles:", e);
  }
}

function updateProfileButtonsState() {
  const dropdown = document.getElementById("settings-profile-dropdown");
  const deleteBtn = document.getElementById("delete-profile-btn");
  const saveBtn = document.getElementById("save-profile-btn");
  const hasSelection = !!dropdown.value;

  deleteBtn.style.display = hasSelection ? "inline-flex" : "none";
  saveBtn.disabled = !hasSelection;
}

function showNewSettingsProfileDialog() {
  showDialog(`
    <h3>New Settingsprofile</h3>
    <p style="font-size: 12px; color: var(--overlay0); margin-bottom: 12px;">
      Create a new profile from current context cells and skills configuration
    </p>
    <input type="text" id="profile-name" placeholder="Profile name..." autofocus
           onkeydown="if(event.key==='Enter') createNewSettingsProfile()">
    <div class="dialog-actions">
      <button class="btn" onclick="closeDialog()">Cancel</button>
      <button class="btn btn-primary" onclick="createNewSettingsProfile()">Create</button>
    </div>
  `);
  setTimeout(() => document.getElementById("profile-name")?.focus(), 100);
}

async function createNewSettingsProfile() {
  const input = document.getElementById("profile-name");
  const name = input?.value?.trim();
  if (!name) return showToast("Please enter a profile name", "error");

  try {
    // Get current contexts data to save
    const profileData = {
      name,
      contexts: contexts.map((ctx) => ({
        name: ctx.name,
        enabled: ctx.enabled !== false,
        skills: ctx.skills || {},
      })),
    };

    await api("/api/settings-profiles", "POST", profileData);
    closeDialog();
    showToast(`Settingsprofile "${name}" created`, "success");
    await loadSettingsProfilesList();

    // Select the newly created profile
    const dropdown = document.getElementById("settings-profile-dropdown");
    dropdown.value = name;
    updateProfileButtonsState();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function saveCurrentSettingsProfile() {
  const dropdown = document.getElementById("settings-profile-dropdown");
  const name = dropdown.value;

  if (!name) {
    return showToast("Please select a profile to save", "error");
  }

  try {
    // Get current contexts data to save
    const profileData = {
      name,
      contexts: contexts.map((ctx) => ({
        name: ctx.name,
        enabled: ctx.enabled !== false,
        skills: ctx.skills || {},
      })),
    };

    await api("/api/settings-profiles", "POST", profileData);
    showToast(`Settingsprofile "${name}" saved`, "success");
  } catch (e) {
    showToast(e.message, "error");
  }
}

function updateProfileButtonsState() {
  const dropdown = document.getElementById("settings-profile-dropdown");
  const deleteBtn = document.getElementById("delete-profile-btn");
  const saveBtn = document.getElementById("save-profile-btn");
  const hasSelection = !!dropdown.value;

  deleteBtn.style.display = hasSelection ? "inline-flex" : "none";
  saveBtn.disabled = !hasSelection;
}

async function loadSettingsProfile(profileName) {
  if (!profileName) {
    updateProfileButtonsState();
    return;
  }

  if (
    !confirm(
      `Load settings profile "${profileName}"? This will apply the saved settings to your contexts and skills.`,
    )
  ) {
    document.getElementById("settings-profile-dropdown").value = "";
    updateProfileButtonsState();
    return;
  }

  try {
    const profile = await api(
      `/api/settings-profiles/${encodeURIComponent(profileName)}`,
    );

    // Apply profile settings to contexts
    for (const ctxData of profile.contexts) {
      const context = contexts.find((c) => c.name === ctxData.name);
      if (context) {
        // Update context enabled state
        if (context.enabled !== ctxData.enabled) {
          await api(
            `/api/contexts/${encodeURIComponent(ctxData.name)}/toggle`,
            "PATCH",
            { enabled: ctxData.enabled },
          );
          context.enabled = ctxData.enabled;
        }

        // Update skills settings for this context
        if (ctxData.skills) {
          for (const [skillName, skillSettings] of Object.entries(
            ctxData.skills,
          )) {
            if (
              skillSettings.enabled !== undefined ||
              skillSettings.mode !== undefined
            ) {
              await api(
                `/api/contexts/${encodeURIComponent(ctxData.name)}/skills/${encodeURIComponent(skillName)}/toggle`,
                "PATCH",
                {
                  enabled: skillSettings.enabled,
                  mode: skillSettings.mode,
                },
              );
            }
          }

          // Update local context skills data
          context.skills = { ...context.skills, ...ctxData.skills };
        }
      }
    }

    // Refresh the UI
    await loadContexts();
    if (selectedContext) {
      await loadContextSkills(selectedContext);
    }

    updateProfileButtonsState();
    showToast(`Settingsprofile "${profileName}" loaded`, "success");
  } catch (e) {
    showToast("Failed to load profile: " + e.message, "error");
    document.getElementById("settings-profile-dropdown").value = "";
    updateProfileButtonsState();
  }
}

async function deleteSettingsProfile() {
  const dropdown = document.getElementById("settings-profile-dropdown");
  const profileName = dropdown.value;
  if (!profileName) return;

  if (!confirm(`Delete settings profile "${profileName}"?`)) return;

  try {
    await api(
      `/api/settings-profiles/${encodeURIComponent(profileName)}`,
      "DELETE",
    );
    showToast(`Settingsprofile "${profileName}" deleted`, "success");
    dropdown.value = "";
    await loadSettingsProfilesList();
    updateProfileButtonsState();
  } catch (e) {
    showToast("Failed to delete profile: " + e.message, "error");
  }
}

// ════════════════════════════════════════════ SKILLHUB MANAGEMENT ══════════════════════════════

async function loadSkillHubs() {
  try {
    const data = await api("/api/skillhubs");
    const dropdown = document.getElementById("skillhub-dropdown");
    const deleteBtn = document.getElementById("delete-skillhub-btn");

    // Clear existing options except the placeholder
    dropdown.innerHTML = '<option value="">-- Select SkillHub --</option>';

    // Add hubs
    data.hubs.forEach((hubName) => {
      const option = document.createElement("option");
      option.value = hubName;
      option.textContent = hubName;
      if (hubName === data.active_hub) {
        option.selected = true;
      }
      dropdown.appendChild(option);
    });

    // Show/hide delete button (only show if there are multiple hubs)
    deleteBtn.style.display = data.hubs.length > 1 ? "inline-flex" : "none";
  } catch (e) {
    console.error("Failed to load skillhubs:", e);
  }
}

function showNewSkillHubDialog() {
  showDialog(`
    <h3>Create New SkillHub</h3>
    <p style="font-size: 12px; color: var(--overlay0); margin-bottom: 12px;">
      Create a completely new isolated workspace with empty skills and contexts
    </p>
    <input type="text" id="skillhub-name" placeholder="SkillHub name..." autofocus
           onkeydown="if(event.key==='Enter') createNewSkillHub()">
    <div class="dialog-actions">
      <button class="btn" onclick="closeDialog()">Cancel</button>
      <button class="btn btn-primary" onclick="createNewSkillHub()">Create</button>
    </div>
  `);
  setTimeout(() => document.getElementById("skillhub-name")?.focus(), 100);
}

async function createNewSkillHub() {
  const input = document.getElementById("skillhub-name");
  const name = input?.value?.trim();
  if (!name) return showToast("Please enter a SkillHub name", "error");

  try {
    await api("/api/skillhubs", "POST", { name });
    closeDialog();
    showToast(`SkillHub "${name}" created`, "success");
    await loadSkillHubs();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function switchSkillHub(hubName) {
  if (!hubName) return;

  if (
    !confirm(
      `Switch to SkillHub "${hubName}"? The page will refresh to load the new workspace.`,
    )
  ) {
    await loadSkillHubs(); // Reset dropdown
    return;
  }

  try {
    await api("/api/skillhubs/switch", "POST", { name: hubName });
    showToast(`Switched to "${hubName}". Refreshing...`, "success");
    // Reload the page to load the new hub's data
    setTimeout(() => window.location.reload(), 1000);
  } catch (e) {
    showToast(e.message, "error");
    await loadSkillHubs(); // Reset dropdown
  }
}

async function deleteCurrentSkillHub() {
  const dropdown = document.getElementById("skillhub-dropdown");
  const hubName = dropdown.value;

  if (!hubName) return;

  if (
    !confirm(
      `Delete SkillHub "${hubName}"? This will permanently delete all skills, contexts, and settings in this hub. This cannot be undone.`,
    )
  )
    return;

  try {
    await api(`/api/skillhubs/${encodeURIComponent(hubName)}`, "DELETE");
    showToast(`SkillHub "${hubName}" deleted`, "success");
    await loadSkillHubs();
  } catch (e) {
    showToast(e.message, "error");
  }
}

// ════════════════════════════════════════════ CONTEXTS ══════════════════════════════

async function loadContexts() {
  try {
    contexts = await api("/api/contexts");
    renderContexts();
  } catch (e) {
    showToast("Failed to load contexts: " + e.message, "error");
  }
}

function renderContexts() {
  const list = document.getElementById("context-list");
  const searchInput = document.getElementById("context-search").value.trim();
  const searchTerms = searchInput ? searchInput.split(/\s+/).filter(Boolean) : [];

  const filtered = contexts.filter((ctx) => {
    const nameMatch = smartMatch(ctx.name, searchTerms);
    const descMatch = smartMatch(ctx.description || '', searchTerms);
    return !searchTerms.length || nameMatch || descMatch;
  });

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="skill-empty-state">
        <div class="empty-icon">📋</div>
        <p>${searchInput ? "No matching contexts" : "No contexts yet"}</p>
        <p class="hint">${searchInput ? "Try a different search" : 'Click "+ New Context" to create one'}</p>
      </div>`;
    document.getElementById("context-status").textContent =
      `${contexts.length} contexts`;
    return;
  }

  list.innerHTML = filtered
    .map((ctx) => {
      const isActive = selectedContext === ctx.name;
      const isEnabled = ctx.enabled !== false;

      return `
      <div class="item-card ${isActive ? "active" : ""} ${!isEnabled ? "disabled" : ""}"
           onclick="selectContext('${escapeAttr(ctx.name)}')"
           ondragover="onDragOver(event)"
           ondrop="onDrop(event, '${escapeAttr(ctx.name)}')"
           data-context="${escapeAttr(ctx.name)}">
        <div class="item-card-info">
          <div class="item-card-name">${escapeHtml(ctx.name)}</div>
        </div>
        <div class="item-card-toggles" onclick="event.stopPropagation()">
          <div class="toggle-switch" title="Enable / Disable">
            <input type="checkbox" id="ctx-enable-${escapeAttr(ctx.name)}" ${isEnabled ? "checked" : ""}
                   onchange="toggleContext('${escapeAttr(ctx.name)}', 'enabled', this.checked)">
            <label class="toggle-slider" for="ctx-enable-${escapeAttr(ctx.name)}"></label>
          </div>
        </div>
        <div class="item-card-actions">
           <button class="btn btn-icon btn-sm" onclick="event.stopPropagation(); deleteContext('${escapeAttr(ctx.name)}')" title="Delete Context">🗑</button>
        </div>
      </div>`;
    })
    .join("");

  document.getElementById("context-status").textContent =
    `${contexts.length} contexts`;
}

function filterContexts() {
  renderContexts();
}

async function selectContext(name) {
  selectedContext = name;
  renderContexts();
  await loadContextSkills(name);
}

async function toggleContext(name, field, value) {
  try {
    const body = {};
    body[field] = value;
    await api(
      `/api/contexts/${encodeURIComponent(name)}/toggle`,
      "PATCH",
      body,
    );
    const ctx = contexts.find((c) => c.name === name);
    if (ctx) ctx[field] = value;
    renderContexts(); // update styling
  } catch (e) {
    showToast("Failed to update: " + e.message, "error");
  }
}

function showNewContextDialog() {
  showDialog(`
    <h3>Create New Context</h3>
    <input type="text" id="new-context-name" placeholder="Context name..." autofocus
           onkeydown="if(event.key==='Enter') createContext()">
    <div class="dialog-actions">
      <button class="btn" onclick="closeDialog()">Cancel</button>
      <button class="btn btn-primary" onclick="createContext()">Create</button>
    </div>
  `);
  setTimeout(() => document.getElementById("new-context-name")?.focus(), 100);
}

async function createContext() {
  const input = document.getElementById("new-context-name");
  const name = input?.value?.trim();
  if (!name) return showToast("Please enter a name", "error");

  try {
    await api("/api/contexts", "POST", { name });
    closeDialog();
    showToast(`Context "${name}" created`, "success");
    await loadContexts();
    selectContext(name);
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function deleteContext(name) {
  if (!confirm(`Delete context "${name}" and all its files?`)) return;
  try {
    await api(`/api/contexts/${encodeURIComponent(name)}`, "DELETE");
    showToast(`Context "${name}" deleted`, "success");
    if (selectedContext === name) {
      selectedContext = null;
      renderSkillsPanel();
    }
    await loadContexts();
  } catch (e) {
    showToast("Failed to delete: " + e.message, "error");
  }
}

// ════════════════════════════════ CONTEXT SKILLS (Right Panel) ══════════════════════════════

async function loadContextSkills(contextName) {
  const title = document.getElementById("skills-panel-title");
  title.textContent = "Context cell: " + contextName;

  try {
    // Load both skills and workflows for the context
    [contextSkills, contextWorkflows] = await Promise.all([
      api(`/api/contexts/${encodeURIComponent(contextName)}/skills`),
      api(`/api/contexts/${encodeURIComponent(contextName)}/workflows`),
    ]);
    renderSkillsPanel();
  } catch (e) {
    showToast("Failed to load skills/workflows: " + e.message, "error");
  }
}

function renderSkillsPanel() {
  const list = document.getElementById("skills-list");
  const status = document.getElementById("skills-status");

  if (!selectedContext) {
    list.innerHTML = `
      <div class="skill-empty-state">
        <div class="empty-icon">📦</div>
        <p>Context cell not selected</p>
        <p class="hint">Click a Context cell in the middle panel to view its skills</p>
      </div>`;
    status.innerHTML = "";
    return;
  }

  // Combine skills and workflows for display
  const allItems = [
    ...contextSkills.map((item) => ({ ...item, type: "skill" })),
    ...contextWorkflows.map((item) => ({ ...item, type: "workflow" })),
  ];

  if (allItems.length === 0) {
    list.innerHTML = `
      <div class="skill-empty-state">
        <div class="empty-icon">🧩</div>
        <p>No skills or workflows here</p>
        <p class="hint">Drag a skill or workflow from the library or use the context menu to add one</p>
      </div>`;
    status.innerHTML = "0 items";
    return;
  }

  let totalAlwaysLoadedTokens = 0;
  let totalDynamicTokens = 0;
  let enabledCount = 0;

  list.innerHTML = allItems
    .map((item) => {
      const isEnabled = item.enabled !== false;
      const isAlwaysLoaded = (item.mode || "always_loaded") === "always_loaded";
      const icon = item.type === "skill" ? "🧩" : "⚙️";
      const title = item.type === "skill" ? "skill" : "workflow";

      if (isEnabled) {
        enabledCount++;
        if (isAlwaysLoaded) totalAlwaysLoadedTokens += item.tokens || 0;
        else totalDynamicTokens += item.tokens || 0;
      }

      return `
      <div class="skill-card ${!isEnabled ? "disabled" : ""} ${item.hasDescription === false ? "missing-description" : ""}"
           ondblclick="item.type === 'skill' ? openSkillEditor('context', '${escapeAttr(selectedContext)}', '${escapeAttr(item.name)}') : openWorkflowEditorInContext('${escapeAttr(selectedContext)}', '${escapeAttr(item.name)}')"
           title="Double-click to edit">
        <div class="skill-card-header">
          <div class="skill-card-icon">${icon}</div>
          <div class="skill-card-info">
            <div class="skill-card-title-row">
              <span class="skill-card-name">${escapeHtml(item.name)}</span>
              <span class="token-badge">${(item.tokens || 0).toLocaleString()} tks</span>
              <div class="toggle-mode" title="Always = loaded by default, Dynamic = on-demand" onclick="event.stopPropagation()">
                <input type="checkbox" id="${title}-mode-${escapeAttr(item.name)}" ${!isAlwaysLoaded ? "checked" : ""}
                       onchange="toggleContextItem('${escapeAttr(selectedContext)}', '${escapeAttr(item.name)}', '${item.type}', 'mode', this.checked ? 'dynamic' : 'always_loaded')">
                <label class="toggle-mode-slider" for="${title}-mode-${escapeAttr(item.name)}"><span></span></label>
              </div>
            </div>
          </div>
        </div>
        ${item.description ? `<div class="skill-card-desc">${escapeHtml(item.description)}</div>` : ""}
        ${item.hasDescription === false ? `<div class="missing-desc-warning">description.md is missing</div>` : ""}
        <div class="skill-card-toggles" onclick="event.stopPropagation()">
          <div class="toggle-switch" title="Enable / Disable">
            <input type="checkbox" id="${title}-enable-${escapeAttr(item.name)}" ${isEnabled ? "checked" : ""}
                   onchange="toggleContextItem('${escapeAttr(selectedContext)}', '${escapeAttr(item.name)}', '${item.type}', 'enabled', this.checked)">
            <label class="toggle-slider" for="${title}-enable-${escapeAttr(item.name)}"></label>
          </div>
        </div>
        <div class="item-card-actions">
           <button class="btn btn-icon btn-sm" onclick="event.stopPropagation(); removeContextItem('${escapeAttr(selectedContext)}', '${escapeAttr(item.name)}', '${item.type}')" title="Remove from Context">📤</button>
        </div>
      </div>`;
    })
    .join("");

  status.innerHTML = `
    <div class="stats-info">
      <span class="stat-pill" title="Always Loaded Items">${totalAlwaysLoadedTokens.toLocaleString()} tokens (Always)</span>
      <span class="stat-pill" title="Dynamic Items Available">${totalDynamicTokens.toLocaleString()} tokens (Dynamic)</span>
    </div>
  `;
}

async function toggleContextItem(
  contextName,
  itemName,
  itemType,
  field,
  value,
) {
  try {
    const body = {};
    body[field] = value;

    let url;
    if (itemType === "skill") {
      url = `/api/contexts/${encodeURIComponent(contextName)}/skills/${encodeURIComponent(itemName)}/toggle`;
    } else if (itemType === "workflow") {
      url = `/api/contexts/${encodeURIComponent(contextName)}/workflows/${encodeURIComponent(itemName)}/toggle`;
    }

    await api(url, "PATCH", body);

    // Update the corresponding array
    let itemArray;
    if (itemType === "skill") {
      itemArray = contextSkills;
    } else if (itemType === "workflow") {
      itemArray = contextWorkflows;
    }

    const item = itemArray.find((i) => i.name === itemName);
    if (item) item[field] = value;
    renderSkillsPanel();
  } catch (e) {
    showToast("Failed to update item: " + e.message, "error");
  }
}

async function toggleSkill(contextName, skillName, field, value) {
  try {
    const body = {};
    body[field] = value;
    await api(
      `/api/contexts/${encodeURIComponent(contextName)}/skills/${encodeURIComponent(skillName)}/toggle`,
      "PATCH",
      body,
    );
    const skill = contextSkills.find((s) => s.name === skillName);
    if (skill) skill[field] = value;
    renderSkillsPanel();
  } catch (e) {
    showToast("Failed to update skill: " + e.message, "error");
  }
}

async function deleteContextSkill(contextName, skillName) {
  if (!confirm(`Remove skill "${skillName}" from this context?`)) return;
  try {
    await api(
      `/api/contexts/${encodeURIComponent(contextName)}/skills/${encodeURIComponent(skillName)}`,
      "DELETE",
    );
    showToast(`Skill deleted`, "success");
    await loadContextSkills(contextName);
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function removeContextItem(contextName, itemName, itemType) {
  const itemTypeDisplay = itemType === "skill" ? "skill" : "workflow";
  if (
    !confirm(
      `Remove ${itemTypeDisplay} "${itemName}" from context "${contextName}"? This will only remove it from this context, not delete the library ${itemTypeDisplay}.`,
    )
  )
    return;
  try {
    let url;
    if (itemType === "skill") {
      url = `/api/contexts/${encodeURIComponent(contextName)}/skills/${encodeURIComponent(itemName)}`;
    } else if (itemType === "workflow") {
      url = `/api/contexts/${encodeURIComponent(contextName)}/workflows/${encodeURIComponent(itemName)}`;
    }

    await api(url, "DELETE");
    showToast(
      `${itemTypeDisplay.charAt(0).toUpperCase() + itemTypeDisplay.slice(1)} removed from context`,
      "success",
    );
    await loadContextSkills(contextName);
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function removeSkillFromContext(contextName, skillName) {
  if (
    !confirm(
      `Remove skill "${skillName}" from context "${contextName}"? This will only remove it from this context, not delete the library skill.`,
    )
  )
    return;
  try {
    await api(
      `/api/contexts/${encodeURIComponent(contextName)}/skills/${encodeURIComponent(skillName)}`,
      "DELETE",
    );
    showToast(`Skill removed from context`, "success");
    await loadContextSkills(contextName);
  } catch (e) {
    showToast(e.message, "error");
  }
}

function showAddSkillToContextDialog() {
  showDialog(`
    <h3>Add Skill to "${escapeHtml(selectedContext)}"</h3>
    <input type="text" id="new-skill-name" placeholder="Skill name..." autofocus
           onkeydown="if(event.key==='Enter') addSkillToContext()">
    <div class="dialog-actions">
      <button class="btn" onclick="closeDialog()">Cancel</button>
      <button class="btn btn-primary" onclick="addSkillToContext()">Create</button>
    </div>
  `);
  setTimeout(() => document.getElementById("new-skill-name")?.focus(), 100);
}


async function openWorkflowEditorInContext(contextName, workflowName) {
  editorSource = "context";
  editorContext = contextName;
  editorCurrentFile = null;
  editorDirty = false;
  editorExpandedFolders.clear();
  editorExpandedFolders.add("");

  document.getElementById("editor-skill-title").innerHTML =
    `<span>${escapeHtml(contextName)}</span> / ⚙️ ${escapeHtml(workflowName)}`;

  document.getElementById("skill-editor-modal").dataset.skillName =
    workflowName;
  document.getElementById("skill-editor-modal").dataset.sourceType = "workflow";

  try {
    const url = `/api/contexts/${encodeURIComponent(contextName)}/workflows/${encodeURIComponent(workflowName)}/files`;
    editorFiles = await api(url);
    renderEditorFiles();
  } catch (e) {
    editorFiles = [];
    renderEditorFiles();
  }

  resetEditorContent();
  document.getElementById("skill-editor-modal").classList.add("active");
}

async function addSkillToContext() {
  const input = document.getElementById("new-skill-name");
  const name = input?.value?.trim();
  if (!name) return showToast("Please enter a name", "error");

  try {
    await api(
      `/api/contexts/${encodeURIComponent(selectedContext)}/skills`,
      "POST",
      { name },
    );
    closeDialog();
    showToast(`Skill "${name}" created`, "success");
    await loadContextSkills(selectedContext);
  } catch (e) {
    showToast(e.message, "error");
  }
}

// ══════════════════════════════ LIBRARY PANEL ══════════════════════════════

async function loadLibrary() {
  try {
    librarySkills = await api("/api/skills");
    renderLibrary();
  } catch (e) {
    showToast("Failed to load library: " + e.message, "error");
  }
}

function getLibraryFilters() {
  const sort = document.getElementById("library-sort")?.value || "date-desc";
  const time = document.getElementById("library-time")?.value || "all";
  return { sort, time };
}

function resetFiltersToNewest() {
  const sortSelect = document.getElementById("library-sort");
  const timeSelect = document.getElementById("library-time");
  
  if (sortSelect) sortSelect.value = "date-desc";
  if (timeSelect) timeSelect.value = "all";
  
  libraryFavFilter = false;
  libraryActiveFilter = null;
  
  const favBtn = document.getElementById("library-fav-btn");
  const activeBtn = document.getElementById("library-active-btn");
  
  if (favBtn) {
    favBtn.textContent = '☆';
    favBtn.classList.remove('btn-primary');
  }
  
  if (activeBtn) {
    activeBtn.classList.remove('btn-success', 'btn-warning');
    activeBtn.classList.add('btn-icon');
    activeBtn.title = 'Show active/inactive';
  }
}

async function refreshLibraryWithNewest() {
  resetFiltersToNewest();
  if (currentLibraryTab === "workflows") {
    await loadWorkflows();
  } else {
    await loadLibrary();
  }
}

function smartMatch(text, searchTerms) {
  if (!searchTerms.length) return true;
  const normalizedText = text.toLowerCase().replace(/[-_]/g, ' ');
  return searchTerms.every(term => {
    const normalizedTerm = term.toLowerCase().replace(/[-_]/g, ' ');
    return normalizedText.includes(normalizedTerm);
  });
}

function toggleLibrarySearchMode() {
  librarySearchInDesc = !librarySearchInDesc;
  const btn = document.getElementById("library-search-mode");
  if (librarySearchInDesc) {
    btn.classList.add('active');
    btn.title = 'Searching in descriptions (click to disable)';
  } else {
    btn.classList.remove('active');
    btn.title = 'Search in descriptions (click to enable)';
  }
  filterLibrary();
}

function applyFilters(items, type = 'skill') {
  const { sort, time } = getLibraryFilters();
  const searchInput = document.getElementById("library-search").value.trim();
  const searchTerms = searchInput ? searchInput.split(/\s+/).filter(Boolean) : [];
  const typeKey = type === 'workflow' ? 'workflow' : 'skill';
  
  // Smart search filter
  let filtered = items.filter((item) => {
    const nameMatch = smartMatch(item.name, searchTerms);
    const descMatch = librarySearchInDesc && smartMatch(item.description || '', searchTerms);
    return !searchTerms.length || nameMatch || descMatch;
  });
  
  // Time filter
  if (time !== 'all') {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    filtered = filtered.filter(item => {
      const date = new Date(item.created || item.modified || 0);
      if (time === 'today') return date >= today;
      if (time === 'week') return date >= weekAgo;
      if (time === 'month') return date >= monthAgo;
      return true;
    });
  }
  
  // Favorites filter
  if (libraryFavFilter) {
    filtered = filtered.filter(item => favorites[`${typeKey}-${item.name}`]);
  }
  
  // Active filter - check if item is in any context
  if (libraryActiveFilter !== null) {
    const isActive = (item) => {
      return contexts.some(ctx => {
        const ctxSkills = ctx.skills || {};
        const ctxWorkflows = ctx.workflows || {};
        return (ctxSkills[item.name]?.enabled) || (ctxWorkflows[item.name]?.enabled);
      });
    };
    filtered = filtered.filter(item => isActive(item) === libraryActiveFilter);
  }
  
  // Sort
  filtered.sort((a, b) => {
    switch (sort) {
      case 'name-asc':
        return a.name.localeCompare(b.name);
      case 'name-desc':
        return b.name.localeCompare(a.name);
      case 'date-desc':
        return new Date(b.created || b.modified || 0) - new Date(a.created || a.modified || 0);
      case 'date-asc':
        return new Date(a.created || a.modified || 0) - new Date(b.created || b.modified || 0);
      default:
        return 0;
    }
  });
  
  return filtered;
}

function toggleFavorite(type, name) {
  const key = `${type}-${name}`;
  favorites[key] = !favorites[key];
  localStorage.setItem('library-favorites', JSON.stringify(favorites));
  filterLibrary();
}

function toggleFavFilter() {
  libraryFavFilter = !libraryFavFilter;
  const btn = document.getElementById("library-fav-btn");
  btn.textContent = libraryFavFilter ? '★' : '☆';
  btn.classList.toggle('btn-primary', libraryFavFilter);
  filterLibrary();
}

function toggleActiveFilter() {
  if (libraryActiveFilter === null) {
    libraryActiveFilter = true;
  } else if (libraryActiveFilter === true) {
    libraryActiveFilter = false;
  } else {
    libraryActiveFilter = null;
  }
  const btn = document.getElementById("library-active-btn");
  btn.classList.toggle('btn-success', libraryActiveFilter === true);
  btn.classList.toggle('btn-warning', libraryActiveFilter === false);
  btn.classList.toggle('btn-icon', libraryActiveFilter === null);
  btn.title = libraryActiveFilter === true ? 'Showing active' : libraryActiveFilter === false ? 'Showing inactive' : 'Show all';
  filterLibrary();
}

function renderLibrary() {
  const list = document.getElementById("library-list");
  const filtered = applyFilters(librarySkills, 'skill');

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="skill-empty-state" style="padding:20px 10px;">
        <div class="empty-icon">📚</div>
        <p>No matching skills</p>
        <p class="hint"><button class="btn btn-primary btn-sm" onclick="showNewSkillDialog()">Create New</button></p>
      </div>`;
  } else {
    list.innerHTML = filtered
      .map((skill) => {
        const hasDescription =
          skill.hasDescription !== undefined ? skill.hasDescription : true;
        const missingDescClass = hasDescription ? "" : "missing-description";
        const isFav = favorites[`skill-${skill.name}`];
        const isActive = contexts.some(ctx => ctx.skills?.[skill.name]?.enabled);

        return `
      <div class="item-card ${missingDescClass}"
           draggable="${hasDescription}"
           ondragstart="${hasDescription ? "onDragStart(event, 'library', '" + escapeAttr(skill.name) + "', 'skill')" : "return false;"}"
           ondblclick="openSkillEditor('library', null, '${escapeAttr(skill.name)}')"
           title="${hasDescription ? "Drag to move to a context or double-click to edit" : "description.md is missing - create one to enable drag and drop"}">
        <div class="item-card-info">
          <div class="item-card-name">
            <span class="fav-star ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavorite('skill', '${escapeAttr(skill.name)}')">${isFav ? '★' : '☆'}</span>
            <span class="status-dot ${isActive ? 'active' : ''}"></span>
            🧩 ${escapeHtml(skill.name)}
          </div>
          ${skill.description ? `<div class="item-card-desc">${escapeHtml(skill.description)}</div>` : ""}
          ${!hasDescription ? `<div class="missing-desc-warning">description.md is missing</div>` : ""}
        </div>
        <div class="item-card-actions">
          ${!hasDescription ? `<button class="btn btn-sm btn-warning" onclick="event.stopPropagation(); createDescriptionMd('${escapeAttr(skill.name)}')">Create</button><button class="btn btn-sm" onclick="event.stopPropagation(); showGenerateDescDialog('${escapeAttr(skill.name)}')">Generate</button>` : ""}
          <button class="btn btn-icon btn-sm" onclick="event.stopPropagation(); deleteLibrarySkill('${escapeAttr(skill.name)}')" title="Delete Skill">🗑</button>
        </div>
      </div>`;
      })
      .join("");
  }

  document.getElementById("library-status").textContent =
    `${filtered.length} of ${librarySkills.length} skills`;
}

function filterLibrary() {
  if (currentLibraryTab === "workflows") {
    renderWorkflows();
  } else {
    renderLibrary();
  }
}

function switchLibraryTab(tab) {
  currentLibraryTab = tab;
  document.querySelectorAll(".library-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tab);
  });

  const newBtn = document.getElementById("library-new-btn");
  const folderBtn = document.getElementById("library-folder-btn");
  const githubBtn = document.getElementById("library-github-btn");
  const skillsshBtn = document.getElementById("library-skillssh-btn");
  const searchInput = document.getElementById("library-search");

  if (tab === "workflows") {
    newBtn.textContent = "+ New Workflow";
    newBtn.onclick = showNewWorkflowDialog;
    folderBtn.onclick = triggerWorkflowFolderImport;
    githubBtn.onclick = showWorkflowGithubImportDialog;
    skillsshBtn.style.display = "none";
    searchInput.placeholder = "Search workflows...";
    loadWorkflows();
  } else {
    newBtn.textContent = "+ New Skill";
    newBtn.onclick = showNewSkillDialog;
    folderBtn.onclick = triggerFolderImport;
    githubBtn.onclick = showGithubImportDialog;
    skillsshBtn.style.display = "inline-flex";
    searchInput.placeholder = "Search skills...";
    renderLibrary();
  }
}

function showNewSkillDialog() {
  showDialog(`
    <h3>Create New Library Skill</h3>
    <input type="text" id="new-lib-skill-name" placeholder="Skill name..." autofocus
           onkeydown="if(event.key==='Enter') createLibrarySkill()">
    <div class="dialog-actions">
      <button class="btn" onclick="closeDialog()">Cancel</button>
      <button class="btn btn-primary" onclick="createLibrarySkill()">Create</button>
    </div>
  `);
  setTimeout(() => document.getElementById("new-lib-skill-name")?.focus(), 100);
}

async function createLibrarySkill() {
  const input = document.getElementById("new-lib-skill-name");
  const name = input?.value?.trim();
  if (!name) return showToast("Please enter a name", "error");

  try {
    await api("/api/skills", "POST", { name });
    closeDialog();
    showToast(`Skill "${name}" created`, "success");
    await refreshLibraryWithNewest();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function deleteLibrarySkill(name) {
  if (
    !confirm(
      `Are you sure you want to delete "${name}" from the library? This cannot be undone.`,
    )
  )
    return;
  try {
    await api(`/api/skills/${encodeURIComponent(name)}`, "DELETE");
    showToast(`Skill "${name}" deleted`, "success");
    await loadLibrary();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function loadWorkflows() {
  try {
    libraryWorkflows = await api("/api/workflows");
    renderWorkflows();
  } catch (e) {
    showToast("Failed to load workflows: " + e.message, "error");
  }
}

function renderWorkflows() {
  const list = document.getElementById("library-list");
  const filtered = applyFilters(libraryWorkflows, 'workflow');

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="skill-empty-state" style="padding:20px 10px;">
        <div class="empty-icon">⚙️</div>
        <p>No matching workflows</p>
        <p class="hint"><button class="btn btn-primary btn-sm" onclick="showNewWorkflowDialog()">Create New</button></p>
      </div>`;
  } else {
    list.innerHTML = filtered
      .map((workflow) => {
        const hasDescription =
          workflow.hasDescription !== undefined
            ? workflow.hasDescription
            : true;
        const missingDescClass = hasDescription ? "" : "missing-description";
        const isFav = favorites[`workflow-${workflow.name}`];
        const isActive = contexts.some(ctx => ctx.workflows?.[workflow.name]?.enabled);

        return `
      <div class="item-card ${missingDescClass}"
           draggable="${hasDescription}"
           ondragstart="${hasDescription ? "onDragStart(event, 'library', '" + escapeAttr(workflow.name) + "', 'workflow')" : "return false;"}"
           ondblclick="openWorkflowEditor('${escapeAttr(workflow.name)}')"
           title="${hasDescription ? "Drag to move to a context or double-click to edit" : "description.md is missing - create one to enable drag and drop"}">
        <div class="item-card-info">
          <div class="item-card-name">
            <span class="fav-star ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavorite('workflow', '${escapeAttr(workflow.name)}')">${isFav ? '★' : '☆'}</span>
            <span class="status-dot ${isActive ? 'active' : ''}"></span>
            ⚙️ ${escapeHtml(workflow.name)}
          </div>
          ${workflow.description ? `<div class="item-card-desc">${escapeHtml(workflow.description)}</div>` : ""}
          ${!hasDescription ? `<div class="missing-desc-warning">description.md is missing</div>` : ""}
        </div>
        <div class="item-card-actions">
          ${!hasDescription ? `<button class="btn btn-sm btn-warning" onclick="event.stopPropagation(); createWorkflowDescriptionMd('${escapeAttr(workflow.name)}')">Create</button>` : ""}
          <button class="btn btn-icon btn-sm" onclick="event.stopPropagation(); deleteLibraryWorkflow('${escapeAttr(workflow.name)}')" title="Delete Workflow">🗑</button>
        </div>
      </div>`;
      })
      .join("");
  }

  document.getElementById("library-status").textContent =
    `${filtered.length} of ${libraryWorkflows.length} workflows`;
}

function showNewWorkflowDialog() {
  showDialog(`
    <h3>Create New Library Workflow</h3>
    <input type="text" id="new-lib-workflow-name" placeholder="Workflow name..." autofocus
           onkeydown="if(event.key==='Enter') createLibraryWorkflow()">
    <div class="dialog-actions">
      <button class="btn" onclick="closeDialog()">Cancel</button>
      <button class="btn btn-primary" onclick="createLibraryWorkflow()">Create</button>
    </div>
  `);
  setTimeout(
    () => document.getElementById("new-lib-workflow-name")?.focus(),
    100,
  );
}

async function createLibraryWorkflow() {
  const input = document.getElementById("new-lib-workflow-name");
  const name = input?.value?.trim();
  if (!name) return showToast("Please enter a name", "error");

  try {
    await api("/api/workflows", "POST", { name });
    closeDialog();
    showToast(`Workflow "${name}" created`, "success");
    await refreshLibraryWithNewest();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function deleteLibraryWorkflow(name) {
  if (
    !confirm(
      `Are you sure you want to delete workflow "${name}"? This cannot be undone.`,
    )
  )
    return;
  try {
    await api(`/api/workflows/${encodeURIComponent(name)}`, "DELETE");
    showToast(`Workflow "${name}" deleted`, "success");
    await loadWorkflows();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function createWorkflowDescriptionMd(name) {
  try {
    await api(
      `/api/workflows/${encodeURIComponent(name)}/file/description.md`,
      "PUT",
      {
        content: `# ${name}\n\nDescription of the ${name} workflow.`,
      },
    );
    showToast(`Created description.md for "${name}"`, "success");
    await loadWorkflows();
  } catch (e) {
    showToast(e.message, "error");
  }
}

// ── Imports (UI) ──

// Hidden file input for folders
const folderInput = document.createElement("input");
folderInput.type = "file";
folderInput.webkitdirectory = true;
folderInput.multiple = true;
folderInput.style.display = "none";
document.body.appendChild(folderInput);

folderInput.addEventListener("change", async (e) => {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  const skills = {};

  for (let file of files) {
    const parts = file.webkitRelativePath.split("/");
    const skillName = parts[0];
    if (!skills[skillName]) skills[skillName] = [];
    skills[skillName].push(file);
  }

  closeDialog();
  showToast(`Uploading ${Object.keys(skills).length} skills...`, "info");

  for (const [skillName, skillFiles] of Object.entries(skills)) {
    const formData = new FormData();
    formData.append("skillName", skillName);

    const paths = [];
    skillFiles.forEach((file) => {
      const parts = file.webkitRelativePath.split("/");
      parts.shift();
      paths.push(parts.join("/"));
    });
    formData.append("paths", JSON.stringify(paths));

    skillFiles.forEach((file) => {
      formData.append("files", file);
    });

    try {
      await api("/api/skills/import/files", "POST", formData);
    } catch (err) {
      console.error(err);
      showToast(`Failed to import ${skillName}`, "error");
    }
  }

  showToast("Import complete", "success");
  folderInput.value = "";
  await refreshLibraryWithNewest();
});

function triggerFolderImport() {
  folderInput.click();
}

function showGithubImportDialog() {
  showDialog(`
    <h3>Import from GitHub</h3>
    <input type="text" id="github-url" placeholder="https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/main/.claude/skills/ui-ux-pro-max" autofocus
           onkeydown="if(event.key==='Enter') importFromGithub()">
    <input type="text" id="github-name" placeholder="Optional: Custom Name">
    <div class="dialog-actions">
      <button class="btn" onclick="closeDialog()">Cancel</button>
      <button class="btn btn-primary" onclick="importFromGithub()">Clone</button>
    </div>
  `);
  setTimeout(() => document.getElementById("github-url")?.focus(), 100);
}

async function importFromGithub() {
  const url = document.getElementById("github-url")?.value?.trim();
  const name = document.getElementById("github-name")?.value?.trim();

  if (!url) return showToast("URL is required", "error");

  closeDialog();
  showToast("Cloning repository...", "info");

  try {
    await api("/api/skills/import/github", "POST", { url, name });
    showToast("Repository imported successfully", "success");
    await refreshLibraryWithNewest();
  } catch (e) {
    showToast("Import failed: " + e.message, "error");
  }
}

function showSkillsShImportDialog() {
  showDialog(`
    <h3>Import from Skills.sh</h3>
    <p style="font-size: 12px; color: var(--overlay0); margin-bottom: 12px;">
      Paste the Skills.sh URL or enter owner/repo
    </p>
    <input type="text" id="skillssh-name" placeholder="https://skills.sh/owner/repo/skill-name" autofocus autocomplete="off"
           onkeydown="if(event.key==='Enter') importFromSkillsSh()">
    <div class="dialog-actions">
      <button class="btn" onclick="closeDialog()">Cancel</button>
      <button class="btn btn-primary" onclick="importFromSkillsSh()">Import</button>
    </div>
  `);
  setTimeout(() => document.getElementById("skillssh-name")?.focus(), 100);
}

async function importFromSkillsSh() {
  const input = document.getElementById("skillssh-name")?.value?.trim();

  if (!input) return showToast("Skill URL or path is required", "error");

  closeDialog();
  showToast("Downloading skill from Skills.sh...", "info");

  try {
    const result = await api("/api/skills/import/skillssh", "POST", { skillPath: input });
    if (result.skills && result.skills.length > 1) {
      showToast(result.message, "success");
    } else {
      showToast(`Skill "${result.name}" imported successfully`, "success");
    }
    await refreshLibraryWithNewest();
  } catch (e) {
    showToast("Import failed: " + e.message, "error");
  }
}

// Workflow-specific imports
const workflowFolderInput = document.createElement("input");
workflowFolderInput.type = "file";
workflowFolderInput.webkitdirectory = true;
workflowFolderInput.multiple = true;
workflowFolderInput.style.display = "none";
document.body.appendChild(workflowFolderInput);

workflowFolderInput.addEventListener("change", async (e) => {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  const workflows = {};

  for (let file of files) {
    const parts = file.webkitRelativePath.split("/");
    const workflowName = parts[0];
    if (!workflows[workflowName]) workflows[workflowName] = [];
    workflows[workflowName].push(file);
  }

  closeDialog();
  showToast(`Uploading ${Object.keys(workflows).length} workflows...`, "info");

  for (const [workflowName, workflowFiles] of Object.entries(workflows)) {
    const formData = new FormData();
    formData.append("workflowName", workflowName);

    const paths = [];
    workflowFiles.forEach((file) => {
      const parts = file.webkitRelativePath.split("/");
      parts.shift();
      paths.push(parts.join("/"));
    });
    formData.append("paths", JSON.stringify(paths));

    workflowFiles.forEach((file) => {
      formData.append("files", file);
    });

    try {
      await api("/api/workflows/import/files", "POST", formData);
    } catch (err) {
      console.error(err);
      showToast(`Failed to import ${workflowName}`, "error");
    }
  }

  showToast("Import complete", "success");
  workflowFolderInput.value = "";
  await refreshLibraryWithNewest();
});

function triggerWorkflowFolderImport() {
  workflowFolderInput.click();
}

function showWorkflowGithubImportDialog() {
  showDialog(`
    <h3>Import Workflow from GitHub</h3>
    <input type="text" id="github-url" placeholder="https://github.com/owner/repo/tree/branch/path" autofocus
           onkeydown="if(event.key==='Enter') importWorkflowFromGithub()">
    <input type="text" id="github-name" placeholder="Optional: Custom Name">
    <div class="dialog-actions">
      <button class="btn" onclick="closeDialog()">Cancel</button>
      <button class="btn btn-primary" onclick="importWorkflowFromGithub()">Clone</button>
    </div>
  `);
  setTimeout(() => document.getElementById("github-url")?.focus(), 100);
}

async function importWorkflowFromGithub() {
  const url = document.getElementById("github-url")?.value?.trim();
  const name = document.getElementById("github-name")?.value?.trim();

  if (!url) return showToast("URL is required", "error");

  closeDialog();
  showToast("Cloning repository...", "info");

  try {
    await api("/api/workflows/import/github", "POST", { url, name });
    showToast("Repository imported successfully", "success");
    await refreshLibraryWithNewest();
  } catch (e) {
    showToast("Import failed: " + e.message, "error");
  }
}

// ══════════════════════════════ SKILL EDITOR MODAL ══════════════════════════════

async function openSkillEditor(source, contextName, skillName) {
  editorSource = source;
  editorContext = contextName;
  editorCurrentFile = null;
  editorDirty = false;
  editorExpandedFolders.clear();
  editorExpandedFolders.add("");

  document.getElementById("editor-skill-title").innerHTML =
    source === "context"
      ? `<span>${escapeHtml(contextName)}</span> / ${escapeHtml(skillName)}`
      : escapeHtml(skillName);

  document.getElementById("skill-editor-modal").dataset.skillName = skillName;
  document.getElementById("skill-editor-modal").dataset.sourceType = "skill";

  try {
    let url;
    if (source === "context") {
      url = `/api/contexts/${encodeURIComponent(contextName)}/skills/${encodeURIComponent(skillName)}/files`;
    } else {
      url = `/api/skills/${encodeURIComponent(skillName)}/files`;
    }
    editorFiles = await api(url);
    renderEditorFiles();
  } catch (e) {
    editorFiles = [];
    renderEditorFiles();
  }

  resetEditorContent();
  document.getElementById("skill-editor-modal").classList.add("active");
}

async function openWorkflowEditor(workflowName) {
  editorSource = "library";
  editorContext = null;
  editorCurrentFile = null;
  editorDirty = false;
  editorExpandedFolders.clear();
  editorExpandedFolders.add("");

  document.getElementById("editor-skill-title").innerHTML =
    `⚙️ ${escapeHtml(workflowName)}`;

  document.getElementById("skill-editor-modal").dataset.skillName =
    workflowName;
  document.getElementById("skill-editor-modal").dataset.sourceType = "workflow";

  try {
    const url = `/api/workflows/${encodeURIComponent(workflowName)}/files`;
    editorFiles = await api(url);
    renderEditorFiles();
  } catch (e) {
    editorFiles = [];
    renderEditorFiles();
  }

  resetEditorContent();
  document.getElementById("skill-editor-modal").classList.add("active");
}

function closeSkillEditor() {
  if (editorDirty) {
    if (!confirm("You have unsaved changes. Close anyway?")) return;
  }
  document.getElementById("skill-editor-modal").classList.remove("active");
  editorSource = null;
  editorContext = null;
  editorCurrentFile = null;
  editorDirty = false;
}

document.getElementById("skill-editor-modal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeSkillEditor();
});

// ── Tree View Logic ──

function buildFileTree(files) {
  const root = { name: "root", path: "", type: "directory", children: {} };

  files.forEach((file) => {
    const parts = file.path.split("/");
    let current = root;

    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1;
      const pathSoFar = parts.slice(0, index + 1).join("/");

      if (!current.children[part]) {
        if (isLast && file.type === "file") {
          current.children[part] = {
            name: part,
            path: file.path,
            type: "file",
          };
        } else {
          current.children[part] = {
            name: part,
            path: pathSoFar,
            type: "directory",
            children: {},
          };
        }
      }
      current = current.children[part];
    });
  });
  return root;
}

function renderTree(node, container) {
  const ul = document.createElement("ul");
  ul.className = "tree-list";

  const sortedKeys = Object.keys(node.children || {}).sort((a, b) => {
    const itemA = node.children[a];
    const itemB = node.children[b];
    if (itemA.type !== itemB.type) return itemA.type === "directory" ? -1 : 1;
    return a.localeCompare(b);
  });

  sortedKeys.forEach((key) => {
    const item = node.children[key];
    const li = document.createElement("li");
    li.className = `tree-node ${item.type === "file" ? "leaf" : ""}`;

    if (item.type === "directory") {
      const isExpanded = editorExpandedFolders.has(item.path);
      if (!isExpanded) li.classList.add("collapsed");
    }

    const content = document.createElement("div");
    content.className = `tree-item ${editorCurrentFile === item.path ? "active" : ""}`;
    content.innerHTML = `
            <span class="tree-toggler">▼</span>
            <span class="file-icon">${item.type === "directory" ? "📁" : getFileIcon(item.name)}</span>
            <span class="file-name" title="${escapeAttr(item.path)}">${escapeHtml(item.name)}</span>
            <span class="file-actions-menu">
                <span class="btn-icon btn-sm" onclick="event.stopPropagation(); editorDeleteFileByPath('${escapeAttr(item.path)}')" title="Delete">🗑</span>
            </span>
        `;

    content.onclick = (e) => {
      e.stopPropagation();
      if (item.type === "directory") {
        li.classList.toggle("collapsed");
        if (li.classList.contains("collapsed")) {
          editorExpandedFolders.delete(item.path);
        } else {
          editorExpandedFolders.add(item.path);
        }
      } else {
        editorSelectFile(item.path);
      }
    };

    li.appendChild(content);

    if (item.type === "directory") {
      const childrenContainer = document.createElement("div");
      childrenContainer.className = "tree-children";
      renderTree(item, childrenContainer);
      li.appendChild(childrenContainer);
    }

    ul.appendChild(li);
  });

  container.appendChild(ul);
}

function renderEditorFiles() {
  const container = document.getElementById("editor-file-list");
  container.innerHTML = "";

  if (editorFiles.length === 0) {
    container.innerHTML =
      '<div style="padding:12px; color:var(--overlay0); font-size:12px;">No files.</div>';
    return;
  }

  const treeRoot = buildFileTree(editorFiles);
  renderTree(treeRoot, container);
}

function resetEditorContent() {
  document.getElementById("editor-header").style.display = "none";
  document.getElementById("editor-textarea").style.display = "none";
  document.getElementById("editor-empty").style.display = "flex";
  editorCurrentFile = null;
}

async function editorSelectFile(filePath) {
  if (editorDirty) {
    if (!confirm("You have unsaved changes. Switch file?")) return;
  }

  const skillName =
    document.getElementById("skill-editor-modal").dataset.skillName;
  const sourceType =
    document.getElementById("skill-editor-modal").dataset.sourceType;
  let url;
  if (editorSource === "context") {
    url = `/api/contexts/${encodeURIComponent(editorContext)}/skills/${encodeURIComponent(skillName)}/file/${encodeURIComponent(filePath)}`;
  } else if (sourceType === "workflow") {
    url = `/api/workflows/${encodeURIComponent(skillName)}/file/${encodeURIComponent(filePath)}`;
  } else {
    url = `/api/skills/${encodeURIComponent(skillName)}/file/${encodeURIComponent(filePath)}`;
  }

  try {
    const data = await api(url);
    editorCurrentFile = filePath;
    editorDirty = false;

    document.getElementById("editor-filename").textContent = filePath;
    document.getElementById("editor-header").style.display = "flex";
    document.getElementById("editor-empty").style.display = "none";

    const textarea = document.getElementById("editor-textarea");
    textarea.style.display = "block";
    textarea.value = data.content;

    renderEditorFiles();
  } catch (e) {
    showToast("Failed to load file: " + e.message, "error");
  }
}

document.getElementById("editor-textarea").addEventListener("input", () => {
  editorDirty = true;
});

async function editorSaveFile() {
  if (!editorCurrentFile) return;

  const skillName =
    document.getElementById("skill-editor-modal").dataset.skillName;
  const sourceType =
    document.getElementById("skill-editor-modal").dataset.sourceType;
  const content = document.getElementById("editor-textarea").value;

  let url;
  if (editorSource === "context") {
    url = `/api/contexts/${encodeURIComponent(editorContext)}/skills/${encodeURIComponent(skillName)}/file/${encodeURIComponent(editorCurrentFile)}`;
  } else if (sourceType === "workflow") {
    url = `/api/workflows/${encodeURIComponent(skillName)}/file/${encodeURIComponent(editorCurrentFile)}`;
  } else {
    url = `/api/skills/${encodeURIComponent(skillName)}/file/${encodeURIComponent(editorCurrentFile)}`;
  }

  try {
    await api(url, "PUT", { content });
    editorDirty = false;
    showToast("File saved ✓", "success");
  } catch (e) {
    showToast("Failed to save: " + e.message, "error");
  }
}

function editorNewFile() {
  showDialog(`
    <h3>Create New File</h3>
    <input type="text" id="new-file-path" placeholder="filename.md" autofocus
           onkeydown="if(event.key==='Enter') editorCreateFile()">
    <div class="dialog-actions">
      <button class="btn" onclick="closeDialog()">Cancel</button>
      <button class="btn btn-primary" onclick="editorCreateFile()">Create</button>
    </div>
  `);
  setTimeout(() => document.getElementById("new-file-path")?.focus(), 100);
}

async function editorCreateFile() {
  const input = document.getElementById("new-file-path");
  const filePath = input?.value?.trim();
  if (!filePath) return showToast("Please enter a filename", "error");

  const skillName =
    document.getElementById("skill-editor-modal").dataset.skillName;
  const sourceType =
    document.getElementById("skill-editor-modal").dataset.sourceType;
  let url;
  if (editorSource === "context") {
    url = `/api/contexts/${encodeURIComponent(editorContext)}/skills/${encodeURIComponent(skillName)}/file/${encodeURIComponent(filePath)}`;
  } else if (sourceType === "workflow") {
    url = `/api/workflows/${encodeURIComponent(skillName)}/file/${encodeURIComponent(filePath)}`;
  } else {
    url = `/api/skills/${encodeURIComponent(skillName)}/file/${encodeURIComponent(filePath)}`;
  }

  try {
    await api(url, "PUT", { content: "" });
    closeDialog();
    showToast(`File "${filePath}" created`, "success");
    await reloadEditorFiles();
    editorSelectFile(filePath);
  } catch (e) {
    showToast(e.message, "error");
  }
}

function editorNewFolder() {
  showDialog(`
    <h3>Create New Folder</h3>
    <input type="text" id="new-folder-name" placeholder="folder-name" autofocus
           onkeydown="if(event.key==='Enter') editorCreateFolder()">
    <div class="dialog-actions">
      <button class="btn" onclick="closeDialog()">Cancel</button>
      <button class="btn btn-primary" onclick="editorCreateFolder()">Create</button>
    </div>
  `);
  setTimeout(() => document.getElementById("new-folder-name")?.focus(), 100);
}

async function editorCreateFolder() {
  const input = document.getElementById("new-folder-name");
  const folderName = input?.value?.trim();
  if (!folderName) return showToast("Please enter a folder name", "error");

  const skillName =
    document.getElementById("skill-editor-modal").dataset.skillName;
  const sourceType =
    document.getElementById("skill-editor-modal").dataset.sourceType;
  const filePath = `${folderName}/.gitkeep`;
  let url;
  if (editorSource === "context") {
    url = `/api/contexts/${encodeURIComponent(editorContext)}/skills/${encodeURIComponent(skillName)}/file/${encodeURIComponent(filePath)}`;
  } else if (sourceType === "workflow") {
    url = `/api/workflows/${encodeURIComponent(skillName)}/file/${encodeURIComponent(filePath)}`;
  } else {
    url = `/api/skills/${encodeURIComponent(skillName)}/file/${encodeURIComponent(filePath)}`;
  }

  try {
    await api(url, "PUT", { content: "" });
    closeDialog();
    showToast(`Folder "${folderName}" created`, "success");
    editorExpandedFolders.add(folderName);
    await reloadEditorFiles();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function editorDeleteFileByPath(filePath) {
  if (!confirm(`Delete "${filePath}"?`)) return;
  const skillName =
    document.getElementById("skill-editor-modal").dataset.skillName;
  const sourceType =
    document.getElementById("skill-editor-modal").dataset.sourceType;
  let url;
  if (editorSource === "context") {
    url = `/api/contexts/${encodeURIComponent(editorContext)}/skills/${encodeURIComponent(skillName)}/file/${encodeURIComponent(filePath)}`;
  } else if (sourceType === "workflow") {
    url = `/api/workflows/${encodeURIComponent(skillName)}/file/${encodeURIComponent(filePath)}`;
  } else {
    url = `/api/skills/${encodeURIComponent(skillName)}/file/${encodeURIComponent(filePath)}`;
  }

  try {
    await api(url, "DELETE");
    showToast(`Deleted "${filePath}"`, "success");
    if (editorCurrentFile === filePath) resetEditorContent();
    await reloadEditorFiles();
  } catch (e) {
    showToast("Failed to delete: " + e.message, "error");
  }
}

async function reloadEditorFiles() {
  const skillName =
    document.getElementById("skill-editor-modal").dataset.skillName;
  const sourceType =
    document.getElementById("skill-editor-modal").dataset.sourceType;
  let url;
  if (editorSource === "context") {
    url = `/api/contexts/${encodeURIComponent(editorContext)}/skills/${encodeURIComponent(skillName)}/files`;
  } else if (sourceType === "workflow") {
    url = `/api/workflows/${encodeURIComponent(skillName)}/files`;
  } else {
    url = `/api/skills/${encodeURIComponent(skillName)}/files`;
  }
  try {
    editorFiles = await api(url);
  } catch (e) {
    editorFiles = [];
  }
  renderEditorFiles();
}

async function editorDeleteFile() {
  if (!editorCurrentFile) return;
  await editorDeleteFileByPath(editorCurrentFile);
}

// ══════════════════════════════ DRAG AND DROP SUPPORT ══════════════════════════════

function onDragStart(event, source, itemName, itemType = "skill") {
  if (source === "library") {
    let item;
    if (itemType === "workflow") {
      item = libraryWorkflows.find((w) => w.name === itemName);
    } else {
      item = librarySkills.find((s) => s.name === itemName);
    }
    if (item && item.hasDescription === false) {
      event.preventDefault();
      return false;
    }
  }

  event.dataTransfer.setData(
    "text/plain",
    JSON.stringify({ source, itemName, itemType }),
  );
  event.dataTransfer.effectAllowed = "copy";
}

function onDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";

  const element = event.target.closest(".item-card");
  if (element) {
    element.style.border = "2px dashed #4CAF50";
  }
}

function onDrop(event, targetContextName) {
  event.preventDefault();

  const element = event.target.closest(".item-card");
  if (element) {
    element.style.border = "";
  }

  try {
    const data = JSON.parse(event.dataTransfer.getData("text/plain"));
    if (data.source === "library") {
      if (data.itemType === "workflow") {
        moveWorkflowToContext(data.itemName, targetContextName);
      } else {
        // Default to skill for backward compatibility
        moveSkillToContext(data.itemName || data.skillName, targetContextName);
      }
    }
  } catch (e) {
    showToast("Error processing drag and drop: " + e.message, "error");
  }
}

async function moveSkillToContext(skillName, contextName) {
  try {
    const contextSkills = await api(
      `/api/contexts/${encodeURIComponent(contextName)}/skills`,
    );
    const skillExists = contextSkills.some((skill) => skill.name === skillName);

    if (skillExists) {
      showToast(
        `Skill "${skillName}" already exists in context "${contextName}"`,
        "warning",
      );
      return;
    }

    await api(
      `/api/contexts/${encodeURIComponent(contextName)}/skills`,
      "POST",
      { name: skillName },
    );

    const libraryFiles = await api(
      `/api/skills/${encodeURIComponent(skillName)}/files`,
    );

    for (const file of libraryFiles) {
      if (file.type === "file") {
        const fileData = await api(
          `/api/skills/${encodeURIComponent(skillName)}/file/${encodeURIComponent(file.path)}`,
        );
        await api(
          `/api/contexts/${encodeURIComponent(contextName)}/skills/${encodeURIComponent(skillName)}/file/${encodeURIComponent(file.path)}`,
          "PUT",
          { content: fileData.content },
        );
      }
    }

    showToast(
      `Skill "${skillName}" added to context "${contextName}"`,
      "success",
    );

    if (selectedContext === contextName) {
      await loadContextSkills(contextName);
    }
  } catch (e) {
    showToast(`Failed to move skill: ${e.message}`, "error");
  }
}

async function moveWorkflowToContext(workflowName, contextName) {
  try {
    const contextWorkflows = await api(
      `/api/contexts/${encodeURIComponent(contextName)}/workflows`,
    );
    const workflowExists = contextWorkflows.some(
      (workflow) => workflow.name === workflowName,
    );

    if (workflowExists) {
      showToast(
        `Workflow "${workflowName}" already exists in context "${contextName}"`,
        "warning",
      );
      return;
    }

    await api(
      `/api/contexts/${encodeURIComponent(contextName)}/workflows`,
      "POST",
      { name: workflowName },
    );

    const libraryFiles = await api(
      `/api/workflows/${encodeURIComponent(workflowName)}/files`,
    );

    for (const file of libraryFiles) {
      if (file.type === "file") {
        const fileData = await api(
          `/api/workflows/${encodeURIComponent(workflowName)}/file/${encodeURIComponent(file.path)}`,
        );
        await api(
          `/api/contexts/${encodeURIComponent(contextName)}/workflows/${encodeURIComponent(workflowName)}/file/${encodeURIComponent(file.path)}`,
          "PUT",
          { content: fileData.content },
        );
      }
    }

    showToast(
      `Workflow "${workflowName}" added to context "${contextName}"`,
      "success",
    );

    if (selectedContext === contextName) {
      await loadContextSkills(contextName);
    }
  } catch (e) {
    showToast(`Failed to move workflow: ${e.message}`, "error");
  }
}

// ══════════════════════════════ KEYBOARD SHORTCUTS ══════════════════════════════

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key === "s") {
    e.preventDefault();
    if (
      document.getElementById("skill-editor-modal").classList.contains("active")
    ) {
      editorSaveFile();
    }
  }
  if (e.key === "Escape") {
    if (
      document.getElementById("dialog-overlay").classList.contains("active")
    ) {
      closeDialog();
    } else if (
      document.getElementById("skill-editor-modal").classList.contains("active")
    ) {
      closeSkillEditor();
    }
  }
});

// ══════════════════════════════ UTILITIES ══════════════════════════════

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  if (!str) return "";
  return str.replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

function truncate(str, len) {
  if (!str) return "";
  return str.length > len ? str.substring(0, len) + "…" : str;
}

function getFileIcon(filename) {
  const ext = filename.split(".").pop()?.toLowerCase();
  const icons = {
    md: "📝",
    txt: "📄",
    py: "🐍",
    js: "📜",
    json: "📋",
    yaml: "⚙️",
    yml: "⚙️",
    toml: "⚙️",
    sh: "🖥️",
    html: "🌐",
    css: "🎨",
    rs: "🦀",
    ts: "📜",
    gitkeep: "📁",
  };
  return icons[ext] || "📄";
}

async function refreshAll() {
  await Promise.all([loadContexts(), loadLibrary()]);
  showToast("Refreshed ✓", "success");
}

// ── Create Description.md Functionality ──

async function createDescriptionMd(skillName) {
  try {
    const url = `/api/skills/${encodeURIComponent(skillName)}/file/description.md`;
    await api(url, "PUT", {
      content: `# ${skillName}\n\nDescription of the ${skillName} skill.\n\n## Purpose\nBrief description of what this skill does.\n\n## Usage\nInstructions on how to use this skill.`,
    });

    showToast(`description.md created for ${skillName}`, "success");

    await loadLibrary();
  } catch (e) {
    showToast(`Failed to create description.md: ${e.message}`, "error");
  }
}

function maskApiKey(key) {
  if (!key || key.length <= 8) return key || '';
  return key.slice(0, -8) + '********';
}

function showGenerateDescDialog(skillName) {
  const savedKey = aiSettings.apiKey || '';
  const maskedKey = savedKey ? maskApiKey(savedKey) : '';
  
  showDialog(`
    <h3>Generate Description for "${escapeHtml(skillName)}"</h3>
    <p style="font-size: 12px; color: var(--overlay0); margin-bottom: 12px;">
      AI will analyze skill files and generate description.md
    </p>
    <div class="form-group">
      <label>AI Provider URL</label>
      <input type="text" id="ai-url" value="${aiSettings.url || 'https://openrouter.ai/api/v1/chat/completions'}" placeholder="AI API endpoint">
    </div>
    <div class="form-group">
      <label>Model</label>
      <input type="text" id="ai-model" value="${aiSettings.model || 'openrouter/free'}" placeholder="Model name">
    </div>
    <div class="form-group">
      <label>API Key ${savedKey ? '(saved)' : ''}</label>
      <input type="password" id="ai-key" value="${savedKey}" placeholder="Your API key" autocomplete="off">
      ${savedKey ? `<small style="color: var(--overlay0);">Saved: ${maskedKey}</small>` : ''}
    </div>
    <div class="dialog-actions">
      <button class="btn" onclick="closeDialog()">Cancel</button>
      <button class="btn btn-primary" onclick="generateDescription('${escapeAttr(skillName)}')">Generate</button>
    </div>
  `);
}

async function generateDescription(skillName) {
  const url = document.getElementById('ai-url')?.value?.trim();
  const model = document.getElementById('ai-model')?.value?.trim();
  const apiKey = document.getElementById('ai-key')?.value?.trim();
  
  if (!url || !model || !apiKey) {
    return showToast('Please fill all fields', 'error');
  }
  
  // Save settings
  aiSettings = { url, model, apiKey };
  localStorage.setItem('ai-settings', JSON.stringify(aiSettings));
  
  closeDialog();
  
  // Show loading overlay
  const loadingOverlay = document.createElement('div');
  loadingOverlay.id = 'loading-overlay';
  loadingOverlay.innerHTML = `
    <div class="loading-content">
      <div class="loading-spinner"></div>
      <div class="loading-text">Generating description...</div>
      <div class="loading-hint">This may take a moment</div>
    </div>
  `;
  document.body.appendChild(loadingOverlay);
  
  try {
    const result = await api('/api/skills/generate-description', 'POST', {
      skillName,
      aiUrl: url,
      model,
      apiKey
    });
    
    showToast(`Description generated for ${skillName}`, 'success');
    await loadLibrary();
  } catch (e) {
    showToast(`Failed to generate: ${e.message}`, 'error');
  } finally {
    loadingOverlay.remove();
  }
}

// ══════════════════════════════ PANEL RESIZING ══════════════════════════════

function setupPanelResizing() {
  const separator1 = document.getElementById("separator1");
  const separator2 = document.getElementById("separator2");
  const mainContent = document.querySelector(".main-content");
  const libraryPanel = document.getElementById("library-panel");
  const contextPanel = document.getElementById("context-panel");
  const skillsPanel = document.getElementById("skills-panel");

  let isDragging = false;
  let currentSeparator = null;
  let initialMousePosition;
  let initialLibraryWidth;
  let initialContextWidth;
  let initialSkillsWidth;
  let initialSeparatorPosition;

  // Save current widths to localStorage
  function savePanelWidths() {
    const widths = {
      library: libraryPanel.offsetWidth,
      context: contextPanel.offsetWidth
    };
    localStorage.setItem('panel-widths', JSON.stringify(widths));
  }

  function updateGridColumns() {
    const libWidth = libraryPanel.offsetWidth;
    const ctxWidth = contextPanel.offsetWidth;
    const skillsWidth = skillsPanel.offsetWidth;
    mainContent.style.gridTemplateColumns = `${libWidth}px 4px ${ctxWidth}px 4px ${skillsWidth}px`;
  }

  function resizePanel(e) {
    if (!isDragging) return;

    const mouseDelta = e.clientX - initialSeparatorPosition;

    if (currentSeparator === separator1) {
      let newLibWidth = initialLibraryWidth + mouseDelta;

      if (newLibWidth > 150) {
        const currentSkillsWidth = skillsPanel.offsetWidth;
        const containerWidth = mainContent.offsetWidth;
        let newCtxWidth =
          containerWidth - newLibWidth - 4 - 4 - currentSkillsWidth;

        const minCtxWidth = 250;
        if (newCtxWidth < minCtxWidth) {
          newCtxWidth = minCtxWidth;
          newLibWidth =
            containerWidth - minCtxWidth - 4 - 4 - currentSkillsWidth;
        }

        mainContent.style.gridTemplateColumns = `${newLibWidth}px 4px ${newCtxWidth}px 4px ${currentSkillsWidth}px`;
      }
    } else if (currentSeparator === separator2) {
      let newCtxWidth = initialContextWidth + mouseDelta;
      let newSkillsWidth = initialSkillsWidth - mouseDelta;

      const minCtxWidth = 250;
      if (newCtxWidth < minCtxWidth) {
        newCtxWidth = minCtxWidth;
        newSkillsWidth =
          initialSkillsWidth - (minCtxWidth - initialContextWidth);
      }

      if (newCtxWidth > 150 && newSkillsWidth > 150) {
        const currentLibWidth = libraryPanel.offsetWidth;
        mainContent.style.gridTemplateColumns = `${currentLibWidth}px 4px ${newCtxWidth}px 4px ${newSkillsWidth}px`;
      }
    }

    e.preventDefault();
  }

  function stopResize() {
    isDragging = false;
    currentSeparator = null;
    document.removeEventListener("mousemove", resizePanel);
    document.removeEventListener("mouseup", stopResize);
    
    // Save widths after resizing
    savePanelWidths();
  }

  separator1.addEventListener("mousedown", (e) => {
    isDragging = true;
    currentSeparator = separator1;
    initialMousePosition = e.clientX;
    initialLibraryWidth = libraryPanel.offsetWidth;
    initialContextWidth = contextPanel.offsetWidth;
    initialSkillsWidth = skillsPanel.offsetWidth;
    const rect = separator1.getBoundingClientRect();
    initialSeparatorPosition = rect.left + rect.width / 2;

    document.addEventListener("mousemove", resizePanel);
    document.addEventListener("mouseup", stopResize);
  });

  separator2.addEventListener("mousedown", (e) => {
    isDragging = true;
    currentSeparator = separator2;
    initialMousePosition = e.clientX;
    initialContextWidth = contextPanel.offsetWidth;
    initialSkillsWidth = skillsPanel.offsetWidth;
    const rect = separator2.getBoundingClientRect();
    initialSeparatorPosition = rect.left + rect.width / 2;

    document.addEventListener("mousemove", resizePanel);
    document.addEventListener("mouseup", stopResize);
  });
}

// Boot
(async () => {
  await loadSkillHubs();
  await loadContexts();
  await loadLibrary();
  await loadSettingsProfilesList();
  setupPanelResizing();
})();
