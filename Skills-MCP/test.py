import importlib.util
import json
import sys


def run_test():
    print("--- Testing list_available_skills logic from mcp_server.py ---")
    try:
        spec = importlib.util.spec_from_file_location("mcp_server", "./mcp_server.py")
        if spec is None or spec.loader is None:
            print("Error: Could not load mcp_server.py")
            return
        mcp_server_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mcp_server_module)

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
        result = sorted(items, key=lambda x: x["name"])
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(f"An error occurred during execution: {e}", file=sys.stderr)
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    run_test()
