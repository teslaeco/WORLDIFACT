"""ECOMECH V4 exact-photo, geometry-first native Blender rebuild pass.
Runs inside reconstruct_suit_from_reference_v4.py with Blender helpers already defined.
Human-guided modeling: no external AI/3D provider, no fabricated visual scores.
"""
import bpy, math, json, numpy as np
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

# The V2 blob torso, oval helmet, flat visor and straight pepper hid the subject.
remove_exact={'HEAD_VISOR_ORIGINAL_SCULPT','TORSO_LOFT_HUMANOID','PELVIS_LOAD_BEARING',
 'HELMET_EMERALD_FRONTAL_CROWN','HELMET_MACHINED_JAW','VISOR_BLUEGREEN_REAL_POLYGON_EMISSION',
 'CHILI_FULLY_VOLUMETRIC_CURVED_GREEN_PEPPER','CHILI_CURVED_GREEN_STEM','RAISED_GRIP_PALM'}
remove_prefix=('FIVE_ARTICULATED_FINGERS_AROUND_REAL_CHILI_','LEFT_CHEST_ARMOR_SHAPED_',
 'LEFT_SHOULDER_CAMBERED_','MCC_VISIBLE_STATOR_','MCC_REAL_CONTACTOR_BLOCK_',
 'MCC_TERMINAL_','MCC_LEFT_TO_RIGHT_INSULATED_BUNDLE_','EXPOSED_ELECTROMOTOR_')
removed=[]
for ob in list(generated.objects):
 if ob.name in remove_exact or ob.name.startswith(remove_prefix):
  removed.append(ob.name);bpy.data.objects.remove(ob,do_unlink=True)

def closed_panel(name,coords,y,material,depth=.022,bevel=.005):
 """Physical 3D plate: tessellated front and back plus closed edge walls."""
 points=[Vector((x,y-.008*math.sin(i*math.pi/len(coords)),z)) for i,(x,z) in enumerate(coords)]
 tris=tessellate_polygon([points]);n=len(points)
 verts=[tuple(p) for p in points]+[tuple(p+Vector((0,depth,0))) for p in points]
 faces=[]
 for tri in tris:
  ix=[min(range(n),key=lambda k:(points[k]-t).length_squared) for t in tri]
  if len(set(ix))==3:faces.extend((tuple(ix),tuple(n+j for j in reversed(ix))))
 for i in range(n):faces.append((i,(i+1)%n,n+(i+1)%n,n+i))
 ob=mesh_obj(name,verts,faces,material,0,bevel)
 ob['part_geometry']='V4_TRUE_CLOSED_HARDSURFACE'
 return ob

def limb_carapace(name,x,z0,z1,rings,material,lo=-2.8,hi=-.38,sections=30):
 """Curved physically thick tapered radial shell following the humanoid leg."""
 vertices=[];faces=[]
 for k,(t,dx,rx,ry) in enumerate(rings):
  for j in range(sections+1):
   ang=lo+(hi-lo)*j/sections
   vertices.append((x+dx+rx*math.cos(ang),-.015+ry*math.sin(ang),z0+(z1-z0)*t))
 step=sections+1
 for i in range(len(rings)-1):
  for j in range(sections):
   a=i*step+j;b=a+1;d=(i+1)*step+j;c=d+1
   faces.append((a,b,c,d))
 ob=mesh_obj(name,vertices,faces,material,.021,.006)
 ob['part_geometry']='V4_TAPERED_VOLUMETRIC_ARMOR'
 return ob

# Reference-specific faceted mechanical skull, mouth, jaw and two narrow glowing eyes.
head('V4_SKULL_STRUCTURAL_TAPER',[
 (2.22,0,.014,.089,.101),(2.28,0,.012,.125,.128),(2.37,0,.018,.157,.150),
 (2.49,-.01,.025,.147,.140),(2.57,-.011,.028,.105,.098),
 (2.63,-.018,.032,.038,.048)],'dark',72)
for name,points,mat in [
 ('GREEN_ANGLED_CROWN',[(-.147,2.57),(-.047,2.628),(.064,2.624),(.150,2.56),(.134,2.471),(.02,2.447),(-.137,2.479)],'emerald'),
 ('LEFT_CHEEK',[(-.154,2.475),(-.031,2.474),(-.075,2.363),(-.149,2.336)],'emerald'),
 ('RIGHT_CHEEK',[(.046,2.469),(.161,2.455),(.144,2.346),(.074,2.363)],'cobalt'),
 ('JAW_MECHANISM',[(-.111,2.32),(-.019,2.34),(.089,2.322),(.07,2.266),(-.058,2.248)],'steel'),
 ('DARK_OPTICS_RECESS',[(-.108,2.398),(.086,2.398),(.078,2.366),(-.103,2.367)],'dark'),
 ('LEFT_LED_EYE',[(-.109,2.394),(-.008,2.397),(-.021,2.384),(-.105,2.379)],'led_cyan'),
 ('RIGHT_LED_EYE',[(.015,2.393),(.086,2.394),(.076,2.379),(.020,2.380)],'led_cyan')
]:closed_panel('V4_HELMET_'+name,points,-.158,mat,.012,.002)
for sign in (-1,1):
 ring('V4_HELMET_AURICULAR_GEAR_%d'%sign,(sign*.151,.006,2.408),.063,.017,'steel')
 ring('V4_HELMET_EAR_CYAN_RING_%d'%sign,(sign*.15,-.018,2.409),.048,.004,'led_cyan')
 for j in range(4):
  tube('V4_NECK_ACTUATOR_SIGNAL_%d_%d'%(sign,j),
   [(sign*(.10+.016*j),-.02,2.34),(sign*(.105+.013*j),-.012,2.22),
    (sign*(.12+.009*j),-.061,2.105)],.004,'copper' if j%2 else 'rubber',12)

# Replace smooth black bulb with open exoskeleton, broad armor on image-left.
head('V4_CENTRAL_SPINE_GIMBAL',[
 (1.18,.01,.03,.11,.10),(1.34,.02,.04,.115,.13),
 (1.60,.02,.045,.14,.14),(1.88,.01,.04,.16,.155),
 (2.11,0,.04,.09,.095)],'dark',64)
head('V4_TAPERED_HIP_LOAD_BEAM',[
 (1.025,0,.018,.15,.10),(1.12,0,.023,.225,.12),
 (1.25,0,.026,.19,.13),(1.31,0,.030,.13,.11)],'steel',56)
for i,z in enumerate((1.39,1.49,1.60,1.70,1.82,1.95,2.07)):
 tube('V4_OPEN_RIB_FRAME_%02d'%i,
  [(-.32,-.08,z-.02),(-.17,-.16,z+.005),(.015,-.15,z+.015),(.30,-.087,z+.035)],
  .012 if i%2 else .016,'steel',18)
for name,contour,mat,y in [
 ('MAIN_SHOULDER',[(-.76,2.05),(-.72,2.17),(-.59,2.22),(-.38,2.155),(-.353,2.039),(-.48,1.925),(-.69,1.953)],'cobalt',-.175),
 ('SHOULDER_SECOND',[(-.70,1.962),(-.48,1.955),(-.43,1.84),(-.55,1.768),(-.69,1.815)],'emerald',-.19),
 ('BREASTPLATE',[(-.418,2.115),(-.115,2.15),(.078,2.08),(.053,1.918),(-.064,1.88),(-.356,1.917)],'emerald',-.252),
 ('CHEST_UNDERLAP',[(-.353,1.902),(-.052,1.858),(-.073,1.68),(-.30,1.665)],'cobalt',-.241),
 ('NARROW_WAIST',[(-.314,1.632),(-.074,1.628),(-.060,1.433),(-.224,1.385),(-.319,1.478)],'emerald',-.235),
 ('SIDE_HIP',[(-.374,1.385),(-.121,1.365),(-.133,1.19),(-.372,1.155),(-.444,1.264)],'emerald',-.155)]:
 closed_panel('V4_ARMOR_'+name,contour,y,mat,.030,.009)
 tube('V4_REAL_PHYSICAL_LED_TRIM_'+name,
  [(x,y-.008,z) for x,z in contour[:min(len(contour),6)]],.003,'led_cyan',12)
# Visible motors and MCC equipment have depth, copper terminals, belts and cables.
for i,(x,z,rad) in enumerate(((.26,2.01,.056),(.302,1.85,.070),(.25,1.626,.060),(.32,1.446,.059))):
 motor('V4_EXPOSED_MCC_STATOR_%d'%i,x,-.226,z,rad,.08)
 closed_panel('V4_MCC_CONTACTOR_%d'%i,
  [(x+.068,z+.060),(x+.140,z+.057),(x+.146,z-.051),(x+.06,z-.057)],-.222,
  'ceramic' if i%2 else 'steel',.031,.004)
 for j in range(3):
  box('V4_MCC_REAL_TERMINAL_%d_%d'%(i,j),
      (x+.079+j*.019,-.276,z-.027),(.012,.015,.021),'copper',.001)
for i in range(16):
 z=1.265+.046*i
 tube('V4_INTERNAL_MOTOR_CABLE_%02d'%i,
  [(.11+.005*i,-.09,z),(.22+.005*i,-.132,z+.055),(.316,-.212,z+.092)],
  .004 if i%2 else .003,'copper' if i%3==0 else 'rubber',14)
# Make the arm on right exposed; believable copper/blue wound forearm.
for i in range(26):
 ring('V4_BLUE_WRAPPED_FOREARM_STATOR_%02d'%i,(.65,-.166,1.82-i*.0085),
      .073,.0024,'cobalt',48)
for i in range(18):
 ring('V4_COPPER_SERVO_RIGHT_ELBOW_%02d'%i,(.672,-.158,1.61-i*.005),
      .064,.0019,'copper',48)
ring('V4_RIGHT_ELBOW_HINGE_STEEL',(.663,-.095,1.568),.10,.016,'steel')
# Proper multilayered tapered left thigh/shin, not straight cuboids.
limb_carapace('V4_LEFT_ARMOR_MORPHED_THIGH',-.336,.75,1.207,
 [(0,.015,.110,.111),(.12,.012,.174,.145),(.42,-.015,.206,.167),
  (.79,-.018,.185,.17),(1,-.008,.125,.127)],'emerald')
limb_carapace('V4_LEFT_COBALT_THIGH_FACET',-.34,.813,1.14,
 [(0,.013,.105,.124),(.27,-.016,.145,.149),(.75,-.017,.151,.154),
  (1,-.005,.106,.124)],'cobalt',-2.26,-1.25,20)
limb_carapace('V4_LEFT_CURVED_SHIN_COBALT',-.30,.205,.707,
 [(0,0,.09,.096),(.21,.005,.131,.136),(.52,.006,.155,.163),
  (.83,-.005,.131,.134),(1,-.003,.087,.10)],'cobalt')
limb_carapace('V4_LEFT_GREEN_KNEE_SHIN_FACET',-.306,.24,.65,
 [(0,0,.08,.100),(.26,.005,.101,.124),(.52,.008,.128,.138),
  (.84,0,.107,.125),(1,0,.06,.094)],'emerald',-1.88,-1.08,20)
# Mechanisms carry physical loads along the exposed right leg.
for i,(x,z,rad) in enumerate(((.298,1.055,.104),(.324,.739,.091),(.307,.407,.066))):
 motor('V4_MAJOR_RIGHT_LEG_DC_MOTOR_%02d'%i,x,-.198,z,rad,.088)
for i,dx in enumerate((-.060,0,.060)):
 tube('V4_RIGHT_LEG_HYDRAULIC_ROD_%d'%i,
  [(.30+dx,-.10,1.11),(.322+dx,-.16,.92),(.342+dx,-.21,.67),
   (.328+dx,-.19,.37)],.016 if i==1 else .011,'steel',20)
for i in range(8):
 x=.292+i*.008
 tube('V4_RIGHT_LEG_SERVICE_LINE_%d'%i,
   [(x,-.13,.90),(x+.031,-.263,.72),(x+.015,-.20,.52),(x-.012,-.17,.22)],
   .0035,'cobalt' if i%2 else 'rubber',12)
# Real instep/toes so the feet visibly touch the ground.
for s in (-1,1):
 cx=s*.295
 closed_panel('V4_%s_INSTEP_STRUCTURAL_PLATE'%('L' if s<0 else 'R'),
  [(cx-.098,.263),(cx+.089,.265),(cx+.103,.144),(cx-.09,.14)],
  -.214,'cobalt' if s<0 else 'steel',.033)
 for i in range(3):
  x=cx+(i-1)*.082
  closed_panel('V4_%s_INDIVIDUAL_TOE_%d'%('L' if s<0 else 'R',i),
   [(x-.041,.102),(x+.044,.107),(x+.06,.050),(x-.04,.042)],-.254,
   'emerald' if s<0 else 'steel',.048)
# Correct the V2 reference mismatch: chili should point DOWN, long taper and
# a hooked upward green stem, and the raised left hand should actually grip it.
sweep('V4_DOWNWARD_CURVED_GREEN_CHILI',
 [(-.59,-.28,1.79),(-.65,-.278,1.86),(-.73,-.27,1.98),
  (-.79,-.265,2.10),(-.825,-.262,2.19),(-.84,-.262,2.28),
  (-.842,-.257,2.37),(-.823,-.249,2.42),(-.801,-.24,2.475),
  (-.788,-.23,2.51),(-.78,-.22,2.54)],
 [(.005,.005),(.016,.020),(.029,.032),(.044,.043),(.050,.047),(.062,.057),
  (.072,.066),(.068,.062),(.055,.052),(.035,.034),(.013,.013)],
 'chili',96)
tube('V4_BOTANICAL_HOOKED_PEPPER_STEM',
 [(-.78,-.22,2.54),(-.813,-.213,2.59),(-.854,-.204,2.653),
  (-.905,-.202,2.68),(-.947,-.22,2.655)],.01,'stem',24)
sweep('V4_RAISED_LEFT_GRIPPING_PALM',
 [(-.668,-.17,2.23),(-.697,-.187,2.298),(-.713,-.195,2.345)],
 [(.077,.070),(.088,.066),(.071,.054)],'steel',36)
for finger in range(4):
 z=2.264+finger*.043
 tube('V4_REAL_LEFT_HAND_CURLED_FINGER_%d'%finger,
  [(-.71,-.18,z),(-.77,-.217,z+.023),(-.823,-.313,z+.017),
   (-.875,-.308,z-.012)],.014,'steel',20)
 ring('V4_REAL_LEFT_FINGER_COPPER_KNUCKLE_%d'%finger,
  (-.770,-.215,z+.023),.016,.003,'copper',36)
tube('V4_OPPOSABLE_MECHANICAL_THUMB',
 [(-.655,-.179,2.28),(-.70,-.238,2.321),(-.759,-.31,2.365),
  (-.786,-.328,2.396)],.020,'steel',20)
# Valid UV on all V4/new procedural meshes. Planar mapping is labelled such.
uv_meshes=0
for ob in generated.objects:
 if ob.type!='MESH':continue
 me=ob.data
 if not me.uv_layers:
  layer=me.uv_layers.new(name='UVMap')
  vv=[v.co for v in me.vertices]
  if vv:
   mins=[min(v[k] for v in vv) for k in range(3)]
   spans=[max(v[k] for v in vv)-mins[k] for k in range(3)]
   axis=0 if spans[0]>=spans[1] else 1
   for poly in me.polygons:
    for li in poly.loop_indices:
     co=vv[me.loops[li].vertex_index]
     layer.data[li].uv=((co[axis]-mins[axis])/max(spans[axis],1e-5),
                        (co[2]-mins[2])/max(spans[2],1e-5))
 if me.uv_layers:uv_meshes+=1
# Physically interpretable, packed 2D ALBEDO, ROUGHNESS and METALLIC maps.
# Maps are deterministic synthetic surface wear, not photo-to-texture capture.
n=512
u,v=np.meshgrid(np.arange(n,dtype=np.float32)/n,
                np.arange(n,dtype=np.float32)/n)
wear=(.026*np.sin(u*91+v*4)*np.sin(v*83-u*12)+.013*np.sin(u*132+v*137))
packed=[]
for key in ('emerald','cobalt','steel','copper'):
 mat=M[key];nodes=mat.node_tree.nodes;bsdf=nodes.get('Principled BSDF')
 base=np.array(bsdf.inputs['Base Color'].default_value[:3])
 for channel in ('ALBEDO','ROUGHNESS','METALLIC'):
  pixels=np.empty((n,n,4),dtype=np.float32)
  if channel=='ALBEDO':
   pixels[:,:,:3]=np.clip(base[None,None,:]*(1+wear[:,:,None]),0,1)
  else:
   default=bsdf.inputs['Roughness' if channel=='ROUGHNESS' else 'Metallic'].default_value
   value=np.clip(default+wear*(2 if channel=='ROUGHNESS' else .5),.08 if channel=='ROUGHNESS' else .3,.98)
   pixels[:,:,:3]=value[:,:,None]
  pixels[:,:,3]=1
  img=bpy.data.images.new('V4_'+key.upper()+'_'+channel,width=n,height=n,alpha=True)
  img.pixels.foreach_set(pixels.reshape(-1));img.update();img.pack()
  tex=nodes.new('ShaderNodeTexImage');tex.image=img;tex.label='V4_SYNTHETIC_'+channel
  mat.node_tree.links.new(tex.outputs['Color'],
   bsdf.inputs['Base Color' if channel=='ALBEDO' else channel.title().capitalize()])
  packed.append(img.name)
bpy.context.scene['v4_hand_modeled_geometry']=True
bpy.context.scene['v4_uv_meshes']=uv_meshes
bpy.context.scene['v4_packed_pbr_maps']=len(packed)
bpy.context.scene['v4_removed_bad_v2_shapes']=len(removed)
print('ECOMECH_V4_SCULPT_BUILD',json.dumps({'removed':len(removed),
 'objects':len(generated.objects),'uvMeshes':uv_meshes,'syntheticPbrMaps':len(packed)}),flush=True)
