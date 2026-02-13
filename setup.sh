#!/bin/bash
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"
STORAGE_DIR="$HOME/contextmanager"
HUB_DIR="$STORAGE_DIR/hubs/MySkillHub"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║        Skill-ContextManager - Unified Setup                ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

check_command() {
    if ! command -v "$1" &> /dev/null; then
        echo "❌ $1 is not installed. Please install $1 first."
        echo "   $2"
        return 1
    fi
    echo "✓ $1 found: $(command -v "$1")"
    return 0
}

echo "Checking prerequisites..."
check_command "node" "https://nodejs.org/"
check_command "npm" "https://nodejs.org/"
check_command "python3" "https://www.python.org/"
echo ""

echo "════════════════════════════════════════════════════════════"
echo "Step 1/3: Setting up Web Application"
echo "════════════════════════════════════════════════════════════"
cd "$SCRIPT_DIR/Skill-ContextManager"

if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install
else
    echo "npm dependencies already installed. Skipping..."
fi

cd "$SCRIPT_DIR"
echo ""

echo "════════════════════════════════════════════════════════════"
echo "Step 2/3: Setting up MCP Server"
echo "════════════════════════════════════════════════════════════"
cd "$SCRIPT_DIR/Skills-MCP"

if [ ! -d ".venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv .venv
fi

echo "Installing Python dependencies..."
source .venv/bin/activate
pip install --quiet fastmcp
deactivate

cd "$SCRIPT_DIR"
echo ""

echo "════════════════════════════════════════════════════════════"
echo "Step 3/3: Initializing Skills Library"
echo "════════════════════════════════════════════════════════════"

mkdir -p "$HUB_DIR/skills"
mkdir -p "$HUB_DIR/workflows"
mkdir -p "$HUB_DIR/contexts"
mkdir -p "$HUB_DIR/settings-profiles"

SKILLS_COUNT=0
SKILLS_SKIPPED=0
WORKFLOWS_COUNT=0
WORKFLOWS_SKIPPED=0

if [ -d "$SCRIPT_DIR/MySkillsHUB/skills" ]; then
    for skill_dir in "$SCRIPT_DIR/MySkillsHUB/skills"/*/; do
        if [ -d "$skill_dir" ]; then
            skill_name=$(basename "$skill_dir")
            if [ ! -d "$HUB_DIR/skills/$skill_name" ]; then
                cp -r "$skill_dir" "$HUB_DIR/skills/"
                SKILLS_COUNT=$((SKILLS_COUNT + 1))
            else
                SKILLS_SKIPPED=$((SKILLS_SKIPPED + 1))
            fi
        fi
    done
    echo "Skills: $SKILLS_COUNT copied, $SKILLS_SKIPPED already exist"
else
    echo "No skills found in MySkillsHUB/skills"
fi

if [ -d "$SCRIPT_DIR/MySkillsHUB/workflows" ]; then
    for workflow_dir in "$SCRIPT_DIR/MySkillsHUB/workflows"/*/; do
        if [ -d "$workflow_dir" ]; then
            workflow_name=$(basename "$workflow_dir")
            if [ ! -d "$HUB_DIR/workflows/$workflow_name" ]; then
                cp -r "$workflow_dir" "$HUB_DIR/workflows/"
                WORKFLOWS_COUNT=$((WORKFLOWS_COUNT + 1))
            else
                WORKFLOWS_SKIPPED=$((WORKFLOWS_SKIPPED + 1))
            fi
        fi
    done
    echo "Workflows: $WORKFLOWS_COUNT copied, $WORKFLOWS_SKIPPED already exist"
else
    echo "No workflows found in MySkillsHUB/workflows"
fi

if [ ! -f "$HUB_DIR/config.json" ]; then
    echo '{"context_cells":[],"settings":{"confirm_delete":true,"show_hidden_files":false}}' > "$HUB_DIR/config.json"
fi

if [ ! -f "$STORAGE_DIR/master-config.json" ]; then
    echo '{"active_hub":"MySkillHub","hubs":["MySkillHub"]}' > "$STORAGE_DIR/master-config.json"
fi

echo ""

echo "════════════════════════════════════════════════════════════"
echo "✅ Setup Complete!"
echo "════════════════════════════════════════════════════════════"
echo ""

MCP_CONFIG=$(cat << EOF
{
  "Skills-ContextManager": {
    "command": "$SCRIPT_DIR/Skills-MCP/.venv/bin/python3",
    "args": ["-u", "$SCRIPT_DIR/Skills-MCP/mcp_server.py"],
    "env": {}
  }
}
EOF
)

echo "$MCP_CONFIG" > "$SCRIPT_DIR/mcp_settings.json"
echo "MCP configuration saved to: $SCRIPT_DIR/mcp_settings.json"
echo ""

echo "Library status:"
echo "  - Skills: $SKILLS_COUNT new, $SKILLS_SKIPPED existing"
echo "  - Workflows: $WORKFLOWS_COUNT new, $WORKFLOWS_SKIPPED existing"
echo ""
echo "To start the Web Application:"
echo "  cd Skill-ContextManager && npm start"
echo ""
echo "Add this to your AI Agent's MCP settings:"
echo "  $SCRIPT_DIR/mcp_settings.json"
echo ""
echo "For more information, see README.md"
