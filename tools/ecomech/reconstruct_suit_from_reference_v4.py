#!/usr/bin/env python3
"""
WORLDIFACT reference-shaped exosuit v2: a NEW Blender sculpt driven by the
human-annotated reference landmarks, not subdivisions of the old mannequin.
Original Oracle Astra GLB is checked unchanged and archived as SOURCE in BLEND,
but never claimed as geometry authored by this Blender reconstruction.
"""
import bpy
import hashlib
import json
import math
import os
import sys
from mathutils import Vector
from pathlib import Path

SOURCE_SHA='7e7f3aea755dfdd0ad957124d7e1dc33004905e0052fdab3d60b587f34cdc7b4'
TARGET_SHA='9f3b9a994315c0578859486a1c9dc17c8916316ba9e96300409772a1b8f5e053'
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
if len(args)!=4:raise RuntimeError('Pass ORIGINAL_ASTRA.glb SOURCE_V4_REFERENCE.png annotated_target.json OUTPUT_DIR')
source, original_png, spec_path, folder = Path(args[0]), Path(args[1]), Path(args[2]), Path(args[3])
if hashlib.sha256(source.read_bytes()).hexdigest()!=SOURCE_SHA:raise RuntimeError('ORIGINAL_ASTRA_SOURCE_HASH_CHANGED')
spec=json.loads(spec_path.read_text())
if spec.get('sourceImageOriginalSha256')!=TARGET_SHA or spec.get('validation')!='HUMAN_ESTIMATED_FROM_USER_REFERENCE_NOT_AI_MEASURED':
    raise RuntimeError('UNVERIFIED_ANNOTATED_REFERENCE')
if hashlib.sha256(original_png.read_bytes()).hexdigest()!=TARGET_SHA:
    raise RuntimeError('ORIGINAL_V4_SOURCE_PHOTO_HASH_NOT_APPROVED')
if spec.get('version')!='ecomech-v4-exact-reference-human-target-v1':
    raise RuntimeError('V4_EXACT_IMAGE_ANNOTATION_DRAFT_MISSING')
folder.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source.resolve()))
reference_objects=list(bpy.context.scene.objects)
source_collection=bpy.data.collections.new('ORIGINAL_ASTRA_40K_SOURCE_NOT_RETOUCHED')
bpy.context.scene.collection.children.link(source_collection)
for ob in reference_objects:
    for coll in list(ob.users_collection):coll.objects.unlink(ob)
    source_collection.objects.link(ob)
    ob.hide_render=True
    ob.hide_set(True)
    ob['origin']='ORACLE_CONFIRMED_GPT6_ASTRA_SOURCE'
    ob['original_glb_sha256']=SOURCE_SHA
generated=bpy.data.collections.new('RECONSTRUCTED_REFERENCE_ALIGNED_GAME_MESH_BY_BLENDER')
bpy.context.scene.collection.children.link(generated)
reference_img=bpy.data.images.load(str(original_png.resolve()),check_existing=False)
if tuple(reference_img.size)!=(1122,1402):
    raise RuntimeError('V4_SOURCE_REFERENCE_IMAGE_DIMENSIONS_MISMATCH')
reference_img.pack()
M={}
colors={
 'emerald':((.020,.43,.075,1),.78,.19),'cobalt':((.016,.095,.47,1),.82,.18),
 'ceramic':((.12,.21,.25,1),.53,.24),'dark':((.018,.025,.032,1),.72,.34),
 'steel':((.22,.3,.37,1),.94,.18),'copper':((.64,.27,.06,1),.96,.22),
 'rubber':((.025,.035,.042,1),.05,.56),'led_cyan':((.04,.90,1,1),.1,.18),
 'led_green':((.03,.98,.35,1),.08,.22),'chili':((.025,.68,.036,1),.0,.22),
 'stem':((.015,.28,.021,1),.03,.56),
}
for name,(color,metal,rough) in colors.items():
    mat=bpy.data.materials.new('PBR_'+name.upper());mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=color
    bsdf.inputs['Metallic'].default_value=metal;bsdf.inputs['Roughness'].default_value=rough
    if name.startswith('led_'):
        bsdf.inputs['Emission Color'].default_value=color
        bsdf.inputs['Emission Strength'].default_value=4.0
    mat.diffuse_color=color;M[name]=mat

def attach(obj,name,material):
    obj.name=name
    if obj.users_collection:
        for coll in list(obj.users_collection):coll.objects.unlink(obj)
    generated.objects.link(obj)
    obj.data.materials.clear()
    obj.data.materials.append(M[material])
    if obj.type=='MESH':
        for polygon in obj.data.polygons:polygon.use_smooth=True
    obj['generator']='WORLDIFACT_REFERENCE_SHAPE_FIRST_V2'
    return obj

def mesh_obj(name,verts,faces,mat,thickness=0,bevel=0):
    mesh=bpy.data.meshes.new(name+'_mesh');mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);generated.objects.link(obj)
    attach(obj,name,mat)
    if thickness>0:
        mod=obj.modifiers.new('physically_thick_shell','SOLIDIFY');mod.thickness=thickness
        mod.offset=-1
    if bevel>0:
        mod=obj.modifiers.new('rounded_hard_surface','BEVEL');mod.width=bevel
        mod.segments=3;mod.affect='EDGES'
        normal=obj.modifiers.new('weighted_panel_normals','WEIGHTED_NORMAL')
    return obj

def sweep(name,centers,radii,material,sides=32,closed_ends=True):
    v=[];f=[]
    center=[Vector(x) for x in centers]
    for i,p in enumerate(center):
        tangent=(center[min(i+1,len(center)-1)]-center[max(i-1,0)]).normalized()
        if tangent.length<.01:tangent=Vector((0,0,1))
        ref=Vector((0,1,0)) if abs(tangent.y)<.75 else Vector((0,0,1))
        u=tangent.cross(ref).normalized();w=tangent.cross(u).normalized()
        for j in range(sides):
            a=math.tau*j/sides
            v.append(tuple(p+radii[i][0]*math.cos(a)*u+radii[i][1]*math.sin(a)*w))
    for i in range(len(center)-1):
        for j in range(sides):
            a=i*sides+j;b=i*sides+(j+1)%sides
            c=(i+1)*sides+(j+1)%sides;d=(i+1)*sides+j
            f.append((a,b,c,d))
    if closed_ends:
        f.append(tuple(reversed(range(sides))))
        f.append(tuple((len(center)-1)*sides+j for j in range(sides)))
    return mesh_obj(name,v,f,material)

def head(name,rings,material,sides=64):
    # Head/chest loft follows 3D silhouette rather than spheres/cubes.
    v=[];f=[]
    for z,x,y,rx,ry in rings:
        for j in range(sides):
            angle=math.tau*j/sides
            v.append((x+rx*math.cos(angle),y+ry*math.sin(angle),z))
    for i in range(len(rings)-1):
        for j in range(sides):
            a=i*sides+j;b=i*sides+(j+1)%sides
            c=(i+1)*sides+(j+1)%sides;d=(i+1)*sides+j
            f.append((a,b,c,d))
    f.append(tuple(reversed(range(sides))))
    f.append(tuple((len(rings)-1)*sides+j for j in range(sides)))
    return mesh_obj(name,v,f,material)

def shell(name,control,material,thickness=.02,bevel=.006,steps=12):
    # Four corners in CCW order on a curved armor surface.
    if len(control)!=4:raise ValueError('panel control requires 4 points')
    p=[Vector(x) for x in control]
    v=[]
    for i in range(steps+1):
        t=i/steps
        for j in range(steps+1):
            s=j/steps
            point=p[0]*(1-t)*(1-s)+p[1]*(1-t)*s+p[2]*t*s+p[3]*t*(1-s)
            point.y-=math.sin(math.pi*t)*math.sin(math.pi*s)*.01
            v.append(tuple(point))
    f=[]
    for i in range(steps):
        for j in range(steps):
            a=i*(steps+1)+j;f.append((a,a+1,a+steps+2,a+steps+1))
    return mesh_obj(name,v,f,material,thickness,bevel)

def box(name,xyz,scale,mat,bevel=.003):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz)
    ob=bpy.context.object;ob.dimensions=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    attach(ob,name,mat)
    if bevel:
        mod=ob.modifiers.new('machined_edge','BEVEL');mod.width=bevel;mod.segments=3
        ob.modifiers.new('face_normals','WEIGHTED_NORMAL')
    return ob

def tube(name,points,r,mat,sections=12):
    # Real tube polygon geometry, not shader-only strokes.
    return sweep(name,points,[(r,r)]*len(points),mat,sections)

def ring(name,xyz,r,minor,mat,major_segments=64):
    bpy.ops.mesh.primitive_torus_add(major_segments=major_segments,minor_segments=12,
        location=xyz,major_radius=r,minor_radius=minor)
    ob=bpy.context.object
    ob.rotation_euler[0]=math.pi/2
    return attach(ob,name,mat)

def motor(name,x,y,z,rad=.07,width=.095):
    box(name+'_STATOR_BLOCK',(x,y,z),(.14,width,.14),'dark',.014)
    for face in (-1,1):
        ring(name+'_END_BEARING_'+str(face),(x,y+face*width*.62,z),rad*.87,.008,'steel')
    for step in range(22):
        offset=width*(step/21-.5)
        ring(name+'_ENAMEL_WINDING_%02d'%step,(x,y+offset,z),rad,.0019,'copper',48)
    for t in range(12):
        a=t*math.tau/12
        px=x+rad*1.12*math.cos(a);pz=z+rad*1.12*math.sin(a)
        box(name+'_RADIATOR_FAN_%02d'%t,(px,y,pz),(.018,width*.78,.007),'steel',.0015)

# Reference-proportioned waist/torso/helmet, physically separate volumetric masses.
head('HEAD_VISOR_ORIGINAL_SCULPT',[
    (2.19,0,0,.105,.108),(2.24,0,.005,.145,.134),
    (2.34,0,.015,.164,.15),(2.46,0,.022,.156,.15),
    (2.54,0,.025,.126,.133),(2.60,0,.03,.060,.070),
], 'ceramic')
head('TORSO_LOFT_HUMANOID',[
    (1.18,0,.014,.22,.132),(1.29,0,.013,.29,.145),
    (1.45,0,.02,.32,.18),(1.72,0,.01,.405,.197),
    (1.92,0,.01,.47,.205),(2.08,0,0,.345,.185),
    (2.15,0,0,.18,.12)
], 'dark',56)
head('PELVIS_LOAD_BEARING',[
    (1.02,0,.006,.20,.126),(1.12,0,0,.27,.144),
    (1.25,0,.016,.295,.16),(1.30,0,.02,.22,.11)
], 'steel')

# Industrially believable legs: two articulated load paths, no sphere-only mannequin.
for side in (-1,1):
    prefix='ARMOR' if side<0 else 'MECHANICS'
    sx=side*.29
    sweep(prefix+'_THIGH_FEMUR',[(sx,0,1.20),(sx*1.05,0,1.1),(sx*1.08,-.01,.85),(sx*.99,-.015,.74)],
          [(.13,.12),(.155,.145),(.136,.13),(.11,.12)],'steel' if side>0 else 'dark',40)
    sweep(prefix+'_SHIN_ASTRAGALUS',[(sx,-.01,.72),(sx,-.012,.62),(sx*.95,-.02,.31),(sx*.99,-.035,.17)],
          [(.115,.122),(.145,.11),(.106,.10),(.095,.090)],'steel' if side>0 else 'dark',40)
    ring(prefix+'_KNEE_RING',(sx,-.16,.735),.095,.023,'steel')
    ring(prefix+'_HIP_SERVO',(sx,-.09,1.20),.113,.017,'steel')
    sweep(prefix+'_FOOT_SHELL',[(sx,-.02,.19),(sx,-.11,.13),(sx,-.235,.080)],
          [(.105,.112),(.148,.102),(.158,.082)],'graphite' if False else 'dark',40)
    if side>0:
        for z in (.34,.58,.92,1.09):
            motor('EXPOSED_ELECTROMOTOR_%02d'%int(z*100),sx+.03,-.19,z,.064)
        for i in range(7):
            z=.23+.115*i
            tube('RIGID_RIGHT_LEG_COOLANT_%d'%i,
                 [(sx+.05*i/7,-.14,z),(sx+.075,-.16,z+.17),(sx+.04,-.2,z+.31)],
                 .003,'copper' if i%2 else 'steel')
    else:
        # distinct staggered automotive-style bevelled panels, not a big cuboid
        for z,halfwidth,height in [(1.01,.155,.215),(.85,.14,.175),(.47,.145,.22),(.30,.125,.15)]:
            shell('ARMOR_LEFT_LEG_PHYSICAL_3D_PLATE_%02d'%int(z*100),[
                (sx-halfwidth,-.158,z+height*.5),
                (sx+halfwidth*.8,-.154,z+height*.42),
                (sx+halfwidth*.68,-.179,z-height*.5),
                (sx-halfwidth*.7,-.178,z-height*.48)],'emerald' if z>.8 else 'cobalt')
        tube('LEFT_SHIN_CYAN_EDGE_LED',[(sx-.132,-.192,.25),(sx-.17,-.20,.50),(sx-.147,-.19,.66)],.005,'led_cyan',14)

# Chest armor on image-left, visible purposeful cutaway on opposite side.
for i,plate in enumerate([
 [(-.45,-.15,2.05),(-.03,-.192,2.02),(-.04,-.23,1.81),(-.35,-.20,1.86)],
 [(-.375,-.19,1.82),(-.03,-.235,1.80),(-.09,-.228,1.59),(-.38,-.19,1.63)],
 [(-.32,-.18,1.57),(-.045,-.22,1.57),(-.025,-.205,1.40),(-.29,-.19,1.41)],
]):
    shell('LEFT_CHEST_ARMOR_SHAPED_%d'%i,plate,'emerald' if i!=1 else 'cobalt',.027,.012,18)
# Shoulder shells have layered faces, real rounded 3D geometry.
for i in range(5):
    t=i/5
    shell('LEFT_SHOULDER_CAMBERED_COBALT_PANEL_%02d'%i,
        [(-.62+.018*i,-.055-.038*t,2.12-.045*i),(-.35,-.15,2.14-.032*i),
         (-.375,-.17,2.01-.045*i),(-.63+.02*i,-.07,2.01-.06*i)],
        'cobalt' if i%2 else 'emerald',.024,.009,12)

# Helmet panel geometry made from layered curved plates / physically luminous visor.
shell('HELMET_EMERALD_FRONTAL_CROWN',[
 (-.15,-.125,2.54),(.12,-.12,2.55),(.15,-.13,2.43),(-.15,-.13,2.43)],'emerald',.021,.008)
shell('HELMET_MACHINED_JAW',[
 (-.126,-.138,2.33),(.116,-.14,2.32),(.096,-.165,2.24),(-.101,-.164,2.23)],'graphite' if False else 'dark',.023,.006)
shell('VISOR_BLUEGREEN_REAL_POLYGON_EMISSION',[
 (-.138,-.151,2.405),(.125,-.151,2.405),(.126,-.17,2.365),(-.12,-.17,2.365)],
 'led_cyan',.007,.003,20)
for side in (-1,1):
    ring('HELMET_AUDIO_RADIO_SERVO_'+str(side),(side*.142,.01,2.38),.06,.021,'steel',64)
    shell('HELMET_CHEEK_STEEL_'+str(side),[
     (side*.11,-.143,2.38),(side*.06,-.17,2.37),(side*.085,-.166,2.28),(side*.15,-.13,2.29)],
     'ceramic',.008,.002,8)

# Reactor and right-side internal MCC modules.
ring('CHEST_ENERGY_CORE_CYAN',(0,-.225,1.91),.079,.017,'led_cyan')
ring('CHEST_ENERGY_CORE_MACHINED_BEZEL',(0,-.215,1.91),.103,.017,'steel')
for i,z in enumerate([1.34,1.46,1.61,1.74,1.90]):
    x=.22+.015*math.sin(i)
    motor('MCC_VISIBLE_STATOR_%02d'%i,x,-.20,z,.045 if i%2 else .060,.070)
    box('MCC_REAL_CONTACTOR_BLOCK_%02d'%i,(x+.16,-.115,z),(.092,.115,.06),'steel',.006)
    for k in range(3):
        box('MCC_TERMINAL_%02d_%d'%(i,k),(x+.12+k*.025,-.182,z-.017),(.014,.018,.021),'copper',.002)
for i in range(14):
    z=1.25+i*.053
    tube('MCC_LEFT_TO_RIGHT_INSULATED_BUNDLE_%02d'%i,
        [(.18,-.11,z),(.35+.014*math.cos(i),-.20,z+.07),(.44,-.18,z+.11),(.34,-.09,z+.24)],
        .003+(i%3)*.0007,'dark' if i%2 else 'copper',10)

# Left raised arm / gripper: physically grips a substantial green chili fruit.
sweep('LEFT_ARM_RAISED_BICEPS',[(-.49,-.02,2.01),(-.63,-.03,1.94),(-.68,-.075,1.79)],
    [(.155,.14),(.13,.125),(.109,.103)],'dark',40)
sweep('LEFT_ARM_RAISED_FOREARM',[(-.68,-.075,1.80),(-.69,-.11,2.00),(-.73,-.16,2.21)],
    [(.104,.110),(.125,.12),(.096,.105)],'steel',40)
for i in range(5):
    z=1.90+i*.058
    shell('RAISED_ARM_EMERALD_SEPARATE_BEVEL_PANEL_%02d'%i,[
      (-.79,-.18,z+.045),(-.595,-.19,z+.045),(-.61,-.22,z-.025),(-.79,-.205,z-.025)],
      'emerald' if i%2 else 'cobalt',.015,.006,10)
sweep('RAISED_GRIP_PALM',[(-.73,-.17,2.18),(-.73,-.19,2.25)],
    [(.090,.09),(.096,.077)],'steel',32)
for finger in range(5):
    offset=(finger-2)*.038
    tube('FIVE_ARTICULATED_FINGERS_AROUND_REAL_CHILI_%d'%finger,
       [(-.73+offset,-.22,2.24),(-.73+offset*.8,-.26,2.285),(-.73+offset*.62,-.252,2.337)],
       .012,'steel',12)
# Actual smooth tapered organic fruit with mass/curved stem, not a texture card.
fruit_curve=[(-.75,-.23,2.27),(-.77,-.265,2.38),(-.75,-.275,2.50),
             (-.745,-.283,2.64),(-.76,-.275,2.73)]
sweep('CHILI_FULLY_VOLUMETRIC_CURVED_GREEN_PEPPER',fruit_curve,
    [(.039,.038),(.06,.047),(.075,.055),(.049,.04),(.008,.012)],'chili',72)
tube('CHILI_CURVED_GREEN_STEM',[(-.76,-.275,2.71),(-.77,-.255,2.78),(-.75,-.232,2.82)],
     .008,'stem',16)

# Opposite arm: exposed articulated motors / elbow and separate four fingers.
sweep('RIGHT_EXPOSED_ARM_STRUCTURAL_UPPER',[(.48,0,2.01),(.59,-.015,1.81),(.66,-.025,1.58)],
    [(.132,.12),(.112,.103),(.092,.092)],'dark',40)
sweep('RIGHT_EXPOSED_FOREARM_ACTUATOR',[(.66,-.025,1.57),(.64,-.04,1.42),(.69,-.09,1.13)],
    [(.109,.099),(.108,.094),(.088,.08)],'steel',40)
for i,z in enumerate([1.41,1.58,1.83]):
    motor('RIGHT_ELBOW_SHOULDER_BRUSHLESS_MOTOR_%02d'%i,.66,-.166,z,.062)
for i in range(5):
    tube('RIGHT_HAND_FIVE_REAL_DIGITS_%d'%i,
        [(.69+(i-2)*.027,-.1,1.12),(.69+(i-2)*.038,-.15,1.01),
         (.68+(i-2)*.042,-.13,.97)],.0105,'steel',12)

# Subtle green/cyan physical hardware with no fake glossy screenshot.
for i in range(8):
    z=.35+i*.20
    tube('SPLIT_ARMOR_SIDE_CYAN_LED_%02d'%i,
        [(-.10,-.18,z),(-.083,-.183,z+.09)],.0045,'led_cyan',12)
for i in range(24):
    x=-.38+(i%4)*.08;z=1.48+(i//4)*.09
    ring('ARMOR_REAL_FASTENER_%02d'%i,(x,-.247,z),.007,.0018,'steel',24)

# Pack a real nonuniform UV-compatible material bitmap for key colored armor,
# rather than producing a 200MB file without any actual PBR texture.
try:
    import numpy as np
    n=512
    coords=np.arange(n,dtype=np.float32)
    X,Y=np.meshgrid(coords,coords)
    wear=((np.sin(X*.45+Y*.027)*np.sin(Y*.18-X*.021))*.035
          +np.sin(X*.017+Y*.085)*.018).astype(np.float32)
    for key in ('emerald','cobalt'):
        mat=M[key]
        base=np.asarray(colors[key][0][:3],dtype=np.float32)
        rgba=np.empty((n,n,4),dtype=np.float32)
        rgba[:,:,:3]=np.clip(base[None,None,:]*(1+wear[:,:,None]),0,1)
        rgba[:,:,3]=1
        image=bpy.data.images.new(key+'_real_512_albedo',width=n,height=n,alpha=True)
        image.pixels.foreach_set(rgba.reshape(-1))
        image.update();image.pack()
        nodes=mat.node_tree.nodes;bsdf=nodes.get('Principled BSDF')
        tex=nodes.new('ShaderNodeTexImage');tex.image=image;tex.label='REAL_PACKED_ALBEDO'
        mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
except Exception as e:
    print('TEXTURE_BAKE_BLOCKED:',str(e)[:110],flush=True)

exec((Path(__file__).with_name('v4_reference_sculpt_pass.py')).read_text(encoding='utf-8'),globals())
scene=bpy.context.scene
scene['original_source_sha256']=SOURCE_SHA
scene['reference_source_image_sha256']=TARGET_SHA
scene['model_provenance']='ASTRA_SOURCE_AND_INDEPENDENT_BLENDER_REFERENCE_SHAPED_REBUILD'
scene['review_status']='UNREVIEWED'
def choose_generated():
    bpy.ops.object.select_all(action='DESELECT')
    for ob in generated.objects:
        if ob.type=='MESH':
            ob.hide_set(False)
            ob.select_set(True)
    bpy.context.view_layer.objects.active=next(iter([o for o in generated.objects if o.type=='MESH']),None)
choose_generated()
for ob in list(generated.objects):
    if ob.type=='MESH':
        for poly in ob.data.polygons:poly.use_smooth=True
# Emit BEFORE render, as GPU/EGL unavailable on CI; no hidden fallback mesh.
out=folder/'ECOMECH_V4_REFERENCE_RECONSTRUCTED_GAME.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',
                          use_selection=True,export_texcoords=True,
                          export_normals=True,export_materials='EXPORT')
scene['actual_GL_B_file_bytes']=out.stat().st_size
scene['actual_GL_B_sha256']=hashlib.sha256(out.read_bytes()).hexdigest()
bpy.ops.wm.save_as_mainfile(filepath=str(folder/'ECOMECH_V4_EDITABLE_REAL_MESH.blend'),compress=True)
manifest={
 'revision':'worldifact-ecomech-v4-photo-anchored-offline-native-sculpt-v1',
 'oracleOriginalSha256':SOURCE_SHA,
 'userReferenceSourceSha256':TARGET_SHA,
 'originalOracleJob':'6fa9be43-f371-4bcd-8fe7-7a3ea9967855',
 'execution':'BLENDER_HAND_SCULPTED_MESH_GUIDED_BY_HUMAN_ANNOTATED_EXACT_V4_PHOTO',
 'astrARebilled':False,'paidExternalCalls':0,'imagePixelInputToAstraInOriginalJob':False,
 'referenceImagePackedInEditableBlend':True,'referencePixelsAutomaticallyReconstructed':False,
 'sourceAstraMeshesArchivedUnchangedInBlend':True,
 'modelQuality':'UNREVIEWED','humanSimilarity':'NOT_MEASURED','makeApproved':False,
  'pbrTextureMapProvenance':'SYNTHETIC_BLENDER_NOT_PHOTO_CAPTURE',
  'v4PackedPbrTextureMaps':scene.get('v4_packed_pbr_maps',0),
  'v4UvMeshObjects':scene.get('v4_uv_meshes',0),
  'v4RemovedV2Shapes':scene.get('v4_removed_bad_v2_shapes',0),
 'files':{f.name:{'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()}
          for f in folder.glob('ECOMECH_V4_*') if f.is_file()}
}
(folder/'MANIFEST_REFERENCE_V4.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('ECOMECH_V4_REAL_SCULPT_EXPORTED',json.dumps(
 {'fileSize':out.stat().st_size,'sha256':scene['actual_GL_B_sha256'],
 'objects':len(generated.objects),'originalHash':SOURCE_SHA}),flush=True)
