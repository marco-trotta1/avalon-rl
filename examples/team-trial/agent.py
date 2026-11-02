"""Run a deterministic reference policy. This policy does not call a model."""

import json
import sys

request = json.load(sys.stdin)
if request.get("format") != "avalon.agent-request/v1":
    raise ValueError("Use the Avalon agent request format.")
observation = request["observation"]
delta = observation["goal_cents"] - observation["target_cents"]
action = {"op": "adjust", "account": "target", "cents": delta} if delta else {"op": "close"}
print(json.dumps({"action": action, "costUsd": 0}))
