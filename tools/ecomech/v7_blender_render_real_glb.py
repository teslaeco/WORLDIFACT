#!/usr/bin/env python3
"""Render actual imported GLB through Blender 4.3 CPU, four physical cameras.

No AI image generation, photo-card overlay or claimed 360-degree likeness.
The image-projected geometry remains experimental and visually unapproved.
"""
import bpy, hashlib, json, math, sys
from pathlib import Path
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:]
if len(args)!=2: raise ValueError('Usage: -- ORIGINAL_GLB OUTPUT_FOLDER')
glb,out=Path(args[0]).resolve(),Path(args[1]).resolve()
if not glb.is_file() or glb.stat().st_size<1000000: raise ValueError('ORIGINAL_GLB_MISSING')
out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(glb))
originals=[obj for obj in bpy.context.scene.objects if obj.type=='MESH']
if len(originals)!=6 or sum(len(obj.data.polygons) for obj in originals)<200000:
    raise ValueError('SIX_ACTUAL_SOURCE_GLTF_MESHES_REQUIRED')
names=[obj.name for obj in originals]
print('REAL_GLTF_IMPORTED_FOR_RENDER',json.dumps(names),flush=True)
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.device='CPU'
scene.cycles.samples=12
scene.render.resolution_x=900
scene.render.resolution_y=1100
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
try: scene.view_settings.view_transform='AgX'
except Exception: pass
world=bpy.data.worlds.new('Dark studio HDR-style ambient')
scene.world=world
world.use_nodes=True
nodes=world.node_tree.nodes
nodes.get('Background').inputs['Color'].default_value=(.035,.045,.065,1)
nodes.get('Background').inputs['Strength'].default_value=.9
mat=bpy.data.materials.new(name='RENDER_ONLY_FLOOR_MATTE')
mat.diffuse_color=(.07,.085,.095,1)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.04))
floor=bpy.context.object;floor.name='QA_ONLY_FLOOR_NOT_IN_ORIGINAL_GLB'
floor.data.materials.append(mat)
def area(name,location,energy,color,size):
    data=bpy.data.lights.new(name,'AREA')
    data.energy=energy;data.shape='DISK';data.size=size;data.color=color
    ob=bpy.data.objects.new(name,data)
    scene.collection.objects.link(ob)
    ob.location=location;direction=Vector((0,0,1.3))-ob.location
    ob.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
area('studio_key',(-3,-4,5),1550,(1,.98,.92),5)
area('studio_fill',(3,-2,3),1250,(.72,.88,1),4.5)
area('studio_rim',(-2,4,4),2000,(.72,1,1),4)
camera_data=bpy.data.cameras.new('QA_ORTHOGRAPHIC_CAMERA')
cam=bpy.data.objects.new('QA_ORTHOGRAPHIC_CAMERA',camera_data)
scene.collection.objects.link(cam);scene.camera=cam
cam.data.type='ORTHO';cam.data.ortho_scale=3.55
views=[('front',(0,-6,1.4)),('three_quarter',(2.7,-5.5,1.4)),
       ('side',(6,0,1.4)),('back',(0,6,1.4))]
record={}
for name,location in views:
    cam.location=location
    cam.rotation_euler=(Vector((0,0,1.37))-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(out/('real_glb_'+name+'.png'))
    bpy.ops.render.render(write_still=True)
    path=Path(scene.render.filepath)
    if not path.is_file() or path.stat().st_size<20_000:
        raise ValueError('BLENDER_REAL_GLTF_RENDER_MISSING_'+name)
    record[name]={'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
      'bytes':path.stat().st_size,'source':'BLENDER_4.3_RENDER_OF_IMPORTED_REAL_GLTF_GEOMETRY'}
    print('REAL_GLTF_RENDER',name,record[name]['bytes'],flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'ecomech-v7-EDITABLE-LOOKDEV.blend'))
blend=out/'ecomech-v7-EDITABLE-LOOKDEV.blend'
if not blend.exists() or blend.stat().st_size<1000000:
    raise ValueError('EDITABLE_BLEND_EXPORT_MISSING')
(out/'render-provenance.json').write_text(json.dumps({
    'reference':'the original photo is in the GLB texture only; no camera overlay',
    'rig':'NOT_GENERATED','sourceMeshes':len(originals),
    'originalGlbSha256':hashlib.sha256(glb.read_bytes()).hexdigest(),
    'realRenders':record,
    'editableBlenderSha256':hashlib.sha256(blend.read_bytes()).hexdigest(),
    'visualFidelity':'UNREVIEWED_NO_GO',
    'costNewOpenAIUsd':0},indent=2)+'\n')
print('REAL_GLB_FOUR_VIEW_BLENDER_COMPLETE',flush=True)
