# Skill-ContextManager & MCP Server

[![GitHub](https://img.shields.io/badge/GitHub-One--Man--Company%2FSkills--ContextManager-blue)](https://github.com/One-Man-Company/Skills-ContextManager)

A self-hosted web application for managing AI skills, workflows, and contexts with full MCP (Model Context Protocol) integration. Organize, manage, and dynamically load specialized knowledge bases into any AI Agent just by toggling your Skills On/Off in simple local hosted WEB UI.

## Features

### Web Application
- **Skill & Workflow Management**: Create, edit, delete, and organize skills and workflows
- **Multi-Hub Support**: Create isolated workspaces with separate skills/contexts
- **Context Cells**: Organize skills/workflows into logical groups with enable/disable toggles
- **Dual Mode**: Choose Always-loaded (auto-loaded) or Dynamic (on-demand) skills by on/off toggle
- **File Editor**: Built-in editor with file tree, create/delete files & folders
- **Import Sources**:
  - 📂 **Folder**: Upload from local filesystem
  - 🐙 **GitHub**: Clone from GitHub repositories
  - ⚡ **Skills.sh**: Import from Skills.sh registry
- **AI Description Generation**: Auto-generate skill descriptions using AI APIs
- **Secure API Key Storage**: API keys stored with file mode 0600 (owner-only)
- **Settings Profiles**: Save and load configuration presets
- **Search & Filter**: Smart search, sort, favorites, active/inactive filters
- **Token Counting**: Track context size in tokens
- **Drag & Drop**: Move skills/workflows to contexts

### MCP Server
- **3 Essential Tools** for AI Agents:
  - `get_default_skills()` - Load skills with mode `"always_loaded"`
  - `list_available_skills()` - List all enabled skills with modes
  - `load_full_skill_context(name)` - Load dynamic skill on-demand
- **Hub-Aware**: Works with active hub from multiple workspaces
- **Mode Support**: `"always_loaded"` vs `"dynamic"` skill loading
- **Type Support**: Both Skills and Workflows

## Quick Start

```bash
# Clone the repository
git clone https://github.com/One-Man-Company/Skills-ContextManager.git
cd Skills-ContextManager

# Install everything and copy starter skills to library
./setup.sh

# Start web application
cd Skill-ContextManager && npm start
```

Access: `http://localhost:3000`

MCP configuration saved to `mcp_settings.json` - add this to your AI Agent's MCP settings.  

!!!! Verty important !!!!
Copy content of `MCP_instructions.md` to your AI Agent's System prompt or some other type of rules which your AI Agent uses.

## MCP Configuration

The `setup.sh` script generates `mcp_settings.json` with correct paths. Add it to your AI Agent's MCP settings file. Example here:

```json
{
  "Skills-ContextManager": {
    "command": "/absolute/path/Skills-MCP/.venv/bin/python3",
    "args": ["-u", "/absolute/path/Skills-MCP/mcp_server.py"],
    "env": {}
  }
}
```


### mcpservers.org Submission

| Field | Value |
|-------|-------|
| Name | Skills-ContextManager |
| Description | Web UI for managing AI skills with MCP integration |
| Repository | https://github.com/One-Man-Company/Skills-ContextManager |
| Command | `[path]/Skills-MCP/.venv/bin/python3` |
| Args | `-u [path]/Skills-MCP/mcp_server.py` |

## MCP Tools

AI Agents need only these 3 tools:

| Tool | Description |
|------|-------------|
| `get_default_skills()` | Load all skills with mode `"always_loaded"` into context |
| `list_available_skills()` | List all enabled skills with descriptions and modes |
| `load_full_skill_context(name)` | Load a specific skill on-demand (for mode `"dynamic"`) |

## Architecture

```
Skill-ContextManager/
├── Skill-ContextManager/     # Web Application (Node.js + Express)
│   ├── server.js             # REST API server
│   └── public/               # Web UI
│
├── Skills-MCP/               # MCP Server (Python + FastMCP)
│   ├── mcp_server.py         # MCP implementation
│   └── .venv/                # Python environment
│
└── Storage: ~/contextmanager/
    ├── master-config.json    # Active hub, hubs list
    └── hubs/
        └── <HubName>/
            ├── config.json   # Contexts, skills settings
            ├── contexts/     # Context cells with skills
            ├── skills/       # Library skills
            ├── workflows/    # Library workflows
            └── settings-profiles/
```

## Storage Structure

```
~/contextmanager/
├── master-config.json              # {"active_hub": "...", "hubs": [...]}
├── ai-settings.json                # AI settings (mode 0600 - secure)
└── hubs/
    └── MySkillHub/
        ├── config.json             # Context cells, settings
        ├── contexts/
        │   └── <context-name>/     # One folder per context
        │       ├── <skill-name>/   # Skills in context
        │       └── <workflow-name>/
        ├── skills/                 # Library skills
        ├── workflows/              # Library workflows
        └── settings-profiles/      # Saved configurations
```

## Skill Structure

```
skill-name/
├── description.md    # Brief description (discovery, NOT loaded)
├── skill.md          # Main instructions (loaded first)
├── other.md          # Additional files (loaded alphabetically)
└── subfolder/        # Nested resources
    └── more.md
```

**Loading order**: `skill.md` → root files (A-Z) → subfolders (A-Z)

## Usage

### Create Skills
1. Click "+ New Skill" in Library
2. Enter name, edit files in modal editor
3. Create `description.md` for MCP discovery
4. Create `skill.md` for main instructions

### Organize into Contexts
1. Click "+ New Context cell" in middle panel
2. Drag skills/workflows from Library to context
3. Toggle enable/disable per item
4. Set mode: Always (auto-load) or Dynamic (on-demand)

### Import Skills
- **📂 Folder**: Select folder(s) to upload
- **🐙 GitHub**: Enter repo URL or specific folder path
- **⚡ Skills.sh**: Enter skills.sh URL or owner/repo

### Save Configurations
- Create Settings Profiles to save context toggles
- Switch between profiles for different workflows

## API Endpoints

### Contexts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/contexts` | List contexts |
| POST | `/api/contexts` | Create context |
| DELETE | `/api/contexts/:name` | Delete context |
| PATCH | `/api/contexts/:name/toggle` | Toggle context |

### Context Skills/Workflows
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/contexts/:name/skills` | List skills |
| GET | `/api/contexts/:name/workflows` | List workflows |
| POST | `/api/contexts/:name/skills` | Create skill |
| DELETE | `/api/contexts/:name/skills/:skill` | Remove skill |
| PATCH | `/api/contexts/:name/skills/:skill/toggle` | Toggle skill |

### Library
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/skills` | List/Create skills |
| GET/POST | `/api/workflows` | List/Create workflows |
| DELETE | `/api/skills/:name` | Delete skill |
| DELETE | `/api/workflows/:name` | Delete workflow |
| POST | `/api/skills/import/github` | Import from GitHub |
| POST | `/api/skills/import/skillssh` | Import from Skills.sh |
| POST | `/api/skills/import/files` | Upload folder |
| POST | `/api/skills/generate-description` | AI generate skill description |
| POST | `/api/workflows/generate-description` | AI generate workflow description |
| GET/POST | `/api/ai-settings` | Get/Save AI settings (secure storage) |

### Hubs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/skillhubs` | List hubs |
| POST | `/api/skillhubs` | Create hub |
| POST | `/api/skillhubs/switch` | Switch active hub |
| DELETE | `/api/skillhubs/:name` | Delete hub |

### Profiles
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/settings-profiles` | List/Create profiles |
| GET/DELETE | `/api/settings-profiles/:name` | Get/Delete profile |

## Skill Modes

| Mode | Behavior |
|------|----------|
| `"always_loaded"` | Automatically loaded at conversation start via `get_default_skills()` |
| `"dynamic"` | Available on-demand via `load_full_skill_context(name)` |

## Troubleshooting

### Port 3000 in use
```bash
lsof -ti:3000 | xargs kill -9
```

### MCP Server issues
```bash
cd Skills-MCP
rm -rf .venv && python3 -m venv .venv
source .venv/bin/activate && pip install fastmcp
```

### Skills not appearing
1. Check `~/contextmanager/hubs/<hub>/skills/`
2. Ensure `skill.md` and `description.md` exist
3. Refresh browser

### Check MCP logs
```bash
cat /tmp/skills_mcp.log
```

## Project Structure

```
├── setup.sh              # Unified installer
├── skills.sh             # MCP config generator
├── mcp_settings.json     # Generated MCP config
├── README.md
├── MCP_instructions.md   # AI agent system prompt
│
├── MySkillsHUB/          # Starter skills & workflows
│   ├── skills/           # Pre-packaged skills
│   └── workflows/        # Pre-packaged workflows
│
├── Skill-ContextManager/
│   ├── package.json
│   ├── server.js         # Express server
│   └── public/
│       ├── index.html
│       ├── app.js        # Frontend
│       └── styles.css
│
└── Skills-MCP/
    ├── mcp_server.py     # MCP server
    └── .venv/
```

## Included Skills & Workflows

The repository includes starter content in `MySkillsHUB/`:

**Skills (28+):**
- architecture, behavioral-modes, clean-code, code-review-checklist
- documentation-templates, frontend-design, game-development
- i18n-localization, mobile-design, nextjs-react-expert
- nodejs-best-practices, parallel-agents, performance-profiling
- python-patterns, seo-fundamentals, server-management
- skill-creator, systematic-debugging, ui-ux-pro-max
- vulnerability-scanner, webapp-testing, api-patterns, and more

**Workflows (3):**
- best-standard-autonomous-coding
- elite-cognitive-operator-system
- plan-mode

All content is automatically copied to your library on first setup.

## License

MIT License

---

**Created**: February 2026
