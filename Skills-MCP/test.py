import importlib.util
import os
import sys
from pprint import pprint


def run_test():
    print("--- Testing list_available_skills logic from mcp_server.py ---")
    try:
        # Dynamically load the module to avoid caching and ensure fresh config reading
        spec = importlib.util.spec_from_file_location("mcp_server", "./mcp_server.py")
        mcp_server_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mcp_server_module)

        # Recreate the exact logic from list_available_skills tool
        # (only returns name, description, and mode - not the internal path)
        items = []
        for skill in mcp_server_module._get_enabled_skills():
            items.append(
                {
                    "name": skill["name"],
                    "description": mcp_server_module._get_discovery_description(
                        skill["path"]
                    ),
                    "mode": skill["mode"],
                    "type": skill["type"],
                }
            )
        skills = sorted(items, key=lambda x: x["name"])

        pprint(skills)
        print("\n--- Test complete ---")
    except Exception as e:
        print(f"An error occurred during execution: {e}", file=sys.stderr)


if __name__ == "__main__":
    run_test()
