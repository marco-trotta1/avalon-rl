"""Test the local model boundary without starting a model service."""

import contextlib
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

path = Path(__file__).resolve().parents[2] / "examples/team-trial/ollama-agent.py"
spec = importlib.util.spec_from_file_location("trial_ollama", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
DIGEST = "a" * 64


class LocalModelTests(unittest.TestCase):
    def request(self):
        return {"format": "avalon.agent-request/v1", "config": {"model": "local", "digest": DIGEST, "port": 11434},
                "task": "Refund 700 cents.", "seed": 19, "observation": {}, "history": [], "remainingSteps": 6}

    def test_pins_identity_and_records_exact_inference(self):
        calls = []

        def api(**options):
            calls.append(options)
            if options["route"] == "tags":
                return {"models": [{"name": "local", "digest": DIGEST}]}
            if options["route"] == "version":
                return {"version": "test"}
            return {"done": True, "done_reason": "stop", "message": {"content": '{"op":"close"}'}}

        output = io.StringIO()
        with patch.object(module, "request_api", side_effect=api), patch("sys.stdin", io.StringIO(json.dumps(self.request()))), contextlib.redirect_stdout(output):
            module.main()
        result = json.loads(output.getvalue())
        self.assertEqual(result["action"], {"op": "close"})
        self.assertEqual(result["metadata"]["identity"]["digest"], DIGEST)
        self.assertEqual([call["route"] for call in calls], ["tags", "chat", "tags", "version"])
        self.assertEqual(calls[1]["body"]["options"]["seed"], 19)

    def test_rejects_remote_or_changed_weights_before_inference(self):
        for record in [{"name": "local", "digest": "b" * 64}, {"name": "local", "digest": DIGEST, "remote_host": "remote"}]:
            with self.subTest(record=record), patch.object(module, "request_api", return_value={"models": [record]}) as api:
                with self.assertRaises(ValueError):
                    module.identify(port=11434, name="local", digest=DIGEST)
                self.assertEqual(api.call_count, 1)

    def test_rejects_invalid_config_without_network(self):
        request = self.request()
        request["config"]["port"] = "remote"
        with patch.object(module, "request_api") as api, patch("sys.stdin", io.StringIO(json.dumps(request))):
            with self.assertRaises(ValueError):
                module.main()
            api.assert_not_called()


if __name__ == "__main__":
    unittest.main()
