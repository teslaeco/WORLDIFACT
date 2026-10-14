#!/usr/bin/env python3
"""CPU Cycles multi-angle QA of the exact reconstructed GLB (NOT AI preview art)."""
import bpy
import json
import math
import os
import sys
from pathlib import Path
from mathutils import Vector

args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
if len(args)!=2:raise RuntimeError('Usage: blender --background --python render_reference_sculpt.py -- INPUT.glb OUTPUTDIR')
path, folder=Path(args[0]),Path(args[1])
if not path.is_file():raise RuntimeError('REAL_GLB_MISSING')
folder.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(path))
mesh_objs=[obj for obj in bpy.context.scene.objects if obj.type=='MESH']
if len(mesh_objs)<10:raise RuntimeError('Missing meaningful native GLB meshes')
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.device='CPU'
scene.cycles.samples=12
scene.render.resolution_x=800
scene.render.resolution_y=1000
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
scene.render.use_file_extension=True
world=bpy.data.worlds.new('ECOMECH_STUDIO_QA_WORLD')
scene.world=world;world.use_nodes=True
background=world.node_tree.nodes.get('Background')
background.inputs['Color'].default_value=(.023,.043,.07,1)
background.inputs['Strength'].default_value=.75
floor=bpy.data.materials.new('QA_NEUTRAL_FLOOR')
floor.use_nodes=True
p=floor.node_tree.nodes.get('Principled BSDF')
p.inputs['Base Color'].default_value=(.028,.045,.06,1)
p.inputs['Metallic'].default_value=.35;p.inputs['Roughness'].default_value=.27
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.095))
ground=bpy.context.object;ground.name='QA_GROUND_ONLY_NOT_MODEL'
ground.data.materials.append(floor)
def area(name,xyz,power,color,size):
    ld=bpy.data.lights.new(name,type='AREA')
    ld.energy=power;ld.color=color;ld.shape='DISK';ld.size=size
    obj=bpy.data.objects.new(name,ld);scene.collection.objects.link(obj)
    obj.location=xyz
    obj.rotation_euler=(Vector((0,0,1.3))-obj.location).to_track_quat('-Z','Y').to_euler()
for specs in [
 ('soft_white',(-3,-4,6),1100,(.83,.94,1.0),6),
 ('emerald_fill',(4,-3,3.5),580,(.35,1,.7),4),
 ('cyan_rim',(1.3,3.0,4),820,(.34,.7,1),3),
 ('warm_copper',(-2.8,1,2.5),310,(1,.79,.6),3)
]:area(*specs)
cam=bpy.data.cameras.new('QA_ORTHOGRAPHIC_CAMERA')
camera=bpy.data.objects.new('QA_ORTHOGRAPHIC_CAMERA',cam);scene.collection.objects.link(camera)
scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=3.05
target=Vector((0,0,1.34))
directions=[
 ('front',(0,-5,2.4)),('three_quarter',(-3.6,-5,2.5)),
 ('side',(-5,0,2.5)),('back',(0,5,2.5))
]
views=os.getenv('ECOMECH_RENDER_VIEWS','front,three_quarter,side,back').split(',')
completed=[]
for name,loc in directions:
    if name not in views:continue
    camera.location=loc
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(folder/('ECOMECH_SCULPT_ACTUAL_'+name+'.png'))
    bpy.ops.render.render(write_still=True)
    output=Path(scene.render.filepath)
    if not output.is_file() or output.stat().st_size<5000:raise RuntimeError('Real Blender QA render was not saved: '+name)
    completed.append({'view':name,'bytes':output.stat().st_size})
print('ECOMECH_REAL_CPU_CYCLES_VIEWS',json.dumps(completed),flush=True)
