import ast
import io
import json
import re
import unittest
from pathlib import Path

import repair


class Errors(unittest.TestCase):
    def setUp(self):
        self.ns = {'json': json, 're': re}
        exec(repair.ERROR_READER, self.ns)
        self.errors = self.ns['code_errors']

    def test_actual_closed_transport_envelope(self):
        message = 'tool call error: tool call failed for `blender/build_model`\n\nCaused by:\n    Transport closed'
        envelope = {'content': [{'type': 'text', 'text': message}], 'isError': True}
        wire = [{'type': 'input_text', 'text': 'Script completed'},
                {'type': 'input_text', 'text': json.dumps(envelope)}]
        self.assertEqual(self.errors(wire), ['MCP_TRANSPORT_CLOSED: tool process exited; no further provider request.'])

    def test_polish_validation_error_is_not_silently_successful(self):
        self.assertEqual(self.errors({'isError': True, 'content': [
            {'type': 'text', 'text': '$: wymagane pola: version, name'}]}),
            ['$: wymagane pola: version, name'])

    def test_empty_and_malformed_error_envelopes(self):
        for content in [None, {}, [], [{'type': 'image', 'data': 'private'}]]:
            with self.subTest(content=content):
                self.assertEqual(self.errors({'isError': True, 'content': content}),
                                 ['MCP_TOOL_ERROR: tool returned isError=true.'])

    def test_success_images_and_reasoning_are_not_diagnostics(self):
        self.assertEqual(self.errors({'isError': False, 'content': [
            {'type': 'text', 'text': 'Model ready'},
            {'type': 'image', 'text': 'Error: private'},
            {'type': 'reasoning', 'text': 'Error: private'}]}), [])
        self.assertEqual(self.errors('TypeError: missing scene'), ['TypeError: missing scene'])

    def test_bounded_errors(self):
        result = self.errors({'isError': True, 'content': [
            {'type': 'text', 'text': 'x' * 2000}] * 100})
        self.assertEqual([len(x) for x in result], [1200] * 3)


class Transport(unittest.TestCase):
    def read(self, wire):
        # Exercise the exact loop that replaces serve's framing boundary.
        ns = {'incoming': io.StringIO(wire), 'seen': []}
        exec('def receive(incoming, seen):\n' + repair.NEW_READER +
             '        seen.append(json.loads(raw))\n', {'json': json}, ns)
        ns['receive'](ns['incoming'], ns['seen'])
        return ns['seen']

    def test_valid_maximum_string_survives_unicode_wire_expansion(self):
        request = {'id': 1, 'method': 'tools/call', 'params': {
            'name': 'build_model', 'arguments': {'scene_json': '\u2603' * 256000, 'expected_revision': 0}}}
        wire = json.dumps(request) + '\n' + json.dumps({'id': 2, 'method': 'ping'}) + '\n'
        self.assertGreater(len(wire), 600000)
        self.assertEqual(self.read(wire), [request, {'id': 2, 'method': 'ping'}])

    def test_oversized_but_bounded_request_reaches_argument_validator(self):
        request = {'id': 3, 'params': {'arguments': {'scene_json': ' ' * 600001}}}
        self.assertEqual(self.read(json.dumps(request) + '\n'), [request])

    def test_pathological_unterminated_frame_stops_with_bounded_read(self):
        self.assertEqual(self.read('x' * (3 * 1024 * 1024)), [])

    def test_unknown_runtime_refused(self):
        with self.assertRaises(ValueError):
            repair.patch_sources({name: b'unknown' for name in repair.EXPECTED})


if __name__ == '__main__':
    unittest.main()
