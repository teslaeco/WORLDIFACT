"""Blender-only fixed script; never executes any text provided by a user or Astra.
Preserves the original input GLB. No voxel repairs, invented physical scale or
MAKE certification. Produces PBR and clay evidence of the same real geometry.
"""
import bpy,hashlib,json,math,os,sys,time
from pathlib import Path
from mathutils import Vector
arguments=sys.argv[sys.argv.index('--')+1:]
if len(arguments) not in (2,4) or (len(arguments)==4 and
        (arguments[2]!='--checkpoint-acks' or arguments[3] not in ('--owner-profile=robot','--owner-profile=halloween'))):
    raise ValueError('INVALID_EXPORT_ARGUMENTS')
source,out=map(Path,arguments[:2])
checkpoint_acks=len(arguments)==4
profile=arguments[3].split('=',1)[1] if checkpoint_acks else None

def file_hash(path):
    checksum=hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):checksum.update(chunk)
    return checksum.hexdigest()

def checkpoint(path):
    if not checkpoint_acks:return
    directory=out/'.checkpoints';directory.mkdir(exist_ok=True)
    ready=directory/(path.name+'.ready');pending=directory/(path.name+'.tmp')
    if ready.exists():raise ValueError('DUPLICATE_EXPORT_CHECKPOINT')
    payload={'filename':path.name,'bytes':path.stat().st_size,'sha256':file_hash(path)}
    with pending.open('x') as stream:
        json.dump(payload,stream);stream.flush();os.fsync(stream.fileno())
    pending.replace(ready)
    # The parent writes ACK only after the immutable artifact + its receipt
    # reach private storage. Never start expensive renders before that ACK.
    ack=directory/(path.name+'.ack');until=time.monotonic()+120
    while not ack.is_file():
        if time.monotonic()>=until:raise TimeoutError('EXPORT_CHECKPOINT_ACK_TIMEOUT')
        time.sleep(.1)

raw=source.read_bytes()
if raw[:4]!=b'glTF' or len(raw)>256*1024*1024:raise ValueError('INVALID_SOURCE_GLB')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source.resolve()))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
if not meshes or sum(len(o.data.polygons) for o in meshes)<4:raise ValueError('NO_MESH')
if checkpoint_acks:
    # The pinned DRTK export's V convention was checked against the original
    # owner references in OWNER_MODEL_SHOWCASE_20261017. Correct this derivative
    # once; the durably saved native GLB remains untouched.
    for mesh in {ob.data for ob in meshes}:
        for layer in mesh.uv_layers:
            for loop in layer.data:loop.uv.y=1-loop.uv.y
scene_report={'profile':profile,'composition':'NATIVE_CHARACTER',
    'nativeOriginalPreservedSeparately':True,'visualAccepted':False,
    'printReady':False,'supplierAccepted':False,
    'nativeUvCorrection':'V_TO_ONE_MINUS_V_ONCE' if checkpoint_acks else 'NONE'}
if profile=='halloween':
    from owner_scene_v3 import build_halloween_scene
    scene_report.update(build_halloween_scene(meshes))
    scene_report.update({'profile':profile,'composition':'NATIVE_CHARACTER_WITH_MODELED_ROOM',
        'nativeOriginalPreservedSeparately':True,'visualAccepted':False,
        'printReady':False,'supplierAccepted':False})
    meshes=[bpy.data.objects[name] for name in scene_report['model_object_names']]
    if not meshes or any(ob.type!='MESH' for ob in meshes):raise ValueError('INVALID_SCENE_MODEL_OBJECTS')
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
checkpoint(out/'game.glb')
if checkpoint_acks:
    (out/'scene-report.json').write_text(json.dumps(scene_report,indent=2)+'\n')
    checkpoint(out/'scene-report.json')
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=8
scene.render.resolution_x=512;scene.render.resolution_y=640;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
world=bpy.data.worlds.new('QA world');scene.world=world;world.use_nodes=True
world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.6
for label,pos,power in [('Key',(-3,-4,4),1300),('Fill',(3,-2,2),650),('Rim',(1,3,3),1000)]:
    light=bpy.data.lights.new(label,'AREA');light.energy=power*span*span if profile else power;light.size=span*3
    obj=bpy.data.objects.new(label,light);scene.collection.objects.link(obj)
    obj.location=center+Vector(pos)*span;obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
cam=bpy.data.objects.new('QA camera',bpy.data.cameras.new('QA camera'));scene.collection.objects.link(cam);scene.camera=cam
cam.data.type='ORTHO';cam.data.ortho_scale=span*1.5
cam.location=center+Vector((0,-3,.15))*span
cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
materials={ob.name:list(ob.data.materials) for ob in meshes}
clay=bpy.data.materials.new('QA neutral clay');clay.diffuse_color=(.5,.5,.5,1)
qa={'sourceSha256':hashlib.sha256(raw).hexdigest(),'meshObjects':len(meshes),
    'triangles':sum(len(p.vertices)-2 for ob in meshes for p in ob.data.polygons),
    'boundsNativeUnits':[list(lo),list(hi)],'physicalScaleConfirmed':False,
    'visualAccepted':False,'printReady':False,'supplierAccepted':False,
    'selfIntersections':'NOT_CERTIFIED','wallThickness':'NOT_CERTIFIED','views':{}}
if checkpoint_acks:
    (out/'qa.initial.json').write_text(json.dumps({**qa,'renderStatus':'PENDING'},indent=2)+'\n')
    checkpoint(out/'qa.initial.json')
# Save the textured, embedded source project BEFORE any render. A render
# timeout must not erase the usable project or leave only a clay material.
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str((out/'source.blend').resolve()))
checkpoint(out/'source.blend')
for kind in ('pbr','clay'):
    if kind=='clay':
        for ob in meshes:
            for i in range(len(ob.data.materials)):ob.data.materials[i]=clay
            if not len(ob.data.materials):ob.data.materials.append(clay)
    for view,yaw in [('front',0),('three_quarter',30),('side',90),('back',180)]:
        angle=math.radians(yaw);cam.location=center+Vector((math.sin(angle)*3,-math.cos(angle)*3,.15))*span
        cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
        path=out/f'{kind}_{view}.png';scene.render.filepath=str(path.resolve());bpy.ops.render.render(write_still=True)
        qa['views'][f'{kind}_{view}']={'sha256':file_hash(path),'bytes':path.stat().st_size}
        checkpoint(path)
for ob in meshes:
    ob.data.materials.clear()
    for mat in materials[ob.name]:ob.data.materials.append(mat)
(out/'qa.json').write_text(json.dumps(qa,indent=2)+'\n')
checkpoint(out/'qa.json')
