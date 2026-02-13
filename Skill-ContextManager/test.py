#!/usr/bin/env python3
"""
Test script that shows exactly what an AI Agent would see after calling list_available_skills()
"""

import json
from pathlib import Path


def get_enabled_skills():
    """
    Get all enabled skills from enabled context cells.
    Returns the same output as the MCP server's list_available_skills() tool.
    """
    storage_dir = Path.home() / "contextmanager"
    contexts_dir = storage_dir / "contexts"
    config_path = storage_dir / "config.json"

    available_skills = []

    if config_path.exists():
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                config = json.load(f)

            for ctx in config.get("context_cells", []):
                if not ctx.get("enabled", True):
                    continue

                ctx_folder = ctx.get("folder", "")
                ctx_dir = contexts_dir / ctx_folder
                if not ctx_dir.is_dir():
                    continue

                ctx_skills_config = ctx.get("skills", {})

                for skill_dir in ctx_dir.iterdir():
                    if not skill_dir.is_dir():
                        continue

                    skill_toggle = ctx_skills_config.get(skill_dir.name, {})
                    if not skill_toggle.get("enabled", True):
                        continue

                    # Get full description
                    desc_path = skill_dir / "description.md"
                    description = "No description provided."
                    if desc_path.exists():
                        try:
                            description = desc_path.read_text(encoding="utf-8").strip()
                        except:
                            description = "Error reading description.md"

                    available_skills.append(
                        {
                            "name": skill_dir.name,
                            "description": description,
                            "mode": skill_toggle.get("mode", "always_loaded"),
                        }
                    )

        except Exception as e:
            print(f"Error reading config: {e}")

    available_skills.sort(key=lambda x: x["name"])
    return available_skills


if __name__ == "__main__":
    skills = get_enabled_skills()

    print("Here what AI Agent will see after calling list_available_skills() : ")
    print(json.dumps(skills, indent=2))
