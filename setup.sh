#!/bin/bash
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

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
echo "Step 1/2: Setting up Web Application"
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
echo "Step 2/2: Setting up MCP Server"
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

echo "To start the Web Application:"
echo "  cd Skill-ContextManager && npm start"
echo ""
echo "Add this to your AI Agent's MCP settings:"
echo "  $SCRIPT_DIR/mcp_settings.json"
echo ""
echo "For more information, see README.md"
