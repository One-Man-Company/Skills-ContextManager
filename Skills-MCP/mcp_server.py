#!/usr/bin/env python3
"""
Skills MCP Server – Structured Skills Hub
Reads skills from the currently active hub in ~/contextmanager/hubs/<active_hub>/contexts/<context>/<skill> folders.
Respects toggle states (enabled/disabled, default/dynamic) from the active hub's config.json.
The active hub is determined by ~/contextmanager/master-config.json.
"""

import json
import logging
import mimetypes
import pathlib
import sys
from typing import Dict, List, Optional

# Setup logging for debugging
logging.basicConfig(
    filename="/tmp/skills_mcp.log",
    level=logging.DEBUG,
    format="%(asctime)s - %(levelname)s - %(message)s",
)

logging.info(f"Starting MCP Server. Python executable: {sys.executable}")

try:
    from fastmcp import FastMCP
except ImportError as e:
    logging.critical(f"Failed to import fastmcp: {e}")
    sys.exit(1)

# Configuration
STORAGE_DIR = pathlib.Path.home() / "contextmanager"
HUBS_BASE_DIR = STORAGE_DIR / "hubs"
MASTER_CONFIG_PATH = STORAGE_DIR / "master-config.json"


def _get_active_hub_paths() -> tuple:
    """Determine the active hub and return path variables."""
    master_config = {}
    if MASTER_CONFIG_PATH.exists():
        try:
            master_config = json.loads(MASTER_CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception as e:
            logging.error(f"Error reading master config: {e}")

    active_hub = master_config.get("active_hub", "MySkillHub")
    HUB_DIR = HUBS_BASE_DIR / active_hub

    CONTEXTS_DIR = HUB_DIR / "contexts"
    SKILLS_DIR = HUB_DIR / "skills"
    CONFIG_PATH = HUB_DIR / "config.json"

    return CONTEXTS_DIR, SKILLS_DIR, CONFIG_PATH


def _get_active_hub_name() -> str:
    """Get the name of the currently active hub."""
    master_config = {}
    if MASTER_CONFIG_PATH.exists():
        try:
            master_config = json.loads(MASTER_CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception as e:
            logging.error(f"Error reading master config: {e}")

    return master_config.get("active_hub", "MySkillHub")


# Also support legacy path
LEGACY_RESOURCES_DIR = pathlib.Path.home() / "skills-resources"
LEGACY_SKILLS_DIR = LEGACY_RESOURCES_DIR / "skills"

# Convention: Each skill is a separate folder inside context folders or SKILLS_DIR
# Files:
# - 'skill.md': The main system prompt/instruction with YAML frontmatter containing 'description'.
#              The description field is used by list_available_skills to help AI choose.
#              NEVER loaded in context (only the body after frontmatter is loaded).
# - All other files: Loaded alphabetically (root first, then subfolders).

mcp = FastMCP(name="Structured Skills Hub")


# Log storage directory info and active hub
contexts_dir, skills_dir, config_path = _get_active_hub_paths()
logging.info(f"Storage dir: {STORAGE_DIR}")
logging.info(f"Active hub: {_get_active_hub_name()}")
logging.info(f"Contexts dir: {contexts_dir}")
logging.info(f"Skills dir: {skills_dir}")


def _load_config() -> dict:
    """Load config.json to read toggle states."""
    _, _, config_path = (
        _get_active_hub_paths()
    )  # Re-check active hub in case it changed
    if not config_path.exists():
        return {"context_cells": []}
    try:
        return json.loads(config_path.read_text(encoding="utf-8"))
    except Exception as e:
        logging.error(f"Error reading config: {e}")
        return {"context_cells": []}


def _get_enabled_skills() -> List[Dict]:
    """
    Get all enabled skills from enabled context cells only.
    Returns list of dicts: {name, path, mode}
    Does NOT include library skills - only user-enabled skills from context cells.
    """
    # Ensure we're using the current active hub
    contexts_dir, _, _ = _get_active_hub_paths()
    config = _load_config()
    skills = []

    for ctx in config.get("context_cells", []):
        # Skip disabled context cells
        if not ctx.get("enabled", True):
            continue

        ctx_folder = ctx.get("folder", "")
        ctx_dir = contexts_dir / ctx_folder
        if not ctx_dir.is_dir():
            continue

        ctx_skills_config = ctx.get("skills", {})
        ctx_workflows_config = ctx.get("workflows", {})

        for skill_dir in ctx_dir.iterdir():
            if not skill_dir.is_dir():
                continue

            # Check if this directory is configured as a skill
            if skill_dir.name in ctx_skills_config:
                skill_toggle = ctx_skills_config[skill_dir.name]
                # Skip disabled skills
                if not skill_toggle.get("enabled", True):
                    continue

                skills.append(
                    {
                        "name": skill_dir.name,
                        "path": skill_dir,
                        "mode": skill_toggle.get("mode", "always_loaded"),
                        "type": "skill",
                    }
                )
            # Check if this directory is configured as a workflow
            elif skill_dir.name in ctx_workflows_config:
                workflow_toggle = ctx_workflows_config[skill_dir.name]
                # Skip disabled workflows
                if not workflow_toggle.get("enabled", True):
                    continue

                skills.append(
                    {
                        "name": skill_dir.name,
                        "path": skill_dir,
                        "mode": workflow_toggle.get("mode", "always_loaded"),
                        "type": "workflow",
                    }
                )

    return skills


def _get_skill_dir(name: str) -> pathlib.Path:
    """Resolve a skill name to its directory path."""
    name = name.strip().strip("'").strip('"')
    if not name:
        raise ValueError("Skill name cannot be empty")
    if "/" in name or "\\" in name or ".." in name:
        raise ValueError(f"Invalid skill name: {name}")

    # Search in enabled skills
    for skill in _get_enabled_skills():
        if skill["name"] == name:
            logging.debug(f"Resolved skill '{name}' to: {skill['path']}")
            return skill["path"]

    # Fallback: direct lookup in legacy path
    legacy_dir = LEGACY_SKILLS_DIR / name
    if legacy_dir.is_dir():
        return legacy_dir

    # Report error
    enabled = [s["name"] for s in _get_enabled_skills()]
    logging.error(f"Skill not found: {name}. Available: {enabled}")
    raise ValueError(f"No skill folder found with name: {name}")


def _get_discovery_description(skill_dir: pathlib.Path) -> str:
    """Reads description from skill.md/SKILL.md frontmatter for the list_available_skills tool."""
    import re

    skill_md_path = skill_dir / "skill.md"
    if not skill_md_path.exists():
        skill_md_path = skill_dir / "SKILL.md"
    if not skill_md_path.exists():
        return "No description provided."
    try:
        content = skill_md_path.read_text(encoding="utf-8")
        frontmatter_match = re.match(r"^---\n([\s\S]*?)\n---", content)
        if frontmatter_match:
            frontmatter = frontmatter_match.group(1)

            desc_line_match = re.search(
                r"^description:\s*(.*)$", frontmatter, re.MULTILINE
            )
            if desc_line_match:
                desc_value = desc_line_match.group(1).strip()

                if desc_value.startswith('"'):
                    remaining = frontmatter[desc_line_match.end() :]
                    full_desc = desc_value[1:]

                    end_match = re.search(r'"\s*$', full_desc)
                    if end_match:
                        full_desc = full_desc[: end_match.start()]
                    else:
                        for line in remaining.split("\n"):
                            end_match = re.search(r'"\s*$', line)
                            if end_match:
                                full_desc += "\n" + line[: end_match.start()]
                                break
                            else:
                                full_desc += "\n" + line

                    full_desc = full_desc.replace('\\"', '"').replace("\\'", "'")
                    return " ".join(full_desc.split())

                elif desc_value.startswith("'"):
                    remaining = frontmatter[desc_line_match.end() :]
                    full_desc = desc_value[1:]

                    end_match = re.search(r"'\s*$", full_desc)
                    if end_match:
                        full_desc = full_desc[: end_match.start()]
                    else:
                        for line in remaining.split("\n"):
                            end_match = re.search(r"'\s*$", line)
                            if end_match:
                                full_desc += "\n" + line[: end_match.start()]
                                break
                            else:
                                full_desc += "\n" + line

                    full_desc = full_desc.replace('\\"', '"').replace("\\'", "'")
                    return " ".join(full_desc.split())

                else:
                    return desc_value.strip()

        return "No description provided."
    except Exception:
        return "Error reading skill.md frontmatter"


def _strip_frontmatter(content: str) -> str:
    """Strip YAML frontmatter from content if present."""
    import re

    return re.sub(r"^---\n[\s\S]*?\n---\n*", "", content)


def _is_text_file(file_path: pathlib.Path) -> bool:
    """Simple check if file is likely text."""
    mime, _ = mimetypes.guess_type(file_path)
    if mime and mime.startswith(
        ("image/", "video/", "audio/", "application/octet-stream")
    ):
        return False
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            f.read(512)
        return True
    except:
        return False


def _read_file_safe(file_path: pathlib.Path, skill_dir: pathlib.Path) -> str:
    """Helper to format file content for the context window."""
    relative = file_path.relative_to(skill_dir).as_posix()
    if not _is_text_file(file_path):
        return f"### Binary/Non-Text File: {relative}\n[Non-text file. View manually if needed.]\n"
    try:
        content = file_path.read_text(encoding="utf-8")
        return f"### File: {relative}\n\n{content}\n"
    except Exception:
        return f"### File: {relative} (Error reading)\n"


@mcp.tool
def list_available_skills() -> List[Dict]:
    """
    List available skills to help decide which one to use.
    Only returns skills that the user has explicitly enabled.
    Skills marked as 'always_loaded' are auto-loaded into context.
    Skills marked as 'dynamic' are listed here for on-demand loading.

    Usage:
    Call this tool to discover what skills are available.
    Example: list_available_skills()
    """
    items = []
    for skill in _get_enabled_skills():
        items.append(
            {
                "name": skill["name"],
                "description": _get_discovery_description(skill["path"]),
                "mode": skill["mode"],
                "type": skill["type"],
            }
        )
    return sorted(items, key=lambda x: x["name"])


@mcp.tool
def get_default_skills() -> str:
    """
    Load all skills marked as 'default' mode. These skills should
    ALWAYS be loaded into the AI context at the start of every conversation.

    Usage:
    Call this tool at the beginning of every session to load default skills.
    Example: get_default_skills()
    """
    parts = []
    always_loaded_skills = [
        s for s in _get_enabled_skills() if s["mode"] == "always_loaded"
    ]

    if not always_loaded_skills:
        return "No always_loaded skills configured."

    for skill in always_loaded_skills:
        skill_dir = skill["path"]
        context_parts = [f"<<START skill {skill['name']}>>\n"]

        # 1. Load skill.md/SKILL.md (strip frontmatter)
        skill_md = skill_dir / "skill.md"
        if not skill_md.exists():
            skill_md = skill_dir / "SKILL.md"
        if skill_md.exists():
            try:
                content = skill_md.read_text(encoding="utf-8")
                content = _strip_frontmatter(content)
                context_parts.append(f"# Main Skill File: skill.md\n\n{content}\n")
            except Exception:
                context_parts.append("# Main Skill File: skill.md (Error reading)\n")

        # 2. Root files
        root_files = sorted(
            [
                f
                for f in skill_dir.iterdir()
                if f.is_file() and f.name.lower() not in ("skill.md", "description.md")
            ]
        )
        if root_files:
            context_parts.append("\n# --- Additional Root Files ---\n")
            for f in root_files:
                context_parts.append(_read_file_safe(f, skill_dir))

        # 3. Subfolders
        root_subdirs = sorted([d for d in skill_dir.iterdir() if d.is_dir()])
        if root_subdirs:
            context_parts.append("\n# --- Subfolder Resources ---\n")
            for subdir in root_subdirs:
                sub_files = sorted([f for f in subdir.rglob("*") if f.is_file()])
                for f in sub_files:
                    if f.name == "description.md":
                        continue
                    context_parts.append(_read_file_safe(f, skill_dir))

        context_parts.append(f"<< END skill {skill['name']}>>\n")
        parts.append("\n".join(context_parts))

    return "\n\n".join(parts)


@mcp.tool
def load_full_skill_context(name: str) -> str:
    """
    Load the skill context.
    Order: 1. skill.md (body only, frontmatter excluded) -> 2. Root files (A-Z) -> 3. Subfolders (A-Z).
    Excludes: description.md (legacy), frontmatter from skill.md
    Wraps content in <<START skill>> ... << END skill>>.

    Usage:
    Call this tool to load the full content of a skill into the context.
    Example: load_full_skill_context(name="python-expert")
    """
    skill_dir = _get_skill_dir(name)

    context_parts = [f"<<START skill {name}>>\n"]

    # 1. Load skill.md/SKILL.md (strip frontmatter)
    skill_md = skill_dir / "skill.md"
    if not skill_md.exists():
        skill_md = skill_dir / "SKILL.md"
    if skill_md.exists():
        try:
            content = skill_md.read_text(encoding="utf-8")
            content = _strip_frontmatter(content)
            context_parts.append(f"# Main Skill File: skill.md\n\n{content}\n")
        except Exception:
            context_parts.append(f"# Main Skill File: skill.md (Error reading)\n")
    else:
        context_parts.append(f"# Main Skill File: skill.md (Missing)\n")

    # 2. Root Files (Alphabetical)
    root_files = sorted(
        [
            f
            for f in skill_dir.iterdir()
            if f.is_file() and f.name.lower() not in ("skill.md", "description.md")
        ]
    )
    if root_files:
        context_parts.append("\n# --- Additional Root Files ---\n")
        for f in root_files:
            context_parts.append(_read_file_safe(f, skill_dir))

    # 3. Subfolder Files (Alphabetical)
    root_subdirs = sorted([d for d in skill_dir.iterdir() if d.is_dir()])
    if root_subdirs:
        context_parts.append("\n# --- Subfolder Resources ---\n")
        for subdir in root_subdirs:
            sub_files = sorted([f for f in subdir.rglob("*") if f.is_file()])
            for f in sub_files:
                if f.name.lower() == "description.md":
                    continue
                context_parts.append(_read_file_safe(f, skill_dir))

    context_parts.append(f"<< END skill {name}>>")
    return "\n".join(context_parts)


@mcp.tool
def list_skill_files(name: str) -> List[str]:
    """
    List all files in a skill folder (excluding description.md as legacy file).

    Usage:
    Call this tool to see what files are inside a specific skill.
    Example: list_skill_files(name="python-expert")
    """
    skill_dir = _get_skill_dir(name)
    files = []
    for file_path in sorted(skill_dir.rglob("*")):
        if file_path.is_file() and file_path.name.lower() != "description.md":
            relative = file_path.relative_to(skill_dir).as_posix()
            files.append(relative)
    return files


@mcp.tool
def load_skill_file(name: str, relative_path: str) -> str:
    """
    Load a specific file from a skill (text only).
    Frontmatter is stripped from skill.md when loading.

    Usage:
    Call this tool to read a single file from a skill.
    Example: load_skill_file(name="python-expert", relative_path="cheatsheet.md")
    """
    skill_dir = _get_skill_dir(name)
    file_path = (skill_dir / relative_path).resolve()

    if not str(file_path).startswith(str(skill_dir)):
        raise ValueError("Invalid path")

    if not file_path.exists():
        raise ValueError(f"File not found: {relative_path}")

    if file_path.name == "description.md":
        return "Error: description.md is a legacy metadata file and cannot be loaded directly. Description is now in skill.md frontmatter."

    if file_path.name.lower() == "skill.md":
        try:
            content = file_path.read_text(encoding="utf-8")
            content = _strip_frontmatter(content)
            return f"### File: {relative_path}\n\n{content}\n"
        except Exception:
            return f"### File: {relative_path} (Error reading)\n"

    return _read_file_safe(file_path, skill_dir)


if __name__ == "__main__":
    try:
        logging.info("Running MCP server...")
        mcp.run()
    except Exception as e:
        logging.critical(f"MCP server crashed: {e}", exc_info=True)
        sys.exit(1)
