const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { exec } = require("child_process");
const multer = require("multer");

const app = express();
const port = 3000;

console.log("DEBUG: Server v3.0 started with debug logging");

// Middleware
app.use(express.json({ limit: "100mb" }));
// Increase limit for JSON (if needed) and URL encoded bodies
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Multer setup for file uploads (temporarily store in /tmp or memory)
const upload = multer({ dest: os.tmpdir() });

// Base storage paths
const BASE_STORAGE_PATH = path.join(os.homedir(), "contextmanager");
const HUBS_BASE_PATH = path.join(BASE_STORAGE_PATH, "hubs");
const MASTER_CONFIG_PATH = path.join(BASE_STORAGE_PATH, "master-config.json");
const AI_SETTINGS_PATH = path.join(BASE_STORAGE_PATH, "ai-settings.json");

// Current hub paths (will be set based on active hub)
let STORAGE_PATH = path.join(HUBS_BASE_PATH, "MySkillHub");
let CONFIG_PATH = path.join(STORAGE_PATH, "config.json");
let CONTEXTS_PATH = path.join(STORAGE_PATH, "contexts");
let SKILLS_PATH = path.join(STORAGE_PATH, "skills");
let WORKFLOWS_PATH = path.join(STORAGE_PATH, "workflows");
let SETTINGS_PROFILES_PATH = path.join(STORAGE_PATH, "settings-profiles");

// Load master config (stores active hub)
function loadMasterConfig() {
  if (!fs.existsSync(BASE_STORAGE_PATH)) {
    fs.mkdirSync(BASE_STORAGE_PATH, { recursive: true });
  }

  if (fs.existsSync(MASTER_CONFIG_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(MASTER_CONFIG_PATH, "utf-8"));
    } catch (e) {
      console.error("Error reading master config:", e.message);
    }
  }

  // Default master config
  const defaultMasterConfig = {
    active_hub: "MySkillHub",
    hubs: ["MySkillHub"],
  };
  saveMasterConfig(defaultMasterConfig);
  return defaultMasterConfig;
}

// Save master config
function saveMasterConfig(config) {
  if (!fs.existsSync(BASE_STORAGE_PATH)) {
    fs.mkdirSync(BASE_STORAGE_PATH, { recursive: true });
  }
  fs.writeFileSync(
    MASTER_CONFIG_PATH,
    JSON.stringify(config, null, 2),
    "utf-8",
  );
}

// Load AI settings (url, model, apiKey) with secure file permissions
function loadAISettings() {
  if (fs.existsSync(AI_SETTINGS_PATH)) {
    try {
      const data = fs.readFileSync(AI_SETTINGS_PATH, "utf-8");
      const settings = JSON.parse(data);
      if (settings.apiKey) {
        console.log("DEBUG: AI settings loaded (apiKey present)");
      }
      return settings;
    } catch (e) {
      console.error("Error reading AI settings:", e.message);
    }
  }
  return { url: "", model: "", apiKey: "" };
}

// Save AI settings with secure file permissions (0600 = owner read/write only)
function saveAISettings(settings) {
  if (!fs.existsSync(BASE_STORAGE_PATH)) {
    fs.mkdirSync(BASE_STORAGE_PATH, { recursive: true });
  }
  fs.writeFileSync(AI_SETTINGS_PATH, JSON.stringify(settings, null, 2), {
    encoding: "utf-8",
    mode: 0o600, // Only owner can read/write
  });
  console.log("DEBUG: AI settings saved with secure permissions");
}

// Update paths based on active hub
function updateHubPaths(hubName) {
  STORAGE_PATH = path.join(HUBS_BASE_PATH, hubName);
  CONFIG_PATH = path.join(STORAGE_PATH, "config.json");
  CONTEXTS_PATH = path.join(STORAGE_PATH, "contexts");
  SKILLS_PATH = path.join(STORAGE_PATH, "skills");
  WORKFLOWS_PATH = path.join(STORAGE_PATH, "workflows");
  SETTINGS_PROFILES_PATH = path.join(STORAGE_PATH, "settings-profiles");
}

// Initialize with active hub
const masterConfig = loadMasterConfig();
updateHubPaths(masterConfig.active_hub);

// Ensure directories exist
function ensureDirectories() {
  [
    STORAGE_PATH,
    CONTEXTS_PATH,
    SKILLS_PATH,
    WORKFLOWS_PATH,
    SETTINGS_PROFILES_PATH,
  ].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// Load config
function loadConfig() {
  ensureDirectories();
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));

      // Backward compatibility: migrate old "contexts" to "context_cells"
      if (config.contexts && !config.context_cells) {
        config.context_cells = config.contexts;
        delete config.contexts;
        // Also migrate skill modes from "default" to "always_loaded"
        for (const ctx of config.context_cells) {
          // Remove mode from context cells (no longer used)
          if (ctx.mode) delete ctx.mode;
          // Remove description from context cells (no longer used)
          if (ctx.description !== undefined) delete ctx.description;
          // Migrate skill modes
          if (ctx.skills) {
            for (const skillName in ctx.skills) {
              if (ctx.skills[skillName].mode === "default") {
                ctx.skills[skillName].mode = "always_loaded";
              }
            }
          }
        }
        saveConfig(config);
      }

      // Ensure context_cells exists
      if (!config.context_cells) {
        config.context_cells = [];
      }

      return config;
    } catch (e) {
      console.error("Error reading config:", e.message);
    }
  }
  // Default config
  const defaultConfig = {
    storage_path: STORAGE_PATH,
    context_cells: [],
    settings: {
      confirm_delete: true,
      show_hidden_files: false,
      auto_expand_folders: false,
      github_token: null,
    },
  };
  saveConfig(defaultConfig);
  return defaultConfig;
}

// Save config
function saveConfig(config) {
  ensureDirectories();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

// Helper: sanitize name to folder
function nameToFolder(name) {
  return name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
}

// Helper: list files recursively
function listFilesRecursive(dirPath, basePath) {
  const results = [];
  if (!fs.existsSync(dirPath)) return results;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(basePath, fullPath);
    if (entry.isDirectory()) {
      results.push({ name: entry.name, path: relativePath, type: "directory" });
      results.push(...listFilesRecursive(fullPath, basePath));
    } else {
      try {
        const stats = fs.statSync(fullPath);
        results.push({
          name: entry.name,
          path: relativePath,
          type: "file",
          size: stats.size,
          modified: stats.mtime.toISOString(),
        });
      } catch (e) {
        // Skip files that can't be accessed (broken symlinks, permissions, etc.)
        console.log(
          `DEBUG: Skipping file that cannot be accessed: ${fullPath} - ${e.message}`,
        );
      }
    }
  }
  return results;
}

// Helper: Calculate approx tokens (4 chars = 1 token) recursively
function calculateTokensRecursive(dirPath) {
  let count = 0;
  if (!fs.existsSync(dirPath)) return 0;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      count += calculateTokensRecursive(fullPath);
    } else {
      // Basic text file check
      const ext = path.extname(entry.name).toLowerCase();
      const textExts = [
        ".md",
        ".txt",
        ".js",
        ".ts",
        ".py",
        ".json",
        ".html",
        ".css",
        ".c",
        ".cpp",
        ".h",
        ".java",
        ".go",
        ".rs",
        ".sh",
        ".yaml",
        ".yml",
      ];
      if (textExts.includes(ext) || entry.name === ".gitkeep") {
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          count += Math.ceil(content.length / 4);
        } catch (_) {}
      }
    }
  }
  return count;
}

// ──────────────────────── CONTEXT ENDPOINTS ────────────────────────

// GET /api/contexts – list all context cells
app.get("/api/contexts", (req, res) => {
  const config = loadConfig();
  res.json(config.context_cells || []);
});

// POST /api/contexts – create a new context
app.post("/api/contexts", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });

  const config = loadConfig();
  if (!config.context_cells) config.context_cells = [];
  if (config.context_cells.some((c) => c.name === name)) {
    return res.status(409).json({ error: "Context already exists" });
  }

  const folder = nameToFolder(name);
  const contextDir = path.join(CONTEXTS_PATH, folder);
  fs.mkdirSync(contextDir, { recursive: true });

  const context = {
    name,
    folder,
    created_at: new Date().toISOString(),
    enabled: true,
    skills: {},
  };

  config.context_cells.push(context);
  saveConfig(config);
  res.status(201).json(context);
});

// DELETE /api/contexts/:name – delete a context
app.delete("/api/contexts/:name", (req, res) => {
  const config = loadConfig();
  const idx = config.context_cells.findIndex((c) => c.name === req.params.name);
  if (idx === -1) return res.status(404).json({ error: "Context not found" });

  const context = config.context_cells[idx];
  const contextDir = path.join(CONTEXTS_PATH, context.folder);

  // Remove folder
  if (fs.existsSync(contextDir)) {
    fs.rmSync(contextDir, { recursive: true, force: true });
  }

  config.context_cells.splice(idx, 1);
  saveConfig(config);
  res.json({ success: true });
});

// PATCH /api/contexts/:name/toggle – update enabled
app.patch("/api/contexts/:name/toggle", (req, res) => {
  const config = loadConfig();
  const context = config.context_cells.find((c) => c.name === req.params.name);
  if (!context) return res.status(404).json({ error: "Context not found" });

  if (req.body.enabled !== undefined) context.enabled = req.body.enabled;

  saveConfig(config);
  res.json(context);
});

// GET /api/contexts/:name/skills – list skills in a context cell
app.get("/api/contexts/:name/skills", (req, res) => {
  const config = loadConfig();
  const context = config.context_cells.find((c) => c.name === req.params.name);
  if (!context) return res.status(404).json({ error: "Context not found" });

  const contextDir = path.join(CONTEXTS_PATH, context.folder);
  if (!fs.existsSync(contextDir)) return res.json([]);

  // Skills are subdirectories of the context folder, but exclude workflows
  const entries = fs.readdirSync(contextDir, { withFileTypes: true });
  const skills = entries
    .filter((e) => e.isDirectory())
    .map((e) => {
      // Check if this directory is a workflow by looking for specific workflow files
      const itemPath = path.join(contextDir, e.name);
      const itemFiles = fs.readdirSync(itemPath);
      const isWorkflow = itemFiles.some(
        (file) =>
          file === "workflow.json" ||
          file === "workflow.yaml" ||
          file === "workflow.yml" ||
          file === "workflow.md",
      );

      // Only process as skill if it's not a workflow and is in the skills config
      if (
        isWorkflow ||
        !(context.skills && context.skills.hasOwnProperty(e.name))
      ) {
        return null; // Not a skill, skip
      }

      const skillToggle = context.skills[e.name] || {
        enabled: true,
        mode: "always_loaded",
      };
      // Read description.md if exists
      const descPath = path.join(contextDir, e.name, "description.md");
      let description = "";
      const hasDescription = fs.existsSync(descPath);
      if (hasDescription) {
        try {
          description = fs.readFileSync(descPath, "utf-8").trim();
        } catch (_) {}
      }

      // Calculate tokens
      const skillPath = path.join(contextDir, e.name);
      const tokens = calculateTokensRecursive(skillPath);

      return {
        name: e.name,
        description,
        enabled: skillToggle.enabled !== undefined ? skillToggle.enabled : true,
        mode: skillToggle.mode || "always_loaded",
        tokens,
        hasDescription,
      };
    })
    .filter(Boolean); // Remove null values

  res.json(skills);
});

// PATCH /api/contexts/:contextName/skills/:skillName/toggle
app.patch("/api/contexts/:contextName/skills/:skillName/toggle", (req, res) => {
  const config = loadConfig();
  const context = config.context_cells.find(
    (c) => c.name === req.params.contextName,
  );
  if (!context) return res.status(404).json({ error: "Context not found" });

  if (!context.skills) context.skills = {};
  if (!context.skills[req.params.skillName]) {
    context.skills[req.params.skillName] = {
      enabled: true,
      mode: "always_loaded",
    };
  }

  const skill = context.skills[req.params.skillName];
  if (req.body.enabled !== undefined) skill.enabled = req.body.enabled;
  if (req.body.mode !== undefined) skill.mode = req.body.mode;

  saveConfig(config);
  res.json(skill);
});

// ──────────────────────── LIBRARY SKILL ENDPOINTS ────────────────────────

// GET /api/skills – list all library skills
app.get("/api/skills", (req, res) => {
  if (!fs.existsSync(SKILLS_PATH)) return res.json([]);

  const entries = fs.readdirSync(SKILLS_PATH, { withFileTypes: true });
  const skills = entries
    .filter((e) => e.isDirectory())
    .map((e) => {
      const skillPath = path.join(SKILLS_PATH, e.name);
      const descPath = path.join(skillPath, "description.md");
      let description = "";
      const hasDescription = fs.existsSync(descPath);

      if (hasDescription) {
        try {
          description = fs.readFileSync(descPath, "utf-8").trim();
        } catch (_) {}
      }

      const stats = fs.statSync(skillPath);
      const created = stats.birthtime;
      const modified = stats.mtime;
      const tokens = calculateTokensRecursive(skillPath);

      return {
        name: e.name,
        description,
        tokens,
        hasDescription,
        created,
        modified,
      };
    });

  res.json(skills);
});

// GET /api/skills/:name/files – list files in a skill
app.get("/api/skills/:name/files", (req, res) => {
  const skillDir = path.join(SKILLS_PATH, req.params.name);
  if (!fs.existsSync(skillDir))
    return res.status(404).json({ error: "Skill not found" });
  res.json(listFilesRecursive(skillDir, skillDir));
});

// GET /api/skills/:name/files/* – read a specific skill file
app.get("/api/skills/:name/file/*", (req, res) => {
  const relativePath = req.params[0];
  const filePath = path.join(SKILLS_PATH, req.params.name, relativePath);

  // Security: ensure path stays within skill dir
  const skillDir = path.join(SKILLS_PATH, req.params.name);
  if (!path.resolve(filePath).startsWith(path.resolve(skillDir))) {
    return res.status(403).json({ error: "Invalid path" });
  }

  if (!fs.existsSync(filePath))
    return res.status(404).json({ error: "File not found" });

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    res.json({ path: relativePath, content });
  } catch (e) {
    res.status(500).json({ error: "Error reading file" });
  }
});

// PUT /api/skills/:name/file/* – write/update a skill file
app.put("/api/skills/:name/file/*", (req, res) => {
  const relativePath = req.params[0];
  const filePath = path.join(SKILLS_PATH, req.params.name, relativePath);

  const skillDir = path.join(SKILLS_PATH, req.params.name);
  if (!path.resolve(filePath).startsWith(path.resolve(skillDir))) {
    return res.status(403).json({ error: "Invalid path" });
  }

  // Ensure parent directory exists
  const parentDir = path.dirname(filePath);
  fs.mkdirSync(parentDir, { recursive: true });

  try {
    fs.writeFileSync(filePath, req.body.content || "", "utf-8");
    res.json({ success: true, path: relativePath });
  } catch (e) {
    res.status(500).json({ error: "Error writing file" });
  }
});

// DELETE /api/skills/:name/file/* – delete a skill file
app.delete("/api/skills/:name/file/*", (req, res) => {
  const relativePath = req.params[0];
  const filePath = path.join(SKILLS_PATH, req.params.name, relativePath);

  const skillDir = path.join(SKILLS_PATH, req.params.name);
  if (!path.resolve(filePath).startsWith(path.resolve(skillDir))) {
    return res.status(403).json({ error: "Invalid path" });
  }

  if (!fs.existsSync(filePath))
    return res.status(404).json({ error: "File not found" });

  try {
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(filePath);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Error deleting file" });
  }
});

// POST /api/skills – create a new skill folder
app.post("/api/skills", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });

  const skillDir = path.join(SKILLS_PATH, name);
  if (fs.existsSync(skillDir))
    return res.status(409).json({ error: "Skill already exists" });

  fs.mkdirSync(skillDir, { recursive: true });
  // Create default files
  fs.writeFileSync(
    path.join(skillDir, "description.md"),
    `# ${name}\n\nDescription of the ${name} skill.`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(skillDir, "skill.md"),
    `# ${name}\n\nMain skill instructions go here.`,
    "utf-8",
  );

  res.status(201).json({
    name,
    description: `# ${name}\n\nDescription of the ${name} skill.`,
  });
});

// DELETE /api/skills/:name – delete a skill
app.delete("/api/skills/:name", (req, res) => {
  const skillDir = path.join(SKILLS_PATH, req.params.name);
  if (!fs.existsSync(skillDir))
    return res.status(404).json({ error: "Skill not found" });

  fs.rmSync(skillDir, { recursive: true, force: true });
  res.json({ success: true });
});

// POST /api/skills/import/github – import from GitHub
app.post("/api/skills/import/github", (req, res) => {
  const { url, name } = req.body;
  console.log(`DEBUG: GitHub import request: URL=${url}, Name=${name}`);
  if (!url) return res.status(400).json({ error: "URL is required" });

  // Check if URL is a GitHub tree URL (specific folder in repo)
  const githubTreeRegex =
    /^https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)\/(.+)$/;
  const match = url.match(githubTreeRegex);

  if (match) {
    // Handle GitHub tree URL: extract owner, repo, branch, path
    const [, owner, repo, branch, folderPath] = match;

    // Extract name from folder path if not provided
    let cleanName = name || path.basename(folderPath);
    cleanName = cleanName.replace(/[^a-zA-Z0-9_\-\.]/g, "_");

    const skillDir = path.join(SKILLS_PATH, cleanName);
    if (fs.existsSync(skillDir)) {
      console.log(`DEBUG: Skill directory already exists: ${skillDir}`);
      return res
        .status(409)
        .json({ error: `Skill "${cleanName}" already exists` });
    }

    // Create temporary directory for download
    const tempDir = path.join(
      os.tmpdir(),
      `github-download-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    );

    // Use GitHub API to get the archive
    const archiveUrl = `https://api.github.com/repos/${owner}/${repo}/zipball/${branch}`;

    // Download and extract the repository
    exec(
      `curl -L "${archiveUrl}" -o "${tempDir}.zip"`,
      (err, stdout, stderr) => {
        if (err) {
          console.error("Download error:", stderr);
          return res.status(500).json({ error: "Download failed: " + stderr });
        }

        // Extract the zip file
        exec(
          `unzip -q "${tempDir}.zip" -d "${tempDir}"`,
          (err, stdout, stderr) => {
            if (err) {
              console.error("Extract error:", stderr);
              return res
                .status(500)
                .json({ error: "Extract failed: " + stderr });
            }

            // Find the extracted folder (GitHub archives include a top-level folder with repo info)
            const extractedDirs = fs
              .readdirSync(tempDir, { withFileTypes: true })
              .filter((dirent) => dirent.isDirectory());

            if (extractedDirs.length === 0) {
              return res
                .status(500)
                .json({ error: "No directories found in archive" });
            }

            // The first directory is the one we want (GitHub archive format)
            const extractedRepoDir = path.join(tempDir, extractedDirs[0].name);
            const sourcePath = path.join(extractedRepoDir, folderPath);

            if (!fs.existsSync(sourcePath)) {
              return res.status(500).json({
                error: `Path does not exist in repository: ${folderPath}`,
              });
            }

            // Copy the specific folder to the skill directory
            fs.cpSync(sourcePath, skillDir, { recursive: true });

            // Clean up temp files
            fs.rmSync(`${tempDir}.zip`);
            fs.rmSync(tempDir, { recursive: true, force: true });

            res.json({ success: true, name: cleanName });
          },
        );
      },
    );
  } else {
    // Handle regular git repository URL
    // Extract name provided or from repo
    let cleanName = name || path.basename(url, ".git");
    cleanName = cleanName.replace(/[^a-zA-Z0-9_\-\.]/g, "_");

    const skillDir = path.join(SKILLS_PATH, cleanName);
    if (fs.existsSync(skillDir)) {
      console.log(`DEBUG: Skill directory already exists: ${skillDir}`);
      return res
        .status(409)
        .json({ error: `Skill "${cleanName}" already exists` });
    }

    // Clone
    console.log(`DEBUG: Cloning ${url} to ${skillDir}`);
    exec(`git clone "${url}" "${skillDir}"`, (err, stdout, stderr) => {
      if (err) {
        console.error("Git clone error:", stderr);
        return res.status(500).json({ error: "Git clone failed: " + stderr });
      }
      console.log(`DEBUG: Clone successful. stdout: ${stdout}`);
      // Remove .git folder
      fs.rmSync(path.join(skillDir, ".git"), { recursive: true, force: true });

      res.json({ success: true, name: cleanName });
    });
  }
});

// POST /api/skills/import/skillssh – import from Skills.sh
app.post("/api/skills/import/skillssh", async (req, res) => {
  let { skillPath } = req.body;
  console.log(`DEBUG: Skills.sh import request (raw): skillPath=${skillPath}`);
  if (!skillPath)
    return res.status(400).json({ error: "Skill path is required" });

  // Clean up the URL - handle duplicates from browser autofill
  skillPath = skillPath.trim();

  // If URL appears multiple times, take only the first occurrence
  if (skillPath.includes("https://skills.sh/")) {
    const matches = skillPath.match(/https:\/\/skills\.sh\/[^\s]+/g);
    if (matches && matches.length > 0) {
      skillPath = matches[0].replace(/\/+$/, "");
    }
  }

  console.log(
    `DEBUG: Skills.sh import request (cleaned): skillPath=${skillPath}`,
  );

  const tempDir = path.join(
    os.tmpdir(),
    `skillssh-download-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  );
  fs.mkdirSync(tempDir, { recursive: true });

  // Build the npx skills add command
  let npxCommand;
  if (skillPath.match(/^https?:\/\/skills\.sh\//)) {
    // Extract owner/repo/skill from skills.sh URL
    const urlParts = skillPath
      .replace(/^https?:\/\/skills\.sh\//, "")
      .split("/")
      .filter(Boolean);
    if (urlParts.length >= 2) {
      const ownerRepo = `${urlParts[0]}/${urlParts[1]}`;
      npxCommand = `npx skills add https://github.com/${ownerRepo}${urlParts.length >= 3 ? ` --skill ${urlParts.slice(2).join("/")}` : ""} --all`;
    } else {
      fs.rmSync(tempDir, { recursive: true, force: true });
      return res.status(400).json({ error: "Invalid skills.sh URL format" });
    }
  } else if (skillPath.match(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/)) {
    // Direct owner/repo format
    const parts = skillPath.split("/").filter(Boolean);
    npxCommand = `npx skills add https://github.com/${parts[0]}/${parts[1]}${parts.length > 2 ? ` --skill ${parts.slice(2).join("/")}` : ""} --all`;
  } else {
    fs.rmSync(tempDir, { recursive: true, force: true });
    return res.status(400).json({
      error: "Invalid skill path format. Use skills.sh URL or owner/repo",
    });
  }

  console.log(
    `DEBUG: Running: cd "${tempDir}" && DISABLE_TELEMETRY=1 ${npxCommand} 2>&1`,
  );

  exec(
    `cd "${tempDir}" && DISABLE_TELEMETRY=1 ${npxCommand} 2>&1`,
    { timeout: 180000 },
    (err, stdout, stderr) => {
      console.log(`DEBUG: npx skills output:\n${stdout}`);

      // Check for .agents/skills directory where skills CLI installs
      const skillsDir = path.join(tempDir, ".agents", "skills");

      if (!fs.existsSync(skillsDir)) {
        // Try other common locations
        const altDirs = [
          path.join(tempDir, ".skills"),
          path.join(tempDir, ".claude", "skills"),
        ];

        for (const altDir of altDirs) {
          if (fs.existsSync(altDir)) {
            console.log(
              `DEBUG: Found skills at alternative location: ${altDir}`,
            );
            break;
          }
        }

        if (!fs.existsSync(skillsDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
          const errorMsg = stdout.includes("No valid skills found")
            ? "No valid skills found. The package may not contain properly formatted skills."
            : `Failed to install skills: ${err?.message || "Unknown error"}`;
          return res.status(500).json({ error: errorMsg });
        }
      }

      // Get all installed skills
      const skillDirs = fs
        .readdirSync(skillsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);

      console.log(`DEBUG: Installed skills: ${skillDirs.join(", ")}`);

      if (skillDirs.length === 0) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        return res.status(500).json({ error: "No skills were installed" });
      }

      const importedSkills = [];
      for (const skillName of skillDirs) {
        const sourceDir = path.join(skillsDir, skillName);
        const destDir = path.join(SKILLS_PATH, skillName);

        if (fs.existsSync(destDir)) {
          console.log(`DEBUG: Skill "${skillName}" already exists, skipping`);
          continue;
        }

        fs.cpSync(sourceDir, destDir, { recursive: true });
        importedSkills.push(skillName);
        console.log(`DEBUG: Imported skill: ${skillName}`);
      }

      fs.rmSync(tempDir, { recursive: true, force: true });

      if (importedSkills.length === 0) {
        return res
          .status(409)
          .json({ error: "All skills already exist in library" });
      }

      res.json({
        success: true,
        name: importedSkills[0],
        skills: importedSkills,
        message:
          importedSkills.length > 1
            ? `Imported ${importedSkills.length} skills: ${importedSkills.join(", ")}`
            : `Imported skill: ${importedSkills[0]}`,
      });
    },
  );
});

// GET /api/ai-settings – get saved AI settings
app.get("/api/ai-settings", (req, res) => {
  const settings = loadAISettings();
  // Return masked API key for display
  const maskedKey = settings.apiKey && settings.apiKey.length > 8 
    ? settings.apiKey.slice(0, -8) + "********" 
    : "";
  res.json({
    url: settings.url || "https://openrouter.ai/api/v1/chat/completions",
    model: settings.model || "openrouter/free",
    hasApiKey: !!settings.apiKey,
    maskedApiKey: maskedKey,
  });
});

// POST /api/ai-settings – save AI settings
app.post("/api/ai-settings", (req, res) => {
  const { url, model, apiKey } = req.body;
  
  if (!url || !model) {
    return res.status(400).json({ error: "URL and model are required" });
  }
  
  // If apiKey is empty or masked, keep the existing one
  const currentSettings = loadAISettings();
  let finalApiKey = apiKey;
  if (!apiKey || apiKey.endsWith("********")) {
    finalApiKey = currentSettings.apiKey;
  }
  
  saveAISettings({ url, model, apiKey: finalApiKey });
  res.json({ success: true });
});

// POST /api/skills/generate-description – generate description.md using AI
app.post("/api/skills/generate-description", async (req, res) => {
  const { skillName, aiUrl, model, apiKey } = req.body;

  console.log(`DEBUG: Generate description request for skill: ${skillName}`);

  // Use saved API key if not provided
  const savedSettings = loadAISettings();
  const finalApiKey = apiKey || savedSettings.apiKey;

  if (!skillName || !aiUrl || !model || !finalApiKey) {
    return res.status(400).json({ error: "Missing required parameters. Save API key first or provide it." });
  }

  const skillDir = path.join(SKILLS_PATH, skillName);
  if (!fs.existsSync(skillDir)) {
    console.log(`DEBUG: Skill not found at: ${skillDir}`);
    return res.status(404).json({ error: "Skill not found" });
  }

  try {
    const files = [];
    const priorityFiles = ["skill.md", "agents.md", "SKILL.md", "AGENTS.md"];
    const addedFiles = new Set();

    const collectFiles = (dir, baseDir = "") => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const priorityFile of priorityFiles) {
        const filePath = path.join(dir, priorityFile);
        const relPath = baseDir ? `${baseDir}/${priorityFile}` : priorityFile;
        if (fs.existsSync(filePath) && !addedFiles.has(relPath.toLowerCase())) {
          try {
            const content = fs.readFileSync(filePath, "utf-8");
            files.unshift({ path: relPath, content });
            addedFiles.add(relPath.toLowerCase());
          } catch (e) {}
        }
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = baseDir ? `${baseDir}/${entry.name}` : entry.name;

        if (
          entry.isDirectory() &&
          !entry.name.startsWith(".") &&
          entry.name !== "node_modules"
        ) {
          collectFiles(fullPath, relativePath);
        } else if (
          entry.isFile() &&
          !addedFiles.has(relativePath.toLowerCase())
        ) {
          const isPriority = priorityFiles
            .map((f) => f.toLowerCase())
            .includes(entry.name.toLowerCase());
          if (!isPriority) {
            try {
              const content = fs.readFileSync(fullPath, "utf-8");
              if (content.length < 50000 && !content.includes("\x00")) {
                files.push({
                  path: relativePath,
                  content: content.slice(0, 10000),
                });
                addedFiles.add(relativePath.toLowerCase());
              }
            } catch (e) {}
          }
        }
      }
    };

    collectFiles(skillDir);

    console.log(`DEBUG: Collected ${files.length} files for context`);

    let contextText = "";
    const maxContext = 50000;
    for (const file of files) {
      const addition = `\n--- ${file.path} ---\n${file.content}\n`;
      if (contextText.length + addition.length > maxContext) break;
      contextText += addition;
    }

    if (!contextText) {
      return res
        .status(400)
        .json({ error: "No readable files found in skill" });
    }

    const prompt = `Generate short (max 30 words) description for what is this skill for and when it should be used, so that AI agent could understand if he needs to use it by reading description. Output only pure description text. Never mention that this is Claude skill, even if it is written like that. You are not allowed to output any additional text.

Skill files:
${contextText}`;

    const requestBody = {
      model: model,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that generates skill documentation. Respond with only markdown content.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 2000,
      temperature: 0.7,
    };

    console.log(`DEBUG: Calling AI API: ${aiUrl} with model: ${model}`);

    const fetchResponse = await fetch(aiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${finalApiKey}`,
        "HTTP-Referer": "https://contextmanager.local",
        "X-Title": "Context Manager",
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await fetchResponse.text();
    console.log(`DEBUG: AI API response status: ${fetchResponse.status}`);

    if (!fetchResponse.ok) {
      console.error(`DEBUG: AI API error response: ${responseText}`);
      return res.status(500).json({
        error: `AI API error: ${fetchResponse.status} - ${responseText.slice(0, 200)}`,
      });
    }

    const aiResponse = JSON.parse(responseText);
    const description = aiResponse.choices?.[0]?.message?.content;

    if (!description) {
      console.error(`DEBUG: No content in AI response:`, aiResponse);
      return res.status(500).json({
        error: "Failed to generate description - no content returned",
      });
    }

    const descPath = path.join(skillDir, "description.md");
    fs.writeFileSync(descPath, description, "utf-8");

    console.log(`DEBUG: Description saved to: ${descPath}`);
    res.json({ success: true, description });
  } catch (e) {
    console.error("Generate description error:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/workflows/generate-description – generate description.md using AI
app.post("/api/workflows/generate-description", async (req, res) => {
  const { workflowName, aiUrl, model, apiKey } = req.body;

  console.log(`DEBUG: Generate description request for workflow: ${workflowName}`);

  // Use saved API key if not provided
  const savedSettings = loadAISettings();
  const finalApiKey = apiKey || savedSettings.apiKey;

  if (!workflowName || !aiUrl || !model || !finalApiKey) {
    return res.status(400).json({ error: "Missing required parameters. Save API key first or provide it." });
  }

  const workflowDir = path.join(WORKFLOWS_PATH, workflowName);
  if (!fs.existsSync(workflowDir)) {
    console.log(`DEBUG: Workflow not found at: ${workflowDir}`);
    return res.status(404).json({ error: "Workflow not found" });
  }

  try {
    const files = [];
    const priorityFiles = ["workflow.md", "skill.md", "WORKFLOW.md", "SKILL.md"];
    const addedFiles = new Set();

    const collectFiles = (dir, baseDir = "") => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const priorityFile of priorityFiles) {
        const filePath = path.join(dir, priorityFile);
        const relPath = baseDir ? `${baseDir}/${priorityFile}` : priorityFile;
        if (fs.existsSync(filePath) && !addedFiles.has(relPath.toLowerCase())) {
          try {
            const content = fs.readFileSync(filePath, "utf-8");
            files.unshift({ path: relPath, content });
            addedFiles.add(relPath.toLowerCase());
          } catch (e) {}
        }
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = baseDir ? `${baseDir}/${entry.name}` : entry.name;

        if (
          entry.isDirectory() &&
          !entry.name.startsWith(".") &&
          entry.name !== "node_modules"
        ) {
          collectFiles(fullPath, relativePath);
        } else if (
          entry.isFile() &&
          !addedFiles.has(relativePath.toLowerCase())
        ) {
          const isPriority = priorityFiles
            .map((f) => f.toLowerCase())
            .includes(entry.name.toLowerCase());
          if (!isPriority) {
            try {
              const content = fs.readFileSync(fullPath, "utf-8");
              if (content.length < 50000 && !content.includes("\x00")) {
                files.push({
                  path: relativePath,
                  content: content.slice(0, 10000),
                });
                addedFiles.add(relativePath.toLowerCase());
              }
            } catch (e) {}
          }
        }
      }
    };

    collectFiles(workflowDir);

    console.log(`DEBUG: Collected ${files.length} files for context`);

    let contextText = "";
    const maxContext = 50000;
    for (const file of files) {
      const addition = `\n--- ${file.path} ---\n${file.content}\n`;
      if (contextText.length + addition.length > maxContext) break;
      contextText += addition;
    }

    if (!contextText) {
      return res
        .status(400)
        .json({ error: "No readable files found in workflow" });
    }

    const prompt = `Generate short (max 30 words) description for what is this workflow for and when it should be used, so that AI agent could understand if he needs to use it by reading description. Output only pure description text. Never mention that this is Claude workflow, even if it is written like that. You are not allowed to output any additional text.

Workflow files:
${contextText}`;

    const requestBody = {
      model: model,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that generates workflow documentation. Respond with only markdown content.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 2000,
      temperature: 0.7,
    };

    console.log(`DEBUG: Calling AI API: ${aiUrl} with model: ${model}`);

    const fetchResponse = await fetch(aiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${finalApiKey}`,
        "HTTP-Referer": "https://contextmanager.local",
        "X-Title": "Context Manager",
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await fetchResponse.text();
    console.log(`DEBUG: AI API response status: ${fetchResponse.status}`);

    if (!fetchResponse.ok) {
      console.error(`DEBUG: AI API error response: ${responseText}`);
      return res.status(500).json({
        error: `AI API error: ${fetchResponse.status} - ${responseText.slice(0, 200)}`,
      });
    }

    const aiResponse = JSON.parse(responseText);
    const description = aiResponse.choices?.[0]?.message?.content;

    if (!description) {
      console.error(`DEBUG: No content in AI response:`, aiResponse);
      return res.status(500).json({
        error: "Failed to generate description - no content returned",
      });
    }

    const descPath = path.join(workflowDir, "description.md");
    fs.writeFileSync(descPath, description, "utf-8");

    console.log(`DEBUG: Description saved to: ${descPath}`);
    res.json({ success: true, description });
  } catch (e) {
    console.error("Generate description error:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/skills/import/files – upload folder contents
app.post("/api/skills/import/files", upload.array("files"), (req, res) => {
  console.log(
    `DEBUG: File import request. Body keys: ${Object.keys(req.body)}`,
  );

  const { skillName } = req.body; // paths is JSON string array
  let filePaths = [];
  try {
    filePaths = JSON.parse(req.body.paths || "[]");
  } catch (e) {
    console.error(`DEBUG: Failed to parse paths: ${req.body.paths}`, e);
  }

  console.log(
    `DEBUG: Importing skill "${skillName}". Files: ${req.files?.length}, Paths: ${filePaths.length}`,
  );

  if (!skillName || !req.files || req.files.length === 0) {
    console.log("DEBUG: Missing skillName or files");
    return res.status(400).json({ error: "Missing skill name or files" });
  }

  const cleanName = skillName.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
  const skillDir = path.join(SKILLS_PATH, cleanName);

  if (fs.existsSync(skillDir)) {
    // Allow overwriting/merging? For now, if "new skill", check conflict. If generic import, maybe merge.
    // Let's assume this is "Create new skill from folder".
    return res
      .status(409)
      .json({ error: `Skill "${cleanName}" already exists` });
  }

  fs.mkdirSync(skillDir, { recursive: true });

  try {
    req.files.forEach((file, index) => {
      // Use provided relative path or fallback to originalname
      const relativePath = (filePaths[index] || file.originalname).replace(
        /^\//,
        "",
      ); // remove leading slash
      const destPath = path.join(skillDir, relativePath);

      console.log(
        `DEBUG: Processing file ${index}: tmp=${file.path}, dest=${destPath}`,
      );

      // Security check
      if (!path.resolve(destPath).startsWith(path.resolve(skillDir))) {
        console.warn(`DEBUG: Path traversal detected: ${destPath}`);
        return res.status(403).json({ error: "Invalid path" });
      }

      const parentDir = path.dirname(destPath);
      if (!fs.existsSync(parentDir))
        fs.mkdirSync(parentDir, { recursive: true });

      // Move file (handle cross-device EXDEV)
      try {
        fs.renameSync(file.path, destPath);
      } catch (e) {
        if (e.code === "EXDEV") {
          console.log(
            `DEBUG: EXDEV detected for ${file.path} -> ${destPath}. Using copy+unlink.`,
          );
          fs.copyFileSync(file.path, destPath);
          fs.unlinkSync(file.path);
        } else {
          console.error(`DEBUG: Rename failed for ${file.path}:`, e);
          throw e;
        }
      }
    });

    console.log(`DEBUG: Import successful for ${cleanName}`);
    res.json({ success: true, name: cleanName });
  } catch (error) {
    console.error(`DEBUG: Error during file import:`, error);
    res.status(500).json({ error: "File import failed: " + error.message });
  }
});

// ──────────────────────── LIBRARY WORKFLOW ENDPOINTS ────────────────────────

// GET /api/workflows – list all library workflows
app.get("/api/workflows", (req, res) => {
  if (!fs.existsSync(WORKFLOWS_PATH)) return res.json([]);

  const entries = fs.readdirSync(WORKFLOWS_PATH, { withFileTypes: true });
  const workflows = entries
    .filter((e) => e.isDirectory())
    .map((e) => {
      const workflowPath = path.join(WORKFLOWS_PATH, e.name);
      const descPath = path.join(workflowPath, "description.md");
      let description = "";
      const hasDescription = fs.existsSync(descPath);

      if (hasDescription) {
        try {
          description = fs.readFileSync(descPath, "utf-8").trim();
        } catch (_) {}
      }

      const stats = fs.statSync(workflowPath);
      const created = stats.birthtime;
      const modified = stats.mtime;
      const tokens = calculateTokensRecursive(workflowPath);

      return {
        name: e.name,
        description,
        tokens,
        hasDescription,
        created,
        modified,
      };
    });

  res.json(workflows);
});

// GET /api/workflows/:name/files – list files in a workflow
app.get("/api/workflows/:name/files", (req, res) => {
  const workflowDir = path.join(WORKFLOWS_PATH, req.params.name);
  if (!fs.existsSync(workflowDir))
    return res.status(404).json({ error: "Workflow not found" });
  res.json(listFilesRecursive(workflowDir, workflowDir));
});

// GET /api/workflows/:name/file/* – read a specific workflow file
app.get("/api/workflows/:name/file/*", (req, res) => {
  const relativePath = req.params[0];
  const filePath = path.join(WORKFLOWS_PATH, req.params.name, relativePath);

  const workflowDir = path.join(WORKFLOWS_PATH, req.params.name);
  if (!path.resolve(filePath).startsWith(path.resolve(workflowDir))) {
    return res.status(403).json({ error: "Invalid path" });
  }

  if (!fs.existsSync(filePath))
    return res.status(404).json({ error: "File not found" });

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    res.json({ path: relativePath, content });
  } catch (e) {
    res.status(500).json({ error: "Error reading file" });
  }
});

// PUT /api/workflows/:name/file/* – write/update a workflow file
app.put("/api/workflows/:name/file/*", (req, res) => {
  const relativePath = req.params[0];
  const filePath = path.join(WORKFLOWS_PATH, req.params.name, relativePath);

  const workflowDir = path.join(WORKFLOWS_PATH, req.params.name);
  if (!path.resolve(filePath).startsWith(path.resolve(workflowDir))) {
    return res.status(403).json({ error: "Invalid path" });
  }

  const parentDir = path.dirname(filePath);
  fs.mkdirSync(parentDir, { recursive: true });

  try {
    fs.writeFileSync(filePath, req.body.content || "", "utf-8");
    res.json({ success: true, path: relativePath });
  } catch (e) {
    res.status(500).json({ error: "Error writing file" });
  }
});

// DELETE /api/workflows/:name/file/* – delete a workflow file
app.delete("/api/workflows/:name/file/*", (req, res) => {
  const relativePath = req.params[0];
  const filePath = path.join(WORKFLOWS_PATH, req.params.name, relativePath);

  const workflowDir = path.join(WORKFLOWS_PATH, req.params.name);
  if (!path.resolve(filePath).startsWith(path.resolve(workflowDir))) {
    return res.status(403).json({ error: "Invalid path" });
  }

  if (!fs.existsSync(filePath))
    return res.status(404).json({ error: "File not found" });

  try {
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(filePath);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Error deleting file" });
  }
});

// POST /api/workflows – create a new workflow folder
app.post("/api/workflows", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });

  const workflowDir = path.join(WORKFLOWS_PATH, name);
  if (fs.existsSync(workflowDir))
    return res.status(409).json({ error: "Workflow already exists" });

  fs.mkdirSync(workflowDir, { recursive: true });
  // Create default files
  fs.writeFileSync(
    path.join(workflowDir, "description.md"),
    `# ${name}\n\nDescription of the ${name} workflow.`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(workflowDir, "workflow.md"),
    `# ${name}\n\nMain workflow instructions go here.`,
    "utf-8",
  );

  res.status(201).json({
    name,
    description: `# ${name}\n\nDescription of the ${name} workflow.`,
  });
});

// DELETE /api/workflows/:name – delete a workflow
app.delete("/api/workflows/:name", (req, res) => {
  const workflowDir = path.join(WORKFLOWS_PATH, req.params.name);
  if (!fs.existsSync(workflowDir))
    return res.status(404).json({ error: "Workflow not found" });

  fs.rmSync(workflowDir, { recursive: true, force: true });
  res.json({ success: true });
});

// POST /api/workflows/import/github – import from GitHub
app.post("/api/workflows/import/github", (req, res) => {
  const { url, name } = req.body;
  console.log(
    `DEBUG: GitHub import request for workflow: URL=${url}, Name=${name}`,
  );
  if (!url) return res.status(400).json({ error: "URL is required" });

  // Check if URL is a GitHub tree URL (specific folder in repo)
  const githubTreeRegex =
    /^https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)\/(.+)$/;
  const match = url.match(githubTreeRegex);

  if (match) {
    // Handle GitHub tree URL
    const [, owner, repo, branch, folderPath] = match;
    let cleanName = name || path.basename(folderPath);
    cleanName = cleanName.replace(/[^a-zA-Z0-9_\-\.]/g, "_");

    const workflowDir = path.join(WORKFLOWS_PATH, cleanName);
    if (fs.existsSync(workflowDir)) {
      console.log(`DEBUG: Workflow directory already exists: ${workflowDir}`);
      return res
        .status(409)
        .json({ error: `Workflow "${cleanName}" already exists` });
    }

    const tempDir = path.join(
      os.tmpdir(),
      `github-download-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    );

    const archiveUrl = `https://api.github.com/repos/${owner}/${repo}/zipball/${branch}`;

    exec(
      `curl -L "${archiveUrl}" -o "${tempDir}.zip"`,
      (err, stdout, stderr) => {
        if (err) {
          console.error("Download error:", stderr);
          return res.status(500).json({ error: "Download failed: " + stderr });
        }

        exec(
          `unzip -q "${tempDir}.zip" -d "${tempDir}"`,
          (err, stdout, stderr) => {
            if (err) {
              console.error("Extract error:", stderr);
              return res
                .status(500)
                .json({ error: "Extract failed: " + stderr });
            }

            const extractedDirs = fs
              .readdirSync(tempDir, { withFileTypes: true })
              .filter((dirent) => dirent.isDirectory());

            if (extractedDirs.length === 0) {
              return res
                .status(500)
                .json({ error: "No directories found in archive" });
            }

            const extractedRepoDir = path.join(tempDir, extractedDirs[0].name);
            const sourcePath = path.join(extractedRepoDir, folderPath);

            if (!fs.existsSync(sourcePath)) {
              return res.status(500).json({
                error: `Path does not exist in repository: ${folderPath}`,
              });
            }

            fs.cpSync(sourcePath, workflowDir, { recursive: true });

            fs.rmSync(`${tempDir}.zip`);
            fs.rmSync(tempDir, { recursive: true, force: true });

            res.json({ success: true, name: cleanName });
          },
        );
      },
    );
  } else {
    // Handle regular git repository URL
    let cleanName = name || path.basename(url, ".git");
    cleanName = cleanName.replace(/[^a-zA-Z0-9_\-\.]/g, "_");

    const workflowDir = path.join(WORKFLOWS_PATH, cleanName);
    if (fs.existsSync(workflowDir)) {
      console.log(`DEBUG: Workflow directory already exists: ${workflowDir}`);
      return res
        .status(409)
        .json({ error: `Workflow "${cleanName}" already exists` });
    }

    console.log(`DEBUG: Cloning ${url} to ${workflowDir}`);
    exec(`git clone "${url}" "${workflowDir}"`, (err, stdout, stderr) => {
      if (err) {
        console.error("Git clone error:", stderr);
        return res.status(500).json({ error: "Git clone failed: " + stderr });
      }
      console.log(`DEBUG: Clone successful. stdout: ${stdout}`);
      fs.rmSync(path.join(workflowDir, ".git"), {
        recursive: true,
        force: true,
      });

      res.json({ success: true, name: cleanName });
    });
  }
});

// POST /api/workflows/import/files – upload folder contents
app.post("/api/workflows/import/files", upload.array("files"), (req, res) => {
  console.log(
    `DEBUG: Workflow file import request. Body keys: ${Object.keys(req.body)}`,
  );

  const { workflowName } = req.body;
  let filePaths = [];
  try {
    filePaths = JSON.parse(req.body.paths || "[]");
  } catch (e) {
    console.error(`DEBUG: Failed to parse paths: ${req.body.paths}`, e);
  }

  console.log(
    `DEBUG: Importing workflow "${workflowName}". Files: ${req.files?.length}, Paths: ${filePaths.length}`,
  );

  if (!workflowName || !req.files || req.files.length === 0) {
    console.log("DEBUG: Missing workflowName or files");
    return res.status(400).json({ error: "Missing workflow name or files" });
  }

  const cleanName = workflowName.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
  const workflowDir = path.join(WORKFLOWS_PATH, cleanName);

  if (fs.existsSync(workflowDir)) {
    return res
      .status(409)
      .json({ error: `Workflow "${cleanName}" already exists` });
  }

  fs.mkdirSync(workflowDir, { recursive: true });

  try {
    req.files.forEach((file, index) => {
      const relativePath = (filePaths[index] || file.originalname).replace(
        /^\//,
        "",
      );
      const destPath = path.join(workflowDir, relativePath);

      console.log(
        `DEBUG: Processing file ${index}: tmp=${file.path}, dest=${destPath}`,
      );

      if (!path.resolve(destPath).startsWith(path.resolve(workflowDir))) {
        console.warn(`DEBUG: Path traversal detected: ${destPath}`);
        return res.status(403).json({ error: "Invalid path" });
      }

      const parentDir = path.dirname(destPath);
      if (!fs.existsSync(parentDir))
        fs.mkdirSync(parentDir, { recursive: true });

      try {
        fs.renameSync(file.path, destPath);
      } catch (e) {
        if (e.code === "EXDEV") {
          console.log(
            `DEBUG: EXDEV detected for ${file.path} -> ${destPath}. Using copy+unlink.`,
          );
          fs.copyFileSync(file.path, destPath);
          fs.unlinkSync(file.path);
        } else {
          console.error(`DEBUG: Rename failed for ${file.path}:`, e);
          throw e;
        }
      }
    });

    console.log(`DEBUG: Import successful for ${cleanName}`);
    res.json({ success: true, name: cleanName });
  } catch (error) {
    console.error(`DEBUG: Error during file import:`, error);
    res.status(500).json({ error: "File import failed: " + error.message });
  }
});

// ──────────────────── CONTEXT SKILL FILE ENDPOINTS ────────────────────

// GET /api/contexts/:contextName/skills/:skillName/files
app.get("/api/contexts/:contextName/skills/:skillName/files", (req, res) => {
  const config = loadConfig();
  const context = config.context_cells.find(
    (c) => c.name === req.params.contextName,
  );
  if (!context) return res.status(404).json({ error: "Context not found" });

  const skillDir = path.join(
    CONTEXTS_PATH,
    context.folder,
    req.params.skillName,
  );
  if (!fs.existsSync(skillDir))
    return res.status(404).json({ error: "Skill not found" });
  res.json(listFilesRecursive(skillDir, skillDir));
});

// GET /api/contexts/:contextName/skills/:skillName/file/*
app.get("/api/contexts/:contextName/skills/:skillName/file/*", (req, res) => {
  const config = loadConfig();
  const context = config.context_cells.find(
    (c) => c.name === req.params.contextName,
  );
  if (!context) return res.status(404).json({ error: "Context not found" });

  const relativePath = req.params[0];
  const filePath = path.join(
    CONTEXTS_PATH,
    context.folder,
    req.params.skillName,
    relativePath,
  );
  const skillDir = path.join(
    CONTEXTS_PATH,
    context.folder,
    req.params.skillName,
  );

  if (!path.resolve(filePath).startsWith(path.resolve(skillDir))) {
    return res.status(403).json({ error: "Invalid path" });
  }
  if (!fs.existsSync(filePath))
    return res.status(404).json({ error: "File not found" });

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    res.json({ path: relativePath, content });
  } catch (e) {
    res.status(500).json({ error: "Error reading file" });
  }
});

// PUT /api/contexts/:contextName/skills/:skillName/file/*
app.put("/api/contexts/:contextName/skills/:skillName/file/*", (req, res) => {
  const config = loadConfig();
  const context = config.context_cells.find(
    (c) => c.name === req.params.contextName,
  );
  if (!context) return res.status(404).json({ error: "Context not found" });

  const relativePath = req.params[0];
  const filePath = path.join(
    CONTEXTS_PATH,
    context.folder,
    req.params.skillName,
    relativePath,
  );
  const skillDir = path.join(
    CONTEXTS_PATH,
    context.folder,
    req.params.skillName,
  );

  if (!path.resolve(filePath).startsWith(path.resolve(skillDir))) {
    return res.status(403).json({ error: "Invalid path" });
  }

  const parentDir = path.dirname(filePath);
  fs.mkdirSync(parentDir, { recursive: true });

  try {
    fs.writeFileSync(filePath, req.body.content || "", "utf-8");
    res.json({ success: true, path: relativePath });
  } catch (e) {
    res.status(500).json({ error: "Error writing file" });
  }
});

// DELETE /api/contexts/:contextName/skills/:skillName/file/*
app.delete(
  "/api/contexts/:contextName/skills/:skillName/file/*",
  (req, res) => {
    const config = loadConfig();
    const context = config.context_cells.find(
      (c) => c.name === req.params.contextName,
    );
    if (!context) return res.status(404).json({ error: "Context not found" });

    const relativePath = req.params[0];
    const filePath = path.join(
      CONTEXTS_PATH,
      context.folder,
      req.params.skillName,
      relativePath,
    );
    const skillDir = path.join(
      CONTEXTS_PATH,
      context.folder,
      req.params.skillName,
    );

    if (!path.resolve(filePath).startsWith(path.resolve(skillDir))) {
      return res.status(403).json({ error: "Invalid path" });
    }
    if (!fs.existsSync(filePath))
      return res.status(404).json({ error: "File not found" });

    try {
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Error deleting file" });
    }
  },
);

// POST /api/contexts/:contextName/skills – create a new skill in context
app.post("/api/contexts/:contextName/skills", (req, res) => {
  const config = loadConfig();
  const context = config.context_cells.find(
    (c) => c.name === req.params.contextName,
  );
  if (!context) return res.status(404).json({ error: "Context not found" });

  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });

  const skillDir = path.join(CONTEXTS_PATH, context.folder, name);
  if (fs.existsSync(skillDir))
    return res.status(409).json({ error: "Skill already exists" });

  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "description.md"),
    `# ${name}\n\nDescription of the ${name} skill.`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(skillDir, "skill.md"),
    `# ${name}\n\nMain skill instructions go here.`,
    "utf-8",
  );

  // Add toggle state
  if (!context.skills) context.skills = {};
  context.skills[name] = { enabled: true, mode: "always_loaded" };
  saveConfig(config);

  res.status(201).json({ name, enabled: true, mode: "always_loaded" });
});

// DELETE /api/contexts/:contextName/skills/:skillName
app.delete("/api/contexts/:contextName/skills/:skillName", (req, res) => {
  const config = loadConfig();
  const context = config.context_cells.find(
    (c) => c.name === req.params.contextName,
  );
  if (!context) return res.status(404).json({ error: "Context not found" });

  const skillDir = path.join(
    CONTEXTS_PATH,
    context.folder,
    req.params.skillName,
  );
  if (!fs.existsSync(skillDir))
    return res.status(404).json({ error: "Skill not found" });

  fs.rmSync(skillDir, { recursive: true, force: true });

  if (context.skills && context.skills[req.params.skillName]) {
    delete context.skills[req.params.skillName];
    saveConfig(config);
  }

  res.json({ success: true });
});

// ──────────────────── CONTEXT WORKFLOW ENDPOINTS ────────────────────

// GET /api/contexts/:contextName/workflows – list workflows in a context
app.get("/api/contexts/:contextName/workflows", (req, res) => {
  const config = loadConfig();
  const context = config.context_cells.find(
    (c) => c.name === req.params.contextName,
  );
  if (!context) return res.status(404).json({ error: "Context not found" });

  const contextDir = path.join(CONTEXTS_PATH, context.folder);
  if (!fs.existsSync(contextDir)) return res.json([]);

  // Workflows are subdirectories of the context folder
  const entries = fs.readdirSync(contextDir, { withFileTypes: true });
  const workflows = entries
    .filter((e) => e.isDirectory())
    .map((e) => {
      // Check if this directory is a workflow by looking for workflow files
      const workflowPath = path.join(contextDir, e.name);
      const workflowFiles = fs.readdirSync(workflowPath);
      const isWorkflow = workflowFiles.some(
        (file) =>
          file === "workflow.json" ||
          file === "workflow.yaml" ||
          file === "workflow.yml" ||
          file === "workflow.md",
      );

      // Only process as workflow if it's identified as a workflow and is in the workflows config
      if (
        !isWorkflow ||
        !(context.workflows && context.workflows.hasOwnProperty(e.name))
      ) {
        return null; // Not a workflow in this context, skip
      }

      const workflowToggle = context.workflows[e.name] || {
        enabled: true,
        mode: "always_loaded",
      };
      // Read description.md if exists
      const descPath = path.join(contextDir, e.name, "description.md");
      let description = "";
      const hasDescription = fs.existsSync(descPath);
      if (hasDescription) {
        try {
          description = fs.readFileSync(descPath, "utf-8").trim();
        } catch (_) {}
      }

      // Calculate tokens
      const tokens = calculateTokensRecursive(workflowPath);

      return {
        name: e.name,
        description,
        enabled:
          workflowToggle.enabled !== undefined ? workflowToggle.enabled : true,
        mode: workflowToggle.mode || "always_loaded",
        tokens,
        hasDescription,
      };
    })
    .filter(Boolean); // Remove null values

  res.json(workflows);
});

// PATCH /api/contexts/:contextName/workflows/:workflowName/toggle
app.patch(
  "/api/contexts/:contextName/workflows/:workflowName/toggle",
  (req, res) => {
    const config = loadConfig();
    const context = config.context_cells.find(
      (c) => c.name === req.params.contextName,
    );
    if (!context) return res.status(404).json({ error: "Context not found" });

    if (!context.workflows) context.workflows = {};
    if (!context.workflows[req.params.workflowName]) {
      context.workflows[req.params.workflowName] = {
        enabled: true,
        mode: "always_loaded",
      };
    }

    const workflow = context.workflows[req.params.workflowName];
    if (req.body.enabled !== undefined) workflow.enabled = req.body.enabled;
    if (req.body.mode !== undefined) workflow.mode = req.body.mode;

    saveConfig(config);
    res.json(workflow);
  },
);

// GET /api/contexts/:contextName/workflows/:workflowName/files
app.get(
  "/api/contexts/:contextName/workflows/:workflowName/files",
  (req, res) => {
    const config = loadConfig();
    const context = config.context_cells.find(
      (c) => c.name === req.params.contextName,
    );
    if (!context) return res.status(404).json({ error: "Context not found" });

    const workflowDir = path.join(
      CONTEXTS_PATH,
      context.folder,
      req.params.workflowName,
    );
    if (!fs.existsSync(workflowDir))
      return res.status(404).json({ error: "Workflow not found" });
    res.json(listFilesRecursive(workflowDir, workflowDir));
  },
);

// GET /api/contexts/:contextName/workflows/:workflowName/file/*
app.get(
  "/api/contexts/:contextName/workflows/:workflowName/file/*",
  (req, res) => {
    const config = loadConfig();
    const context = config.context_cells.find(
      (c) => c.name === req.params.contextName,
    );
    if (!context) return res.status(404).json({ error: "Context not found" });

    const relativePath = req.params[0];
    const filePath = path.join(
      CONTEXTS_PATH,
      context.folder,
      req.params.workflowName,
      relativePath,
    );
    const workflowDir = path.join(
      CONTEXTS_PATH,
      context.folder,
      req.params.workflowName,
    );

    if (!path.resolve(filePath).startsWith(path.resolve(workflowDir))) {
      return res.status(403).json({ error: "Invalid path" });
    }
    if (!fs.existsSync(filePath))
      return res.status(404).json({ error: "File not found" });

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      res.json({ path: relativePath, content });
    } catch (e) {
      res.status(500).json({ error: "Error reading file" });
    }
  },
);

// PUT /api/contexts/:contextName/workflows/:workflowName/file/*
app.put(
  "/api/contexts/:contextName/workflows/:workflowName/file/*",
  (req, res) => {
    const config = loadConfig();
    const context = config.context_cells.find(
      (c) => c.name === req.params.contextName,
    );
    if (!context) return res.status(404).json({ error: "Context not found" });

    const relativePath = req.params[0];
    const filePath = path.join(
      CONTEXTS_PATH,
      context.folder,
      req.params.workflowName,
      relativePath,
    );
    const workflowDir = path.join(
      CONTEXTS_PATH,
      context.folder,
      req.params.workflowName,
    );

    if (!path.resolve(filePath).startsWith(path.resolve(workflowDir))) {
      return res.status(403).json({ error: "Invalid path" });
    }

    const parentDir = path.dirname(filePath);
    fs.mkdirSync(parentDir, { recursive: true });

    try {
      fs.writeFileSync(filePath, req.body.content || "", "utf-8");
      res.json({ success: true, path: relativePath });
    } catch (e) {
      res.status(500).json({ error: "Error writing file" });
    }
  },
);

// DELETE /api/contexts/:contextName/workflows/:workflowName/file/*
app.delete(
  "/api/contexts/:contextName/workflows/:workflowName/file/*",
  (req, res) => {
    const config = loadConfig();
    const context = config.context_cells.find(
      (c) => c.name === req.params.contextName,
    );
    if (!context) return res.status(404).json({ error: "Context not found" });

    const relativePath = req.params[0];
    const filePath = path.join(
      CONTEXTS_PATH,
      context.folder,
      req.params.workflowName,
      relativePath,
    );
    const workflowDir = path.join(
      CONTEXTS_PATH,
      context.folder,
      req.params.workflowName,
    );

    if (!path.resolve(filePath).startsWith(path.resolve(workflowDir))) {
      return res.status(403).json({ error: "Invalid path" });
    }
    if (!fs.existsSync(filePath))
      return res.status(404).json({ error: "File not found" });

    try {
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Error deleting file" });
    }
  },
);

// POST /api/contexts/:contextName/workflows – create a new workflow in context
app.post("/api/contexts/:contextName/workflows", (req, res) => {
  const config = loadConfig();
  const context = config.context_cells.find(
    (c) => c.name === req.params.contextName,
  );
  if (!context) return res.status(404).json({ error: "Context not found" });

  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });

  const workflowDir = path.join(CONTEXTS_PATH, context.folder, name);
  if (fs.existsSync(workflowDir))
    return res.status(409).json({ error: "Workflow already exists" });

  fs.mkdirSync(workflowDir, { recursive: true });
  fs.writeFileSync(
    path.join(workflowDir, "description.md"),
    `# ${name}\n\nDescription of the ${name} workflow.`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(workflowDir, "workflow.md"),
    `# ${name}\n\nMain workflow instructions go here.`,
    "utf-8",
  );

  // Add toggle state
  if (!context.workflows) context.workflows = {};
  context.workflows[name] = { enabled: true, mode: "always_loaded" };
  saveConfig(config);

  res.status(201).json({ name, enabled: true, mode: "always_loaded" });
});

// DELETE /api/contexts/:contextName/workflows/:workflowName
app.delete("/api/contexts/:contextName/workflows/:workflowName", (req, res) => {
  const config = loadConfig();
  const context = config.context_cells.find(
    (c) => c.name === req.params.contextName,
  );
  if (!context) return res.status(404).json({ error: "Context not found" });

  const workflowDir = path.join(
    CONTEXTS_PATH,
    context.folder,
    req.params.workflowName,
  );
  if (!fs.existsSync(workflowDir))
    return res.status(404).json({ error: "Workflow not found" });

  fs.rmSync(workflowDir, { recursive: true, force: true });

  if (context.workflows && context.workflows[req.params.workflowName]) {
    delete context.workflows[req.params.workflowName];
    saveConfig(config);
  }

  res.json({ success: true });
});

// ──────────────────────── SETTINGS PROFILES ENDPOINTS ────────────────────────

// Ensure settings profiles directory exists
function ensureSettingsProfilesDir() {
  if (!fs.existsSync(SETTINGS_PROFILES_PATH)) {
    fs.mkdirSync(SETTINGS_PROFILES_PATH, { recursive: true });
  }
}

// GET /api/settings-profiles – list all settings profiles
app.get("/api/settings-profiles", (req, res) => {
  ensureSettingsProfilesDir();
  try {
    const files = fs.readdirSync(SETTINGS_PROFILES_PATH);
    const profiles = files
      .filter((f) => f.endsWith(".json"))
      .map((f) => ({
        name: f.replace(".json", ""),
        created: fs.statSync(path.join(SETTINGS_PROFILES_PATH, f)).mtime,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json(profiles);
  } catch (e) {
    res.status(500).json({ error: "Failed to list profiles" });
  }
});

// GET /api/settings-profiles/:name – get a specific settings profile
app.get("/api/settings-profiles/:name", (req, res) => {
  ensureSettingsProfilesDir();
  const profilePath = path.join(
    SETTINGS_PROFILES_PATH,
    `${req.params.name}.json`,
  );

  if (!fs.existsSync(profilePath)) {
    return res.status(404).json({ error: "Profile not found" });
  }

  try {
    const profile = JSON.parse(fs.readFileSync(profilePath, "utf-8"));
    res.json(profile);
  } catch (e) {
    res.status(500).json({ error: "Failed to read profile" });
  }
});

// POST /api/settings-profiles – create or update a settings profile
app.post("/api/settings-profiles", (req, res) => {
  ensureSettingsProfilesDir();
  const { name, contexts } = req.body;

  if (!name) return res.status(400).json({ error: "Name is required" });

  const profilePath = path.join(SETTINGS_PROFILES_PATH, `${name}.json`);

  const profile = {
    name,
    contexts: contexts || [],
    created_at: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2), "utf-8");
    res.status(201).json(profile);
  } catch (e) {
    res.status(500).json({ error: "Failed to save profile" });
  }
});

// DELETE /api/settings-profiles/:name – delete a settings profile
app.delete("/api/settings-profiles/:name", (req, res) => {
  ensureSettingsProfilesDir();
  const profilePath = path.join(
    SETTINGS_PROFILES_PATH,
    `${req.params.name}.json`,
  );

  if (!fs.existsSync(profilePath)) {
    return res.status(404).json({ error: "Profile not found" });
  }

  try {
    fs.unlinkSync(profilePath);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete profile" });
  }
});

// ──────────────────────── SKILLHUB ENDPOINTS ────────────────────────

// GET /api/skillhubs – list all skillhubs
app.get("/api/skillhubs", (req, res) => {
  if (!fs.existsSync(HUBS_BASE_PATH)) {
    fs.mkdirSync(HUBS_BASE_PATH, { recursive: true });
  }

  try {
    const entries = fs.readdirSync(HUBS_BASE_PATH, { withFileTypes: true });
    const hubs = entries
      .filter((e) => e.isDirectory())
      .map((e) => ({
        name: e.name,
        created: fs.statSync(path.join(HUBS_BASE_PATH, e.name)).ctime,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const masterConfig = loadMasterConfig();
    res.json({
      hubs: hubs.map((h) => h.name),
      active_hub: masterConfig.active_hub,
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to list skillhubs" });
  }
});

// POST /api/skillhubs – create a new skillhub
app.post("/api/skillhubs", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });

  // Sanitize name
  const hubName = name.replace(/[^a-zA-Z0-9_\-]/g, "_");
  const hubPath = path.join(HUBS_BASE_PATH, hubName);

  if (fs.existsSync(hubPath)) {
    return res.status(409).json({ error: "Skillhub already exists" });
  }

  try {
    // Create hub directory structure
    fs.mkdirSync(hubPath, { recursive: true });
    fs.mkdirSync(path.join(hubPath, "contexts"), { recursive: true });
    fs.mkdirSync(path.join(hubPath, "skills"), { recursive: true });
    fs.mkdirSync(path.join(hubPath, "workflows"), { recursive: true });
    fs.mkdirSync(path.join(hubPath, "settings-profiles"), { recursive: true });

    // Create default config
    const defaultConfig = {
      storage_path: hubPath,
      context_cells: [],
      settings: {
        confirm_delete: true,
        show_hidden_files: false,
        auto_expand_folders: false,
        github_token: null,
      },
    };
    fs.writeFileSync(
      path.join(hubPath, "config.json"),
      JSON.stringify(defaultConfig, null, 2),
      "utf-8",
    );

    // Update master config
    const masterConfig = loadMasterConfig();
    if (!masterConfig.hubs.includes(hubName)) {
      masterConfig.hubs.push(hubName);
      saveMasterConfig(masterConfig);
    }

    res
      .status(201)
      .json({ name: hubName, message: "Skillhub created successfully" });
  } catch (e) {
    res.status(500).json({ error: "Failed to create skillhub: " + e.message });
  }
});

// POST /api/skillhubs/switch – switch to a different skillhub
app.post("/api/skillhubs/switch", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });

  const hubPath = path.join(HUBS_BASE_PATH, name);
  if (!fs.existsSync(hubPath)) {
    return res.status(404).json({ error: "Skillhub not found" });
  }

  try {
    // Update master config
    const masterConfig = loadMasterConfig();
    masterConfig.active_hub = name;
    saveMasterConfig(masterConfig);

    // Update current paths
    updateHubPaths(name);

    res.json({
      name,
      message: `Switched to skillhub "${name}". Please refresh the page.`,
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to switch skillhub: " + e.message });
  }
});

// DELETE /api/skillhubs/:name – delete a skillhub
app.delete("/api/skillhubs/:name", (req, res) => {
  const hubName = req.params.name;
  const hubPath = path.join(HUBS_BASE_PATH, hubName);

  if (!fs.existsSync(hubPath)) {
    return res.status(404).json({ error: "Skillhub not found" });
  }

  // Don't allow deleting the last hub or the active hub
  const masterConfig = loadMasterConfig();
  if (masterConfig.active_hub === hubName) {
    return res.status(400).json({
      error: "Cannot delete the active skillhub. Switch to another hub first.",
    });
  }

  if (masterConfig.hubs.length <= 1) {
    return res.status(400).json({
      error: "Cannot delete the last skillhub. Create a new hub first.",
    });
  }

  try {
    fs.rmSync(hubPath, { recursive: true, force: true });

    // Update master config
    masterConfig.hubs = masterConfig.hubs.filter((h) => h !== hubName);
    saveMasterConfig(masterConfig);

    res.json({ success: true, message: `Skillhub "${hubName}" deleted` });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete skillhub: " + e.message });
  }
});

// ──────────────────────── MCP STATE ENDPOINT ────────────────────────

// GET /api/mcp/state – return MCP-ready state
app.get("/api/mcp/state", (req, res) => {
  const config = loadConfig();
  const state = {
    always_loaded_skills: [],
    dynamic_skills: [],
    disabled_skills: [],
    always_loaded_workflows: [],
    dynamic_workflows: [],
    disabled_workflows: [],
  };

  for (const context of config.context_cells || []) {
    if (context.enabled === false) continue;

    const contextDir = path.join(CONTEXTS_PATH, context.folder);
    if (!fs.existsSync(contextDir)) continue;

    const entries = fs.readdirSync(contextDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const itemPath = path.join(contextDir, entry.name);
      const itemFiles = fs.readdirSync(itemPath);

      // Determine if this is a workflow by checking for specific workflow files
      const isWorkflow = itemFiles.some(
        (file) =>
          file === "workflow.json" ||
          file === "workflow.yaml" ||
          file === "workflow.yml" ||
          file === "workflow.md",
      );

      // Process workflows first (higher priority)
      if (
        context.workflows &&
        context.workflows.hasOwnProperty(entry.name) &&
        isWorkflow
      ) {
        const workflowToggle = context.workflows[entry.name] || {
          enabled: true,
          mode: "always_loaded",
        };

        if (!workflowToggle.enabled) {
          state.disabled_workflows.push({
            context: context.name,
            workflow: entry.name,
          });
          continue;
        }

        const workflowInfo = {
          context: context.name,
          workflow: entry.name,
          path: path.join(contextDir, entry.name),
        };

        if (workflowToggle.mode === "always_loaded") {
          state.always_loaded_workflows.push(workflowInfo);
        } else {
          state.dynamic_workflows.push(workflowInfo);
        }

        // Skip processing as skill since it's identified as a workflow
        continue;
      }

      // Process skills only if not identified as a workflow
      if (
        context.skills &&
        context.skills.hasOwnProperty(entry.name) &&
        !isWorkflow
      ) {
        const skillToggle = context.skills[entry.name] || {
          enabled: true,
          mode: "always_loaded",
        };

        if (!skillToggle.enabled) {
          state.disabled_skills.push({
            context: context.name,
            skill: entry.name,
          });
          continue;
        }

        const skillInfo = {
          context: context.name,
          skill: entry.name,
          path: path.join(contextDir, entry.name),
        };

        if (skillToggle.mode === "always_loaded") {
          state.always_loaded_skills.push(skillInfo);
        } else {
          state.dynamic_skills.push(skillInfo);
        }
      }
    }
  }

  res.json(state);
});

// ──────────────────────── START SERVER ────────────────────────

app.listen(port, () => {
  const masterConfig = loadMasterConfig();
  console.log(`Context Manager Web running at http://localhost:${port}`);
  console.log(`Active SkillHub: ${masterConfig.active_hub}`);
  console.log(`Storage: ${STORAGE_PATH}`);
  ensureDirectories();
});
