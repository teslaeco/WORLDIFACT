"""Blender-only fixed script; never executes any text provided by a user or Astra.
Preserves the original input GLB. No voxel repairs, invented physical scale or
MAKE certification. Produces PBR and clay evidence of the same real geometry.
"""
import bpy,hashlib,json,math,sys
from pathlib import Path
from mathutils import Vector
source,out=map(Path,sys.argv[sys.argv.index('--')+1:])
raw=source.read_bytes()
if raw[:4]!=b'glTF' or len(raw)>256*1024*1024:raise ValueError('INVALID_SOURCE_GLB')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source.resolve()))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
if not meshes or sum(len(o.data.polygons) for o in meshes)<4:raise ValueError('NO_MESH')
points=[o.matrix_world @ Vector(v) for o in meshes for v in o.bound_box]
if not all(math.isfinite(x) for p in points for x in p):raise ValueError('NONFINITE_GEOMETRY')
lo=Vector(tuple(min(p[i] for p in points) for i in range(3)));hi=Vector(tuple(max(p[i] for p in points) for i in range(3)))
center=(lo+hi)/2;span=max(hi-lo)
if span<=0:raise ValueError('EMPTY_GEOMETRY')
# Never move, join or smooth the source to conceal missing mechanical geometry.
bpy.ops.object.select_all(action='DESELECT')
for ob in meshes:ob.select_set(True)
bpy.context.view_layer.objects.active=meshes[0]
bpy.ops.export_scene.gltf(filepath=str((out/'game.glb').resolve()),export_format='GLB',use_selection=True)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=8
scene.render.resolution_x=512;scene.render.resolution_y=640;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
world=bpy.data.worlds.new('QA world');scene.world=world;world.use_nodes=True
world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.6
for label,pos,power in [('Key',(-3,-4,4),1300),('Fill',(3,-2,2),650),('Rim',(1,3,3),1000)]:
    light=bpy.data.lights.new(label,'AREA');light.energy=power;light.size=span*3
    obj=bpy.data.objects.new(label,light);scene.collection.objects.link(obj)
    obj.location=center+Vector(pos)*span;obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
cam=bpy.data.objects.new('QA camera',bpy.data.cameras.new('QA camera'));scene.collection.objects.link(cam);scene.camera=cam
cam.data.type='ORTHO';cam.data.ortho_scale=span*1.5
materials={ob.name:list(ob.data.materials) for ob in meshes}
clay=bpy.data.materials.new('QA neutral clay');clay.diffuse_color=(.5,.5,.5,1)
qa={'sourceSha256':hashlib.sha256(raw).hexdigest(),'meshObjects':len(meshes),
    'boundsNativeUnits':[list(lo),list(hi)],'physicalScaleConfirmed':False,
    'visualAccepted':False,'printReady':False,'supplierAccepted':False,
    'selfIntersections':'NOT_CERTIFIED','wallThickness':'NOT_CERTIFIED','views':{}}
for kind in ('pbr','clay'):
    if kind=='clay':
        for ob in meshes:
            for i in range(len(ob.data.materials)):ob.data.materials[i]=clay
            if not len(ob.data.materials):ob.data.materials.append(clay)
    for view,yaw in [('front',0),('three_quarter',30),('side',90),('back',180)]:
        angle=math.radians(yaw);cam.location=center+Vector((math.sin(angle)*3,-math.cos(angle)*3,.15))*span
        cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
        path=out/f'{kind}_{view}.png';scene.render.filepath=str(path.resolve());bpy.ops.render.render(write_still=True)
        qa['views'][f'{kind}_{view}']={'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size}
for ob in meshes:
    ob.data.materials.clear()
    for mat in materials[ob.name]:ob.data.materials.append(mat)
bpy.ops.wm.save_as_mainfile(filepath=str((out/'source.blend').resolve()))
(out/'qa.json').write_text(json.dumps(qa,indent=2)+'\n')
