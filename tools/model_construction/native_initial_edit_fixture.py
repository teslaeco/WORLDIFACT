"""Synthetic offline fixtures, never production content or geographic evidence.

The painted globe deliberately uses invented land/cloud shapes. It tests the
generic existing edit API's UV, packed-image and alpha export capabilities;
it is not NASA imagery, accurate geography, or a live model-quality verdict.
"""

GLOBE_SCENE = {
    'version': 1, 'name': 'Synthetic painted globe and alpha shell',
    'materials': [
        {'name': 'globe_surface', 'rgb': [.025, .12, .45], 'pattern': 'plain',
         'roughness': .85, 'metallic': 0, 'emission': 0},
        {'name': 'cloud_shell', 'rgb': [1, 1, 1], 'pattern': 'plain',
         'roughness': .8, 'metallic': 0, 'emission': 0}],
    'parts': [
        {'kind': 'ellipsoid', 'name': 'body', 'material': 'globe_surface',
         'center': [0, 0, 1.03], 'radii': [1, 1, 1]},
        {'kind': 'ellipsoid', 'name': 'clouds', 'material': 'cloud_shell',
         'center': [0, 0, 1.03], 'radii': [1.025, 1.025, 1.025]}],
}

GLOBE_EDIT = '''# Synthetic invented map: no external image or geographic source.
for object_name, material_name in [('body', 'globe_surface'), ('clouds', 'cloud_shell')]:
    obj = bpy.data.objects.get(object_name)
    uv = obj.data.uv_layers.active
    for polygon in obj.data.polygons:
        coordinates = []
        for loop_index in polygon.loop_indices:
            point = obj.data.vertices[obj.data.loops[loop_index].vertex_index].co.normalized()
            coordinates.append((math.atan2(point.y, point.x) / math.tau + .5,
                                math.asin(max(-1, min(1, point.z))) / math.pi + .5))
        seam = max(p[0] for p in coordinates) - min(p[0] for p in coordinates) > .5
        for loop_index, coordinate in zip(polygon.loop_indices, coordinates):
            u, v = coordinate
            uv.data[loop_index].uv = (u + (1 if seam and u < .5 else 0), v)
    width, height = 256, 128
    pixels = []
    for row in range(height):
        latitude = math.pi * (row / (height - 1) - .5)
        for column in range(width):
            longitude = math.tau * column / (width - 1)
            if object_name == 'body':
                land = (math.sin(longitude * 2 + .6) * math.cos(latitude * 3)
                        + .35 * math.sin(longitude * 5 - latitude * 4)) > .35
                if abs(latitude) > 1.30:
                    rgba = (.88, .94, .97, 1)
                elif land:
                    rgba = (.12 + .08 * math.cos(latitude * 5), .43, .10, 1)
                else:
                    rgba = (.025, .15, .55, 1)
            else:
                streak = math.sin(longitude * 7 + math.sin(latitude * 8) * 2)
                coverage = streak * math.cos(latitude * 9 + longitude) > .48
                rgba = (1, 1, 1, .72 if coverage and abs(latitude) < 1.30 else 0)
            pixels.extend(rgba)
    image = bpy.data.images.new(material_name + '_painted', width=width, height=height, alpha=True)
    image.pixels.foreach_set(pixels)
    image.update()
    image.file_format = 'PNG'
    image.pack()
    material = bpy.data.materials.get(material_name)
    texture = material.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image = image
    texture.interpolation = 'Linear'
    shader = material.node_tree.nodes.get('Principled BSDF')
    material.node_tree.links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    if object_name == 'clouds':
        material.node_tree.links.new(texture.outputs['Alpha'], shader.inputs['Alpha'])
        material.surface_render_method = 'DITHERED'
'''

BOX_EDIT = '''# Generic non-globe texture regression using the same edit pathway.
body = bpy.data.objects.get('body')
body.scale.z *= .8
material = make_material('painted_checker', (.8, .1, .2), 'plain', .75, 0)
body.data.materials.clear()
body.data.materials.append(material)
pixels = []
for row in range(64):
    for column in range(64):
        pixels.extend((.85, .15, .3, 1) if (row // 8 + column // 8) % 2 else (.96, .72, .08, 1))
image = bpy.data.images.new('generic_checker', width=64, height=64, alpha=False)
image.pixels.foreach_set(pixels)
image.update()
image.file_format = 'PNG'
image.pack()
texture = material.node_tree.nodes.new('ShaderNodeTexImage')
texture.image = image
material.node_tree.links.new(texture.outputs['Color'], material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
'''
