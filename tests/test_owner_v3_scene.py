"""Real Blender checks; these are procedural fixtures, not AI evidence."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

HAS_BPY = importlib.util.find_spec('bpy') is not None


@unittest.skipUnless(HAS_BPY, 'Requires the real Blender Python runtime')
class OwnerV3SceneTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import bpy
        cls.bpy = bpy
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.object.delete(use_global=False)
        for collection in list(bpy.data.collections):
            if collection.name == 'OwnerV3_HalloweenScene':
                bpy.data.collections.remove(collection)
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools' / 'runpod_worker'))
        from owner_scene_v3 import build_halloween_scene
        cls.build = staticmethod(build_halloween_scene)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, location=(2, -3, 6))
        cls.original = bpy.context.object
        cls.original.name = 'NativeGeometryTestFixture'
        cls.original.scale = (.35, .25, .8)
        material = bpy.data.materials.new('OriginalFixtureMaterial')
        cls.original.data.materials.append(material)
        bpy.context.view_layer.update()
        cls.original_vertices = [tuple(v.co) for v in cls.original.data.vertices]
        cls.original_matrix = [tuple(row) for row in cls.original.matrix_world]
        cls.report = cls.build([cls.original])

    def test_native_mesh_and_material_are_preserved(self):
        self.assertEqual(self.original_vertices, [tuple(v.co) for v in self.original.data.vertices])
        self.assertEqual(self.original_matrix, [tuple(row) for row in self.original.matrix_world])
        copy = next(self.bpy.data.objects[name] for name in self.report['model_object_names'] if name.startswith('Character_'))
        self.assertIs(copy.data, self.original.data)
        self.assertEqual(copy.data.materials[0].name, 'OriginalFixtureMaterial')
        self.assertTrue(self.original.hide_render)
        self.assertTrue(self.original.hide_viewport)
        self.assertNotIn(self.original.name, self.report['model_object_names'])

    def test_scene_contains_required_physical_components(self):
        categories = {x['category'] for x in self.report['object_inventory']}
        self.assertTrue({'GrandPiano', 'DrumKit', 'ElectricGuitar', 'Violin', 'Trumpet', 'Keyboard', 'InferredRoom', 'InferredLowerDress', 'RoomDecor', 'MusicTrails'}.issubset(categories))
        self.assertGreater(self.report['triangle_count'], 50000)
        self.assertTrue(all(x['triangles'] > 0 for x in self.report['object_inventory']))
        self.assertEqual(len(self.report['model_object_names']), len(set(self.report['model_object_names'])))
        self.assertFalse(self.report['print_ready'])
        self.assertTrue(self.report['inferred_regions'])
        json.dumps(self.report, allow_nan=False)

    def test_meter_scale_and_export(self):
        bpy = self.bpy
        lo, hi = self.report['bbox_mm']
        self.assertGreater(hi[2]-lo[2], 200)
        self.assertLess(hi[2]-lo[2], 350)
        self.assertGreater(hi[0]-lo[0], 250)
        self.assertLess(hi[0]-lo[0], 350)
        self.assertEqual(self.report['units'], 'meters')
        self.assertEqual(bpy.context.scene.unit_settings.scale_length, 1)
        bpy.ops.object.select_all(action='DESELECT')
        for name in self.report['model_object_names']:
            bpy.data.objects[name].select_set(True)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'fixture.glb'
            bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True)
            raw = path.read_bytes()
            self.assertEqual(raw[:4], b'glTF')
            self.assertGreater(len(raw), 100000)
            import struct
            length = struct.unpack_from('<I', raw, 12)[0]
            document = json.loads(raw[20:20+length])
            self.assertNotIn(self.original.name, {node.get('name') for node in document['nodes']})
            self.assertGreater(len(document['meshes']), 100)
            # Verify physical extent from the exported glTF scene graph,
            # including node transforms, rather than trusting report units.
            from itertools import product
            from mathutils import Matrix, Quaternion, Vector
            points=[]
            def visit(index, parent):
                node=document['nodes'][index]
                if 'matrix' in node:
                    values=node['matrix'];local=Matrix([values[i:i+4] for i in range(0,16,4)]).transposed()
                else:
                    q=node.get('rotation',[0,0,0,1]);s=node.get('scale',[1,1,1])
                    local=Matrix.Translation(node.get('translation',[0,0,0])) @ Quaternion((q[3],q[0],q[1],q[2])).to_matrix().to_4x4() @ Matrix.Diagonal((*s,1))
                world=parent @ local
                if 'mesh' in node:
                    for primitive in document['meshes'][node['mesh']]['primitives']:
                        accessor=document['accessors'][primitive['attributes']['POSITION']]
                        for corner in product(*zip(accessor['min'],accessor['max'])):points.append(world @ Vector(corner))
                for child in node.get('children',[]):visit(child,world)
            for node in document['scenes'][document.get('scene',0)]['nodes']:visit(node,Matrix.Identity(4))
            extents=[max(p[i] for p in points)-min(p[i] for p in points) for i in range(3)]
            self.assertTrue(all(.15 < extent < .35 for extent in extents),extents)

    def test_invalid_and_duplicate_inputs_fail_closed(self):
        with self.assertRaisesRegex(ValueError, 'NO_CHARACTER_MESHES'):
            self.build([])
        with self.assertRaisesRegex(ValueError, 'OWNER_SCENE_ALREADY_BUILT'):
            self.build([self.original])


if __name__ == '__main__':
    unittest.main()
