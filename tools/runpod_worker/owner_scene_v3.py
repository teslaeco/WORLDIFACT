"""Fixed, reference-informed Halloween diorama construction (Blender only).

The native performer is copied without editing mesh vertices or materials.
New scene geometry is an inferred extension of a single-view photograph, not
an assertion of recovered hidden geometry or manufacturing approval. Internal
construction is in millimeters; returned export objects are in meters.
"""
import math

import bpy
from mathutils import Matrix, Vector


def _bounds(objects):
    points = [o.matrix_world @ Vector(p) for o in objects for p in o.bound_box]
    if not points or not all(math.isfinite(v) for p in points for v in p):
        raise ValueError('INVALID_CHARACTER_BOUNDS')
    return [min(p[i] for p in points) for i in range(3)], [max(p[i] for p in points) for i in range(3)]


def _material(name, color, metallic=0, roughness=.4, emission=0):
    material = bpy.data.materials.new('OwnerV3_' + name)
    material.use_nodes = True
    material.diffuse_color = (*color, 1)
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    if emission:
        shader.inputs['Emission Color'].default_value = (*color, 1)
        shader.inputs['Emission Strength'].default_value = emission
    return material


class _Builder:
    def __init__(self, collection, materials):
        self.collection = collection
        self.materials = materials
        self.objects = []
        self.matrix = Matrix.Identity(4)
        self.prefix = ''
        self.category = 'inferred_scene'

    def group(self, name, location=(0, 0, 0), rotation=(0, 0, 0)):
        self.prefix = name
        self.category = name.split('_')[0]
        from mathutils import Euler
        self.matrix = Matrix.Translation(location) @ Euler(rotation).to_matrix().to_4x4()

    def mesh(self, name, vertices, faces, material, bevel=0, smooth=False):
        mesh = bpy.data.meshes.new(self.prefix + '_' + name)
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(mesh.name, mesh)
        self.collection.objects.link(obj)
        obj.matrix_world = self.matrix.copy()
        mesh.materials.append(self.materials[material])
        obj['owner_scene_v3'] = True
        obj['geometry_origin'] = 'reference_informed_inferred_extension'
        obj['component_category'] = self.category
        for face in mesh.polygons:
            face.use_smooth = smooth
        if bevel:
            mod = obj.modifiers.new('Rounded physical edges', 'BEVEL')
            mod.width = bevel
            mod.segments = 3
            mod.limit_method = 'ANGLE'
        self.objects.append(obj)
        return obj

    def box(self, name, center, size, material, bevel=.15):
        x, y, z = center
        a, b, c = (s / 2 for s in size)
        vertices = [(x + sx*a, y + sy*b, z + sz*c) for sz in (-1, 1) for sy in (-1, 1) for sx in (-1, 1)]
        faces = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
        return self.mesh(name, vertices, faces, material, bevel)

    def tube(self, name, points, radius, material, sides=10):
        points = [Vector(p) for p in points]
        if len(points) < 2:
            raise ValueError('TUBE_NEEDS_PATH')
        vertices = []
        for i, point in enumerate(points):
            tangent = (points[min(i+1, len(points)-1)] - points[max(0, i-1)]).normalized()
            reference = Vector((0, 0, 1)) if abs(tangent.z) < .9 else Vector((0, 1, 0))
            u = tangent.cross(reference).normalized()
            v = tangent.cross(u).normalized()
            for j in range(sides):
                angle = 2*math.pi*j/sides
                vertices.append(tuple(point + radius*(u*math.cos(angle)+v*math.sin(angle))))
        faces = [tuple(reversed(range(sides)))]
        for i in range(len(points)-1):
            for j in range(sides):
                a = i*sides+j
                b = i*sides+(j+1)%sides
                faces.append((a, b, b+sides, a+sides))
        faces.append(tuple((len(points)-1)*sides+j for j in range(sides)))
        return self.mesh(name, vertices, faces, material, smooth=True)

    def pole(self, name, a, b, radius, material, sides=20):
        return self.tube(name, [a, b], radius, material, sides)

    def ring(self, name, center, radius, tube, material, axis='Z', segments=48):
        x, y, z = center
        points = []
        for i in range(segments+1):
            a = 2*math.pi*i/segments
            p = (x+radius*math.cos(a), y+radius*math.sin(a), z)
            if axis == 'Y':
                p = (x+radius*math.cos(a), y, z+radius*math.sin(a))
            points.append(p)
        return self.tube(name, points, tube, material)

    def lathe(self, name, profile, material, segments=64, lobes=0, phase=0):
        vertices = []
        for radius, z in profile:
            for i in range(segments):
                angle = 2*math.pi*i/segments
                r = radius*(1 + .085*math.cos(10*angle+phase)) if lobes else radius
                vertices.append((r*math.cos(angle), r*math.sin(angle), z))
        faces = [tuple(reversed(range(segments)))]
        for j in range(len(profile)-1):
            for i in range(segments):
                a = j*segments+i
                b = j*segments+(i+1)%segments
                faces.append((a, b, b+segments, a+segments))
        faces.append(tuple((len(profile)-1)*segments+i for i in range(segments)))
        return self.mesh(name, vertices, faces, material, smooth=True)

    def polygon(self, name, outline, depth, material, bevel=.1):
        """Extrude an XY outline along local Z; outline is counterclockwise."""
        area=sum(outline[i][0]*outline[(i+1)%len(outline)][1]-outline[(i+1)%len(outline)][0]*outline[i][1] for i in range(len(outline)))
        if area < 0: outline=list(reversed(outline))
        n = len(outline)
        vertices = [(x,y,z) for z in (-depth/2, depth/2) for x,y in outline]
        faces = [tuple(reversed(range(n))), tuple(n+i for i in range(n))]
        faces += [(i, (i+1)%n, (i+1)%n+n, i+n) for i in range(n)]
        return self.mesh(name, vertices, faces, material, bevel)


def _keys(b, width, depth, z, y, whites):
    pitch = width/whites
    for i in range(whites):
        b.box('IvoryKey_%02d'%i, (-width/2+(i+.5)*pitch, y, z), (pitch*.965, depth, .55), 'ivory', .055)
        if i < whites-1 and i%7 not in (2, 6):
            b.box('EbonyKey_%02d'%i, (-width/2+(i+1)*pitch, y+depth*.18, z+.55), (pitch*.57, depth*.63, .75), 'black', .06)


def _keyboard(b):
    b.group('Keyboard', (0, -30, 80))
    b.box('MahoganyCase', (0,0,0), (126,26,5), 'mahogany', .8)
    b.box('BlackControlDeck', (0,5,2.8), (121,12,.8), 'black', .2)
    _keys(b, 120, 13, 3, -5, 49)
    for i in range(28):
        x = -57+i*3.4
        b.box('ControlSwitch_%02d'%i, (x,7,3.6), (1.7,1.3,.7), 'black', .12)
        if i%2 == 0:
            b.pole('RotaryKnob_%02d'%i, (x,3.3,3.1), (x,3.3,4.6), .65, 'silver', 16)
        b.box('AmberControlLED_%02d'%i, (x,9,3.45), (.4,.4,.12), 'glow', .02)
    b.box('Display', (48,6,3.4), (12,5,.3), 'purple_glow', .1)
    for x in (-49,49):
        b.box('EndCheek', (x*1.27,0,2.2), (3,26,3), 'mahogany', .35)
    for x in (-43,43):
        b.pole('InferredStandLeg', (x,-7,-78), (-x*.65,7,-3), 1.6, 'black')
        b.box('InferredStandFoot', (x,-7,-78), (24,16,2.2), 'black', .4)


def _grand_piano(b):
    b.group('GrandPiano', (-67, 8, 222), (0,0,math.radians(-8)))
    outline = [(-25,-12),(25,-12),(25,4),(23,12),(17,17),(8,19),(0,17),(-8,9),(-18,8),(-25,4)]
    b.polygon('CurvedAcousticBody', outline, 5, 'black_gloss', .5)
    b.tube('BrassRim', [(x,y,2.7) for x,y in outline+[outline[0]]], .32, 'gold')
    b.box('KeyboardBed', (0,-15,-.3), (49,8,3), 'black_gloss', .35)
    _keys(b,47,6,1.4,-15,28)
    for x,y in [(-20,-7),(21,-7),(12,13)]:
        b.pole('TurnedLeg', (x,y,-4),(x,y,-24), .95,'black_gloss')
        b.ring('LegBrassCollar',(x,y,-22),1.15,.24,'gold')
        b.pole('BrassCaster',(x,y,-24),(x,y,-25.5),.6,'gold')
    # The raised lid uses its own rigid transform; this is real geometry.
    matrix = b.matrix.copy()
    b.matrix = matrix @ Matrix.Translation((0,11,4)) @ Matrix.Rotation(math.radians(-48),4,'X') @ Matrix.Translation((0,-11,0))
    b.polygon('RaisedLid',outline,1.2,'black_gloss',.25)
    b.tube('LidGoldenEdge',[(x,y,.8) for x,y in outline+[outline[0]]],.22,'gold')
    b.matrix = matrix
    b.pole('LidProp',(18,0,3),(18,-3,19),.45,'gold')
    for i in range(16):
        b.pole('SoundboardString_%02d'%i,(-19+i*2.4,-5,3.2),(-19+i*2.1,6,3.2),.045,'gold',6)
    for x,y,h in [(-18,1,7),(-12,3,10),(17,9,6)]:
        _candle(b,(x,y,3.2),h,1.3)


def _drum_kit(b):
    b.group('DrumKit',(58,13,221),(0,0,math.radians(6)))
    b.pole('BassDrumShell',(0,2,0),(0,-7,0),10,'mahogany',64)
    b.pole('BassDrumFrontSkin',(0,-7.1,0),(0,-7.3,0),9.5,'black',64)
    b.ring('BassChromeFront',(0,-7.5,0),10,.45,'silver','Y')
    b.ring('BassChromeRear',(0,2,0),10,.45,'silver','Y')
    # Face is a raised, glowing motif on the actual bass drum skin.
    matrix=b.matrix.copy()
    b.matrix=matrix @ Matrix.Translation((0,-7.6,0)) @ Matrix.Rotation(math.pi/2,4,'X')
    for name,outline in [('EyeL',[(-6,3),(-1,2),(-4,6)]),('EyeR',[(1,2),(6,3),(4,6)]),('Nose',[(-1,0),(1,0),(0,2)]),('Mouth',[(-6,-2),(-3,-3),(-1,-2),(1,-3),(3,-2),(6,-2),(4,-6),(-3,-6)])]:
        b.polygon('Pumpkin'+name,outline,.12,'glow',.04)
    b.matrix=matrix
    for x,y,z,r in [(-7,0,12,5),(5,0,13,5.4),(14,6,3,6),(-15,-1,5,5.5)]:
        b.pole('TomShell',(x,y,z-4),(x,y,z+1),r,'mahogany',40)
        b.pole('TomSkin',(x,y,z+1),(x,y,z+1.25),r*.95,'ivory',40)
        for zz in (z-4,z+1.3):b.ring('TomChromeRim',(x,y,zz),r,.28,'silver')
        for a in range(6):
            angle=a*math.pi/3
            xx,yy=x+r*math.cos(angle),y+r*math.sin(angle)
            b.pole('TensionLug',(xx,yy,z-3.4),(xx,yy,z+.5),.25,'silver',8)
    for x,y,z,r in [(-20,3,21,8),(18,7,23,8.7),(-11,10,27,7),(22,-5,10,5)]:
        b.pole('CymbalStand',(x,y,-10),(x,y,z+2),.38,'silver',12)
        for a in range(3):
            angle=a*2*math.pi/3
            b.pole('Tripod',(x,y,-5),(x+5*math.cos(angle),y+5*math.sin(angle),-11),.3,'silver',8)
        saved=b.matrix.copy();b.matrix=saved @ Matrix.Translation((x,y,z))
        b.lathe('SpunBrassCymbal',[(.2,1.3),(.8,1.2),(1.8,.7),(r*.7,.12),(r,0),(r,-.18)],'gold',80)
        b.matrix=saved
    b.pole('DrumStickL',(-12,-3,7),(-4,4,11),.25,'wood',8)
    b.pole('DrumStickR',(-8,-2,7),(-16,4,11),.25,'wood',8)


def _string_instrument(b, violin=False):
    name='Violin' if violin else 'ElectricGuitar'
    location=(-88,-6,164) if violin else (103,8,186)
    rotation=(math.pi/2,math.radians(-22 if violin else 22),0)
    b.group(name,location,rotation)
    if violin:
        outline=[(-3,-11),(-7,-9),(-8,-5),(-6,-2),(-3,0),(-5,3),(-6,6),(-4,9),(0,10),(4,9),(6,6),(5,3),(3,0),(6,-2),(8,-5),(7,-9),(3,-11)]
    else:
        outline=[(-3,-14),(-9,-13),(-12,-8),(-11,-2),(-6,4),(-5,9),(-2,12),(0,6),(3,7),(7,13),(9,10),(7,5),(8,1),(12,-5),(11,-10),(7,-14)]
    b.polygon('ShapedBody',outline,3.5,'wood' if violin else 'black_gloss',.6)
    b.tube('BodyBinding',[(x,y,1.9) for x,y in outline+[outline[0]]],.22,'gold')
    neck_length=20 if violin else 30
    b.box('Neck',(0,10+neck_length/2,0),(2.7,neck_length,2),'wood',.2)
    b.box('Fingerboard',(0,10+neck_length/2,1.4),(2.5,neck_length,.6),'black',.1)
    b.box('Bridge',(0,-4,2.4),(5,1,1),'wood' if violin else 'silver',.1)
    b.box('Tailpiece',(0,-9,2),(3,5,.6),'black',.1)
    strings=4 if violin else 6
    for i in range(strings):
        x=(i-(strings-1)/2)*.4
        b.pole('String_%d'%i,(x,-10,2.9),(x,neck_length+12,2.2),.035,'silver',6)
    for i in range(4 if violin else 6):
        side=1 if i%2 else -1
        yy=neck_length+10+i*.8
        b.pole('TunerStem',(0,yy,0),(side*2.5,yy,0),.2,'silver',8)
        b.box('Tuner',(side*2.8,yy,0),(.8,.8,1.8),'black' if violin else 'silver',.15)
    b.box('Headstock',(0,neck_length+12,0),(3.6,7,2),'wood',.4)
    if violin:
        for s in (-1,1):
            b.tube('Fhole',[(s*3,-5,1.95),(s*4,-3,1.95),(s*2.8,0,1.95),(s*3.5,2,1.95)],.32,'black',8)
        b.pole('Bow',(-15,-14,4),(-12,31,4),.35,'wood',12)
        b.pole('BowHair',(-13.7,-13,4),(-10.7,30,4),.13,'ivory',8)
    else:
        for i in range(14):
            y=11+neck_length*(1-math.pow(.93,i))
            b.pole('Fret',(-1.3,y,1.8),(1.3,y,1.8),.07,'silver',8)
        for y in (-1,4):b.box('Pickup',(0,y,2),(5,2,.5),'silver',.1)
        for x,y in [(6,-7),(7,-3),(4,-10)]:b.pole('VolumeKnob',(x,y,2),(x,y,3),.7,'gold',12)


def _trumpet(b):
    b.group('Trumpet',(91,-10,155),(0,math.radians(-20),math.radians(12)))
    # Main bore points to viewer-left-to-right with a hollow flared bell.
    b.tube('FoldedBore',[(-17,0,0),(-17,0,-5),(-14,0,-7),(9,0,-7),(12,0,-5),(12,0,0),(-8,0,0),(-11,0,3),(-8,0,6),(9,0,6)],.65,'gold',16)
    saved=b.matrix.copy();b.matrix=saved @ Matrix.Translation((9,0,6)) @ Matrix.Rotation(math.pi/2,4,'Y')
    b.lathe('HollowFlaredBell',[(.75,0),(.9,4),(1.2,7),(2,10),(4,12),(6,13),(6,12.6),(4,11.6),(2,9.6),(1.1,6.8),(.7,3.5),(.55,0)],'gold',64)
    b.matrix=saved
    for x in (-5,0,5):
        b.pole('ValveCasing',(x,0,-5),(x,0,4),1.25,'gold',20)
        b.pole('ValveStem',(x,0,4),(x,0,6),.35,'silver',12)
        b.pole('FingerButton',(x,0,6),(x,0,6.5),1.1,'ivory',20)
    b.pole('Mouthpiece',(-20,0,0),(-16,0,0),.8,'silver',16)


def _candle(b, position, height=8, radius=1.6):
    x,y,z=position
    b.pole('WaxCandle',(x,y,z),(x,y,z+height),radius,'wax',24)
    b.ring('WaxRim',(x,y,z+height),radius,.2,'wax')
    for a in (0,2,4):
        xx,yy=x+radius*math.cos(a),y+radius*math.sin(a)
        b.tube('WaxDrip',[(xx,yy,z+height),(xx,yy,z+height-1.5-a*.3)],.25,'wax',8)
    b.pole('Wick',(x,y,z+height),(x,y,z+height+1),.12,'black',8)
    saved=b.matrix.copy();b.matrix=saved @ Matrix.Translation((x,y,z+height+.5))
    b.lathe('Flame',[(.1,0),(.7,.6),(.65,1.5),(.3,2.6),(.04,3.8)],'glow',20)
    b.matrix=saved


def _pumpkin(b, position, radius, phase=0):
    saved=b.matrix.copy();b.matrix=saved @ Matrix.Translation(position)
    profile=[(.12*radius,-.75*radius)]
    profile += [(radius*math.sin(math.pi*i/24),-.75*radius*math.cos(math.pi*i/24)) for i in range(1,24)]
    profile += [(.12*radius,.75*radius)]
    shell=b.lathe('RibbedPumpkin',profile,'pumpkin',96,lobes=10,phase=phase)
    # Apply real cavities and face apertures to the NEW decorative pumpkin.
    # Native performer data is never passed to this geometry operation.
    inner_radius=max(radius-1.4,radius*.78)
    inner_profile=[(r*inner_radius/radius,z*.85) for r,z in profile]
    hollow=b.lathe('TemporaryPumpkinCavity',inner_profile,'black',80,lobes=10,phase=phase)
    cutters=[hollow]
    b.tube('CurvedStem',[(0,0,radius*.7),(radius*.05,0,radius*.96),(radius*.18,0,radius*1.1)],radius*.09,'stem',16)
    parent=b.matrix.copy()
    b.matrix=parent @ Matrix.Translation((0,-radius*.9,0)) @ Matrix.Rotation(math.pi/2,4,'X')
    outlines=[('EyeL',[(-.6,.15),(-.15,.12),(-.4,.5)]),('EyeR',[(.15,.12),(.6,.15),(.4,.5)]),('Nose',[(-.1,-.05),(.1,-.05),(0,.13)]),('Mouth',[(-.62,-.17),(-.3,-.23),(-.2,-.16),(0,-.27),(.15,-.18),(.28,-.25),(.63,-.16),(.43,-.5),(-.4,-.5)])]
    for name,outline in outlines:
        cutters.append(b.polygon('Temporary'+name+'Aperture',[(x*radius,y*radius) for x,y in outline],radius,'black',0))
    bpy.context.view_layer.update()
    for cutter in cutters:
        modifier=shell.modifiers.new('Actual carved cavity','BOOLEAN')
        modifier.operation='DIFFERENCE';modifier.solver='EXACT';modifier.object=cutter
    depsgraph=bpy.context.evaluated_depsgraph_get()
    carved=bpy.data.meshes.new_from_object(shell.evaluated_get(depsgraph))
    old_mesh=shell.data;shell.modifiers.clear();shell.data=carved
    if not old_mesh.users:bpy.data.meshes.remove(old_mesh)
    for cutter in cutters:
        b.objects.remove(cutter);bpy.data.objects.remove(cutter,do_unlink=True)
    b.matrix=parent
    _candle(b,(0,0,-radius*.55),radius*.8,max(.8,radius*.09))
    b.matrix=saved


def _dress(b):
    b.group('InferredLowerDress',(0,5,0))
    # Draped pleats are modeled; source torso, hands and face remain unchanged.
    rings,segments=56,128
    vertices=[]
    for j in range(rings):
        z=5+j*88/(rings-1)
        t=j/(rings-1)
        rx=36*(1-t)+18*t
        ry=26*(1-t)+13*t
        for i in range(segments):
            a=2*math.pi*i/segments
            pleat=(1.8*(1-t)+.3)*math.cos(18*a+.15*math.sin(t*5))
            vertices.append(((rx+pleat)*math.cos(a),(ry+pleat)*math.sin(a),z+.3*math.cos(12*a)*(1-t)))
    faces=[tuple(reversed(range(segments)))]
    for j in range(rings-1):
        for i in range(segments):
            a=j*segments+i;bb=j*segments+(i+1)%segments
            faces.append((a,bb,bb+segments,a+segments))
    faces.append(tuple((rings-1)*segments+i for i in range(segments)))
    b.mesh('PleatedLongSkirt',vertices,faces,'fabric',smooth=True)
    b.tube('HemTrim',[(36*math.cos(i*math.pi/48),26*math.sin(i*math.pi/48),5.6) for i in range(97)],.25,'black')


def _music(b):
    b.group('MusicTrails')
    for index,(cx,cz,rx,rz) in enumerate([(-57,203,36,48),(63,205,37,46),(-61,156,32,21),(72,151,28,22)]):
        points=[]
        for i in range(100):
            t=i/99*math.pi*2.4
            points.append((cx+rx*math.cos(t)*(1-i/135),19+2*math.sin(t*2),cz+rz*math.sin(t)*(1-i/135)))
        b.tube('GoldenSpiral_%d'%index,points,.25,'glow',8)
    for x,z in [(-108,208),(-42,172),(-28,242),(34,251),(87,139),(-70,140)]:
        b.pole('NoteStem',(x,3,z),(x,3,z+8),.35,'glow',8)
        b.ring('NoteHead',(x-1.5,3,z),1.8,.5,'glow','Y',24)
        b.tube('NoteFlag',[(x,3,z+8),(x+4,3,z+9),(x+4,3,z+5)],.4,'glow',8)


def _room(b):
    b.group('InferredRoom')
    b.box('Floor',(0,0,0),(264,180,5),'floor',.7)
    b.box('RearWall',(0,88,128),(264,4,256),'wall',.5)
    for x in (-130,130):
        b.box('SideWall',(x,16,128),(4,144,256),'wall',.5)
        b.box('Wainscot',(x*.984,15,36),(2,143,65),'purple',.2)
        for y in (-42,-4,34,72):b.box('WallPilaster',(x*.977,y,133),(4,3,242),'darkwood',.5)
    for x in (-108,-54,0,54,108):
        b.box('RearWallPanel',(x,85,145),(48,1.5,190),'purple',.2)
        b.box('RearPilaster',(x-25,82,130),(3,5,248),'darkwood',.5)
    for z in (8,65,250):b.box('RearMoulding',(0,82,z),(260,5,2.2),'darkwood',.5)
    for x in range(-126,127,18):b.box('FloorPlank',(x,0,2.6),(17.7,176,.3),'wood_dark',.08)
    for x,z in [(-98,49),(-98,105),(104,49),(104,105)]:
        b.box('Shelf',(x,53,z),(43,39,3),'darkwood',.5)
        for xx in (x-17,x+17):b.pole('ShelfColumn',(xx,66,4),(xx,66,156),1.4,'darkwood',20)
    b.group('RoomDecor')
    for x,y,z,r in [(-98,45,117,15),(-110,-40,17,17),(101,43,62,12),(104,-61,22,22),(-51,56,10,10)]:
        _pumpkin(b,(x,y,z),r)
    for x,y,z,h in [(-116,45,51,11),(-82,46,51,15),(-110,46,107,10),(92,45,108,16),(116,44,51,9),(-118,-60,4,19),(118,-43,4,13)]:
        b.pole('CandleHolderFoot',(x,y,z),(x,y,z+1),3,'gold',32)
        _candle(b,(x,y,z+1),h,1.8)
    # Ghost ornament on the shelf.
    saved=b.matrix.copy();b.matrix=saved @ Matrix.Translation((-89,43,63))
    b.lathe('GhostOrnament',[(7,0),(6.5,5),(5,10),(2,13),(.1,13.5)],'ivory',40)
    for x in (-2,2):b.pole('GhostEye',(x,-4.7,8),(x,-5,8),.8,'black',16)
    b.matrix=saved
    # Raised, exportable lettering; no external fonts or image files needed.
    for index,(a,c) in enumerate([((-127,27,56),(-58,27,100)),((-120,28,145),(-72,28,54))]):
        a,c=Vector(a),Vector(c);direction=c-a;mid=(a+c)/2
        b.tube('DangerTapeEdge_%d'%index,[tuple(a),tuple(c)],.15,'orange',8)
        obj=b.box('DangerTape_%d'%index,tuple(mid),(direction.length, .5, 7),'orange',.08)
        angle=-math.atan2(direction.z,direction.x)
        # Rotate the local rectangular tape about its own midpoint.
        obj.matrix_world=b.matrix @ Matrix.Translation(mid) @ Matrix.Rotation(angle,4,'Y') @ Matrix.Translation(-mid)
        curve=bpy.data.curves.new('DANGER lettering','FONT');curve.body='DANGER  DANGER';curve.size=5;curve.extrude=.05;curve.align_x='CENTER'
        textobj=bpy.data.objects.new('DangerTape_RaisedText_%d'%index,curve);b.collection.objects.link(textobj)
        textobj.location=mid+Vector((0,-.4,-1.6));textobj.rotation_euler=(math.pi/2,angle,0)
        textobj.data.materials.append(b.materials['black'])
        depsgraph=bpy.context.evaluated_depsgraph_get();mesh=bpy.data.meshes.new_from_object(textobj.evaluated_get(depsgraph))
        matrix=textobj.matrix_world.copy();bpy.data.objects.remove(textobj,do_unlink=True)
        textobj=bpy.data.objects.new('DangerTape_RaisedText_%d'%index,mesh);b.collection.objects.link(textobj);textobj.matrix_world=matrix
        textobj['geometry_origin']='reference_informed_inferred_extension';textobj['component_category']='RoomDecor';b.objects.append(textobj)
    for cx,cy,cz,r in [(-106,34,164,23),(-104,32,76,25),(108,72,220,21)]:
        for i in range(9):
            angle=2*math.pi*i/9
            b.pole('CobwebSpoke',(cx,cy,cz),(cx+r*math.cos(angle),cy,cz+r*math.sin(angle)),.08,'web',6)
        for j in range(1,6):
            points=[]
            for i in range(73):
                angle=2*math.pi*i/72
                radius=r*j/6*(1-.07*math.sin(angle*9)**2)
                points.append((cx+radius*math.cos(angle),cy,cz+radius*math.sin(angle)))
            b.tube('CobwebRing',points,.06,'web',6)


def build_halloween_scene(character_objects):
    """Return a JSON-compatible manifest and meter-coordinate export meshes.

    Originals remain hidden in the project, unedited; only returned object
    names may be selected for the composite scene GLB export.
    """
    source=[o for o in character_objects if o.type=='MESH']
    if not source:
        raise ValueError('NO_CHARACTER_MESHES')
    bpy.context.view_layer.update()
    lo,hi=_bounds(source)
    height=hi[2]-lo[2]
    if height<=1e-8:
        raise ValueError('EMPTY_CHARACTER_HEIGHT')
    if bpy.data.collections.get('OwnerV3_HalloweenScene'):
        raise ValueError('OWNER_SCENE_ALREADY_BUILT')
    collection=bpy.data.collections.new('OwnerV3_HalloweenScene');bpy.context.scene.collection.children.link(collection)
    colors={
        'black':((.008,.009,.014),.1,.38,0),'black_gloss':((.009,.006,.012),.25,.16,0),
        'fabric':((.011,.007,.017),0,.65,0),'gold':((.72,.35,.055),.85,.23,0),
        'silver':((.55,.58,.63),.85,.23,0),'ivory':((.88,.84,.72),0,.27,0),
        'mahogany':((.17,.018,.009),.15,.24,0),'wood':((.29,.085,.015),.05,.29,0),
        'wood_dark':((.035,.012,.022),0,.38,0),'darkwood':((.022,.009,.029),.1,.32,0),
        'purple':((.045,.009,.079),0,.5,0),'wall':((.014,.008,.025),0,.7,0),
        'floor':((.025,.016,.025),.1,.35,0),'pumpkin':((.65,.12,.008),0,.38,0),
        'stem':((.08,.06,.014),0,.75,0),'orange':((.9,.17,.012),0,.42,0),
        'wax':((.72,.47,.18),0,.5,0),'web':((.35,.27,.42),0,.7,0),
        'glow':((1,.19,.009),.05,.3,3),'purple_glow':((.28,.02,.75),0,.4,2)}
    materials={name:_material(name,*settings) for name,settings in colors.items()}
    builder=_Builder(collection,materials)
    scale=120/height
    transform=Matrix.Translation((0,0,80)) @ Matrix.Scale(scale,4) @ Matrix.Translation((-(lo[0]+hi[0])/2,-(lo[1]+hi[1])/2,-lo[2]))
    copied=[]
    for original in source:
        copy=original.copy();copy.data=original.data
        copy.parent=None;copy.name='Character_UneditedNativeGeometry_'+original.name
        collection.objects.link(copy);copy.matrix_world=transform @ original.matrix_world
        copy.hide_render=False;copy.hide_viewport=False;copy.hide_set(False)
        copy['geometry_origin']='native_inference_mesh_unmodified'
        copy['component_category']='Character'
        copied.append(copy)
        original.hide_render=True;original.hide_viewport=True;original.hide_set(True);original.select_set(False)
    _dress(builder)
    _keyboard(builder)
    _grand_piano(builder)
    _drum_kit(builder)
    _string_instrument(builder,True)
    _string_instrument(builder,False)
    _trumpet(builder)
    _music(builder)
    _room(builder)
    objects=copied+builder.objects
    # Uniform world transformation preserves native vertex buffers and keeps
    # regular Blender/glTF meter semantics independent of scene unit display.
    to_meters=Matrix.Scale(.001,4)
    for obj in objects:obj.matrix_world=to_meters @ obj.matrix_world
    scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
    bpy.context.view_layer.update()
    bounds_lo,bounds_hi=_bounds(objects)
    depsgraph=bpy.context.evaluated_depsgraph_get()
    triangles=0;inventory=[]
    for obj in objects:
        evaluated=obj.evaluated_get(depsgraph);mesh=evaluated.to_mesh()
        count=sum(len(poly.vertices)-2 for poly in mesh.polygons)
        evaluated.to_mesh_clear();triangles+=count
        inventory.append({'name':obj.name,'category':obj.get('component_category','unknown'),'triangles':count})
    return {
        'schema_version':1,'profile':'halloween_full_room_v3','units':'meters',
        'design_character_height_mm':200,'native_visible_torso_height_mm':120,
        'physical_scale_confirmed':False,'print_ready':False,'supplier_approved':False,
        'model_object_names':[o.name for o in objects],
        'triangle_count':triangles,'mesh_object_count':len(objects),'object_inventory':inventory,
        'bbox_mm':[[v*1000 for v in bounds_lo],[v*1000 for v in bounds_hi]],
        'native_mesh_data_unchanged':True,'original_objects_preserved_hidden':True,
        'inferred_regions':['lower_body_and_full_length_dress','rear_surfaces','complete_floor_and_hidden_walls','keyboard_support','three_dimensional_instrument_depth_and_hidden_surfaces'],
        'reference_features':['five_distinct_floating_instruments','keyboard_with_separate_white_and_black_keys','pumpkins','candles','golden_notes_and_trails','danger_tape','cobwebs','purple_room'],
        'limits':['Single view does not determine unseen geometry.','Native likeness needs visual review.','Floating decorative elements are display geometry without certified structural supports.','Decorative pumpkin cavities and other minimum wall thicknesses require manufacturing review.','Procedural scene materials are PBR parameters; no newly generated image textures are claimed.'],
        'reference_camera':{'direction':[0,-1,.18],'look_at_m':[0,0,.13]},
    }
