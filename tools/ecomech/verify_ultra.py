#!/usr/bin/env python3
"""Offline evidence checker for native ECOMECH Blender refinement, no AI/billing."""
from pathlib import Path
import argparse,hashlib,json,struct
p=argparse.ArgumentParser()
p.add_argument('output')
args=p.parse_args()
root=Path(args.output)
manifest=json.loads((root/'MANIFEST_ULTRA.json').read_text())
assert manifest['sourceGLBSha256']=='7e7f3aea755dfdd0ad957124d7e1dc33004905e0052fdab3d60b587f34cdc7b4'
assert manifest['sourceModel']=='gpt-6-astra' and manifest['additionalPaidProviderRequests']==0
assert 2000000<=manifest['actualTriangles']<=3000000
assert manifest['printApproved'] is False and manifest['rigVerified'] is False

def glb_info(path):
 data=path.read_bytes()
 assert data[:4]==b'glTF',f'{path.name} missing GLB'
 version,size=struct.unpack_from('<II',data,4)
 assert version==2 and size==len(data)
 jsonbytes,json_type=struct.unpack_from('<II',data,12)
 assert json_type==0x4e4f534a
 js=json.loads(data[20:20+jsonbytes])
 ofs=20+jsonbytes
 binbytes,bintype=struct.unpack_from('<II',data,ofs)
 assert bintype==0x004e4942 and ofs+8+binbytes==len(data)
 assert js['asset']['version']=='2.0' and js.get('meshes')
 assert js.get('buffers',[{}])[0].get('byteLength',1)<=binbytes
 accessors=js.get('accessors',[])
 views=js.get('bufferViews',[])
 tri=0;position_count=0
 for mesh in js['meshes']:
  for prim in mesh.get('primitives',[]):
   position=prim['attributes']['POSITION']
   a=accessors[position]
   assert a['componentType']==5126 and a['type']=='VEC3'
   idx=accessors[prim['indices']] if 'indices' in prim else a
   assert (prim.get('mode',4)==4) and idx['count']>=3
   assert len(views)>a['bufferView']
   v=views[a['bufferView']]
   assert v['buffer']==0 and v.get('byteOffset',0)+v['byteLength']<=js['buffers'][0]['byteLength']
   tri+=idx['count']//3
   position_count+=a['count']
 assert tri>0 and position_count>0
 return {'triangles':tri,'bytes':len(data),'meshDefinitions':len(js['meshes']),
         'materialCount':len(js.get('materials',[])), 'positions':position_count,
         'imageCount':len(js.get('images',[])), 'animationCount':len(js.get('animations',[]))}
for fn,record in manifest['outputs'].items():
 f=root/fn
 assert f.is_file() and f.stat().st_size==record['bytes'],f'not saved: {fn}'
 assert hashlib.sha256(f.read_bytes()).hexdigest()==record['sha256'],f'changed: {fn}'
hi=glb_info(root/'ECOMECH_ASTRA_BLENDER_ULTRA_GAME.glb')
lo=glb_info(root/'ECOMECH_ASTRA_BLENDER_MOBILE_LOD.glb')
# Blender's imported original source contains 1,272 additional internal face
# triangles versus the self-contained original glTF exported primitives. Compare
# actual final GLB triangle count independently, never assert metadata alone.
assert abs(hi['triangles']-manifest['actualTriangles'])<=2000, (
 hi['triangles'],manifest['actualTriangles'])
assert hi['triangles']>=2000000,hi['triangles']
assert 2000000<=hi['triangles']<=3000000
assert lo['triangles']<hi['triangles']/3
assert lo['bytes']<25*1024*1024,'Mobile LOD too heavy for Cloudflare Workers Assets'
assert hi['materialCount']>=8
fbx=(root/'ECOMECH_ASTRA_BLENDER_ULTRA.fbx').read_bytes()[:24]
blend=(root/'ECOMECH_ASTRA_BLENDER_ULTRA_EDITABLE.blend').read_bytes()[:8]
obj=(root/'ECOMECH_ASTRA_BLENDER_ULTRA.obj').read_bytes()[:512]
assert fbx.startswith(b'Kaydara FBX Binary')
assert blend==b'BLENDER-'
assert b'Blender' in obj or obj.startswith(b'#')
summary={'GAME':hi,'MOBILE_LOD':lo,'formats':['GLB','FBX','OBJ','BLEND'],
 'meshQuality':'GEOMETRY_ONLY_NOT_ARTISTIC_QA','source':'ASTRA_ORIGINAL_PLUS_BLENDER_DETAIL'}
(root/'INTEGRITY_REPORT.json').write_text(json.dumps(summary,indent=2)+'\n')
print('ULTRA_GLB_INTEGRITY_PASS',json.dumps(summary))
