# WORLDIFACT Ultra: honest native Blender refinement of confirmed Astra job.
# Every new mesh belongs to this deterministic Blender detail pass; no extra OpenAI calls.
import bpy,math,random,sys,hashlib,json,os
from pathlib import Path
from mathutils import Vector
random.seed(68145)
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
if len(args)<2: raise RuntimeError("Usage: blender --background --python script -- ORIGINAL_ASTRA.glb OUTDIR")
original=Path(args[0]).resolve()
out=Path(args[1]).resolve()
out.mkdir(parents=True,exist_ok=True)
EXPECTED='7e7f3aea755dfdd0ad957124d7e1dc33004905e0052fdab3d60b587f34cdc7b4'
if not original.exists() or hashlib.sha256(original.read_bytes()).hexdigest()!=EXPECTED:
 raise RuntimeError('Astra original GLB absent/mismatched: do not substitute demonstration geometry.')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(original))
base=list(bpy.context.scene.objects)
oldtris=sum(sum(len(poly.vertices)-2 for poly in obj.data.polygons) for obj in base if obj.type=='MESH')
if not 39000<=oldtris<=45000: raise RuntimeError('Original Blender import triangle count outside verified expected conversion range: '+str(oldtris))
print('ASTRA_ORIGINAL_ACCEPTED',oldtris,EXPECTED,flush=True)

# Game-asset PBR definitions and emissive material slots. No physically approved MAKE.
MATERIALS={
 'emerald':((.02,.23,.09,1),.76,.22),'cobalt':((.02,.13,.36,1),.74,.21),
 'graphite':((.045,.07,.095,1),.86,.31),'steel':((.27,.35,.40,1),.9,.24),
 'copper':((.55,.23,.075,1),.92,.26),'gasket':((.015,.023,.032,1),.18,.52),
 'cyan':((.03,.82,.92,1),.24,.21),'green_led':((.035,.9,.21,1),.13,.16),
 'chili':((.028,.48,.035,1),.10,.24),
}
mats={}
for name,(rgba,metal,rough) in MATERIALS.items():
 m=bpy.data.materials.new('WORLDIFACT_ULTRA_'+name.upper())
 m.diffuse_color=rgba;m.use_nodes=True
 shader=m.node_tree.nodes.get('Principled BSDF')
 shader.inputs['Base Color'].default_value=rgba
 shader.inputs['Metallic'].default_value=metal
 shader.inputs['Roughness'].default_value=rough
 if name in ('cyan','green_led'):
  shader.inputs['Emission Color'].default_value=rgba
  shader.inputs['Emission Strength'].default_value=3.8
 mats[name]=m
class Batch:
 def __init__(self,name,material):self.name=name;self.material=material;self.vertices=[];self.triangles=[]
 def tube(self,path,radius=.006,sides=10,closed=False):
  path=[Vector(v) for v in path]
  n=len(path)
  if n<2:return
  base=len(self.vertices)
  for i,p in enumerate(path):
   tangent=(path[(i+1)%n]-path[(i-1)%n]) if closed else (path[min(n-1,i+1)]-path[max(0,i-1)])
   if tangent.length<1e-10:tangent=Vector((0,0,1))
   tangent.normalize()
   ref=Vector((0,0,1)) if abs(tangent.z)<.91 else Vector((0,1,0))
   u=tangent.cross(ref);u.normalize()
   v=tangent.cross(u);v.normalize()
   for j in range(sides):
    angle=2*math.pi*j/sides
    vert=p+radius*(math.cos(angle)*u+math.sin(angle)*v)
    self.vertices.append(tuple(vert))
  for i in range(n if closed else n-1):
   other=(i+1)%n
   for k in range(sides):
    nxt=(k+1)%sides
    a=base+i*sides+k;d=base+i*sides+nxt
    bb=base+other*sides+k;c=base+other*sides+nxt
    self.triangles.append((a,bb,c));self.triangles.append((a,c,d))
 def torus(self,c,major=.07,minor=.004,segments=96,sides=12,axis='Y'):
  x,y,z=c;path=[]
  for i in range(segments):
   t=i*math.tau/segments;co=math.cos(t)*major;si=math.sin(t)*major
   path.append((x+co,y,z+si) if axis=='Y' else (x,y+co,z+si) if axis=='X' else (x+co,y+si,z))
  self.tube(path,minor,sides,True)
 def capsule(self,a,b,r=.02,steps=12,sides=10):
  p=Vector(a);q=Vector(b)
  self.tube([p.lerp(q,i/(steps-1)) for i in range(steps)],r,sides)
 def prism(self,center,size):
  x,y,z=center;dx,dy,dz=[s*.5 for s in size]
  verts=[(x+dx*a,y+dy*bb,z+dz*c) for a,bb,c in
         [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
  start=len(self.vertices);self.vertices.extend(verts)
  for a,bb,c,d in [(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]:
   self.triangles.extend([(start+a,start+bb,start+c),(start+a,start+c,start+d)])
 def finish(self):
  if not self.triangles:return 0
  mesh=bpy.data.meshes.new('GEOMETRY_'+self.name)
  mesh.from_pydata(self.vertices,[],self.triangles);mesh.update()
  obj=bpy.data.objects.new(self.name,mesh)
  bpy.context.scene.collection.objects.link(obj)
  mesh.materials.append(mats[self.material])
  # Native UV coordinates support physically meaningful later PBR maps.
  layer=mesh.uv_layers.new(name='WORLDIFACT_UV')
  projected=[(v[0]*3.5,v[2]*3.5) for v in self.vertices]
  for loop in mesh.loops:layer.data[loop.index].uv=projected[loop.vertex_index]
  count=len(self.triangles);self.vertices=[];self.triangles=[]
  return count
MOTORS=[(.245,-.10,.40),(.26,-.19,.56),(.26,-.18,.76),(.255,-.12,.96),
(.24,-.17,1.12),(.23,-.11,1.32),(.255,-.23,1.50),(.23,-.17,1.68),
(.22,-.16,1.84),(.26,-.11,1.99),(.46,-.10,1.89),(.51,-.08,1.73),
(.53,-.09,1.56),(.52,-.12,1.40),(.26,.11,.63),(.25,.07,1.06)]
def motors(detail):
 hi=detail=='ultra';segments=108 if hi else 28;sides=12 if hi else 7
 turns=32 if hi else 10
 for idx,(x,y,z) in enumerate(MOTORS):
  wire=Batch('MECH_STATOR_COPPER_WINDINGS_%02d'%idx,'copper')
  rotor=Batch('MECH_ROTOR_HOUSING_%02d'%idx,'graphite')
  bearing=Batch('MECH_BEARING_%02d'%idx,'steel')
  radius=.049 if idx<10 else .039
  for j in range(turns):
   depth=(j/max(1,turns-1)-.5)*.088
   wire.torus((x,y+depth,z),radius+.002*math.sin(j*2.4),
              .00145 if hi else .0023,segments,sides,'Y')
  for R in (radius*.53,radius*.79,radius*1.2):
   rotor.torus((x,y-.051,z),R,.0055,segments,sides,'Y')
   bearing.torus((x,y+.052,z),R,.0044,segments,sides,'Y')
  blades=24 if hi else 12
  for k in range(blades):
   angle=math.tau*k/blades
   rotor.prism((x+(radius+.019)*math.cos(angle),y-.008,z+(radius+.019)*math.sin(angle)),
               (.013,.071,.006))
  for k in range(12):
   a=k*math.tau/12
   xx=x+.072*math.cos(a);zz=z+.072*math.sin(a)
   bearing.capsule((xx,y-.05,zz),(xx,y+.05,zz),.0028,6,8 if hi else 6)
  for group in (wire,rotor,bearing):group.finish()
def harness(detail):
 hi=detail=='ultra'
 cables=Batch('MECH_ROUTED_POWER_AND_SIGNAL_CABLES','graphite')
 num=140 if hi else 34;steps=100 if hi else 26;sides=12 if hi else 6
 for i in range(num):
  z=.29+(i%75)/74*1.69;x=.23+.09*math.sin(i*2.37)
  y=-.12-.015*(i%7);span=.18+.09*(i%4)/4
  pts=[]
  for j in range(steps):
   t=j/(steps-1);bend=math.sin(math.pi*t)
   pts.append((x+.05*math.sin(2.4*t+i*.21)+bend*.035,
               y-.05*bend*math.sin(i*1.3),
               z+span*t+.012*math.sin(4*math.pi*t+i*.47)))
  cables.tube(pts,.0023+(i%3)*.00035,sides)
 cables.finish()
 for j in range(4):
  led=Batch('LED_ACTIVE_FIBRE_OPTIC_%02d'%j,'cyan' if j%2 else 'green_led')
  for i in range(22 if hi else 9):
   length=110 if hi else 34;x=.16+j*.034+(i%5)*.003
   y=-.26-.02*(i%4);z=.40+j*.38
   led.tube([(x+.018*math.sin(t*math.pi*3+i),
              y-.016*math.sin(t*math.pi*2+j),z+t*.47)
             for t in [k/(length-1) for k in range(length)]],
            .0018,10 if hi else 6)
  led.finish()
def fasteners(detail):
 hi=detail=='ultra';segments=44 if hi else 14;sides=9 if hi else 6
 total=600 if hi else 105
 groups=[Batch('ARMOR_VISIBLE_PRECISION_FASTENERS_%02d'%j,'steel') for j in range(5)]
 zones=[(-.29,-.21,.45,.25,.10),(-.31,-.2,1.03,.23,.13),(-.46,-.18,1.7,.27,.10),
        (-.25,-.25,1.75,.32,.17),(-.08,-.19,2.30,.09,.08)]
 for i in range(total):
  index=i%5;cx,cy,cz,height,width=zones[index];a=(i//5)*2.39996323
  z=cz+height*math.sin(a);x=cx+width*math.cos(a);y=cy-abs(.014*math.sin(i*.67))
  groups[index].torus((x,y,z),.0035 if index!=4 else .002,.0011,segments,sides,'Y')
 for group in groups:group.finish()
def armoured_laminations(detail):
 hi=detail=='ultra';layers=7 if hi else 3
 for label,cx,cy,cz,dx,dz in [
   ('CHEST',-.25,-.257,1.75,.30,.43),('THIGH',-.275,-.204,1.07,.20,.30),
   ('SHIN',-.275,-.183,.50,.18,.42),('FOREARM',-.45,-.17,1.62,.18,.31),
   ('SHOULDER',-.43,-.17,1.96,.25,.18)]:
  green=Batch('ARMOR_'+label+'_MULTILAYER_PHYSICAL_PANELS','emerald')
  blue=Batch('ARMOR_'+label+'_COBALT_INSERTS','cobalt')
  for i in range(60 if hi else 15):
   band=i%layers;a=i*2.39996323
   x=cx+dx*.42*math.sin(a);z=cz+dz*.45*math.cos(a);y=cy-.005*band
   width=.027*(1+.4*math.sin(i*.93));height=.033*(1+.2*math.sin(i*1.74))
   (blue if i%7==0 else green).prism((x,y,z),(width,.015,height))
  for batch in (green,blue):batch.finish()
  led=Batch('ARMOR_'+label+'_PHYSICAL_CYAN_EDGE_LIGHT','cyan')
  led.capsule((cx-dx*.4,cy-.032,cz-dz*.4),
              (cx-dx*.37,cy-.036,cz+dz*.42),.003,120 if hi else 28,10 if hi else 6)
  led.finish()
def joint_gears(detail):
 hi=detail=='ultra';group=Batch('MECH_VISIBLE_GEAR_TEETH_AND_BEARINGS','steel')
 joints=[(.23,-.14,.75),(.22,-.18,1.2),(.46,-.14,1.49),
         (.48,-.16,1.94),(-.22,-.2,.76),(-.28,-.1,1.21)]
 for x,y,z in joints:
  teeth=72 if hi else 22
  for i in range(teeth):
   a=i*math.tau/teeth
   group.prism((x+.076*math.cos(a),y-.04,z+.076*math.sin(a)),(.012,.02,.014))
  for radius in (.05,.064,.084):
   group.torus((x,y,z),radius,.004,96 if hi else 28,12 if hi else 6,'Y')
 group.finish()
def chili_surface(detail):
 hi=detail=='ultra';ch=Batch('CHILI_PHYSICAL_SCULPTED_SURFACE_RIBS','chili')
 length=110 if hi else 30
 for i in range(18 if hi else 7):
  angle=math.tau*i/(18 if hi else 7)
  path=[]
  for j in range(length):
   t=j/(length-1);r=.039*(1-.65*t)
   path.append((.81+r*math.cos(angle)+.03*math.sin(t*math.pi),
                -.11+r*math.sin(angle),2.43+.32*t))
  ch.tube(path,.0017,10 if hi else 6)
 ch.finish()
def enrich(level):
 armoured_laminations(level);motors(level);joint_gears(level)
 harness(level);fasteners(level);chili_surface(level)

enrich('preview')
preview=out/'ECOMECH_ASTRA_BLENDER_MOBILE_LOD.glb'
bpy.ops.export_scene.gltf(filepath=str(preview),export_format='GLB',
                          export_texcoords=True,export_normals=True,export_materials='EXPORT')
print('MOBILE_PREVIEW_BYTES',preview.stat().st_size,flush=True)
for obj in list(bpy.context.scene.objects):
 if obj not in base:bpy.data.objects.remove(obj,do_unlink=True)
enrich('ultra')
triangles=sum(max(0,len(p.vertices)-2) for obj in bpy.context.scene.objects
              if obj.type=='MESH' for p in obj.data.polygons)
print('WORLDIFACT_ULTRA_TRIANGLES',triangles,flush=True)
if not (2_000_000<=triangles<=3_000_000):
 raise RuntimeError('Truthful high-poly geometry is outside required range: '+str(triangles))
scene=bpy.context.scene
scene.render.engine='BLENDER_WORKBENCH'
scene.render.resolution_x=1000;scene.render.resolution_y=1050
scene.render.resolution_percentage=100
bpy.ops.object.camera_add(location=(-4.2,-6.8,3.45))
camera=bpy.context.object;camera.name='ULTRA_QA_CAM'
camera.rotation_euler=(Vector((0,0,1.3))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=3.8
scene.camera=camera
scene.display.shading.light='STUDIO'
scene.display.shading.color_type='MATERIAL'
try:scene.display.shading.studio_light='paint.sl'
except Exception:pass
scene.render.filepath=str(out/'ECOMECH_ACTUAL_ULTRA_GEOMETRY.png')
if os.getenv('ECOMECH_HEADLESS_RENDER')=='true':
 try:bpy.ops.render.render(write_still=True)
 except Exception as error:print('Render unavailable:',str(error)[:120],flush=True)
else:print('QA_RENDER_DEFERRED_NO_EGL; original GLB and editable exports take priority.',flush=True)
blend=out/'ECOMECH_ASTRA_BLENDER_ULTRA_EDITABLE.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=False)
glb=out/'ECOMECH_ASTRA_BLENDER_ULTRA_GAME.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',
                          export_texcoords=True,export_normals=True,export_materials='EXPORT')
fbx=out/'ECOMECH_ASTRA_BLENDER_ULTRA.fbx'
bpy.ops.export_scene.fbx(filepath=str(fbx),use_selection=False,axis_forward='-Z',axis_up='Y',
                         path_mode='COPY',embed_textures=True)
obj=out/'ECOMECH_ASTRA_BLENDER_ULTRA.obj'
bpy.ops.wm.obj_export(filepath=str(obj),export_selected_objects=False,export_materials=True)
files=[preview,blend,glb,fbx,obj]
manifest={
 'revision':'worldifact-ecomech-blender-detail-v1',
 'sourceModel':'gpt-6-astra',
 'sourceOracleJob':'6fa9be43-f371-4bcd-8fe7-7a3ea9967855',
 'sourceGLBSha256':EXPECTED,'originalAstraTriangles':oldtris,
 'actualTriangles':triangles,'augmentation':'WORLDIFACT_NATIVE_BLENDER_MECHANICAL_PASS',
 'additionalPaidProviderRequests':0,'rigVerified':False,'printApproved':False,
 'manufacturingStatus':'UNREVIEWED','photorealism':'UNREVIEWED',
 'outputs':{p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files if p.exists()}
}
(out/'MANIFEST_ULTRA.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('ULTRA_DONE',json.dumps({'triangles':triangles,'sizes':{n:v['bytes'] for n,v in manifest['outputs'].items()}}),flush=True)
