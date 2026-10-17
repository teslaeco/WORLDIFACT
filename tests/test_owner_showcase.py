import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('showcase', Path(__file__).resolve().parents[1] / 'scripts/publish-owner-showcase-assets.py')
showcase = importlib.util.module_from_spec(spec)
spec.loader.exec_module(showcase)


def fixture(values=(.25, .125, .75, .875)):
    binary = struct.pack('<4f', *values) + b'UNCHANGED_PIXELS!'
    doc = {'asset': {'version': '2.0'}, 'buffers': [{'byteLength': len(binary)}],
           'meshes': [{'primitives': [{'attributes': {'TEXCOORD_0': 0}}]}],
           'accessors': [{'bufferView': 0, 'componentType': 5126, 'type': 'VEC2', 'count': 2}],
           'bufferViews': [{'buffer': 0, 'byteLength': 16}], 'images': []}
    encoded = json.dumps(doc).encode()
    encoded += b' ' * (-len(encoded) % 4)
    raw = struct.pack('<III', 0x46546c67, 2, 28+len(encoded)+len(binary))
    raw += struct.pack('<II', len(encoded), 0x4e4f534a) + encoded + struct.pack('<II', len(binary), 0x004e4942) + binary
    return raw, 28+len(encoded)


class ShowcaseTests(unittest.TestCase):
    def test_only_v_bytes_change(self):
        original, start = fixture()
        result = showcase.flip_uv(original)
        expected = bytearray(original)
        struct.pack_into('<f', expected, start+4, .875)
        struct.pack_into('<f', expected, start+12, .125)
        self.assertEqual(result, bytes(expected))
        self.assertEqual(showcase.flip_uv(result), original)

    def test_invalid_uv_and_container_rejected(self):
        for values in [(0, float('nan'), 0, 0), (0, 2, 0, 0)]:
            with self.assertRaisesRegex(ValueError, 'INVALID_UV_VALUE'):
                showcase.flip_uv(fixture(values)[0])
        with self.assertRaisesRegex(ValueError, 'INVALID_GLB'):
            showcase.flip_uv(fixture()[0][:-4])

    def test_wrong_saved_bytes_write_nothing_and_only_read_fixed_object(self):
        calls = []
        class Store:
            def read(self, key, limit):
                calls.append((key, limit))
                return b'wrong model'
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'public'
            with self.assertRaisesRegex(ValueError, 'SAVED_MODEL_MISMATCH'):
                showcase.prepare(Store(), output)
            self.assertFalse(output.exists())
        self.assertEqual(calls, [(f"jobs/{showcase.SCOPE}/{showcase.MODELS[0]['job']}/outputs/game.glb", 18063228)])


if __name__ == '__main__':
    unittest.main()
