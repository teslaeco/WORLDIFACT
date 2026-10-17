import importlib.util,io,json,struct,tempfile,unittest,hashlib
from pathlib import Path
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import rsa,padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag
MODULE=Path('tools/owner_v3_recovery/recover_sources.py')
spec=importlib.util.spec_from_file_location('recovery',MODULE);r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
class FakeClient:
 def __init__(self,raw,declared=None):self.raw=raw;self.declared=len(raw) if declared is None else declared;self.calls=[]
 def get_object(self,**kw):self.calls.append(kw);return {'ContentLength':self.declared,'Body':io.BytesIO(self.raw)}
class Tests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.key=rsa.generate_private_key(public_exponent=65537,key_size=3072)
 def item(self,raw):return {'name':'ECOMECH_V4/raw/engine.json','key':f"jobs/{r.SCOPE}/{r.JOBS['ECOMECH_V4']}/raw/engine.json",'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
 def test_actual_source_configuration(self):
  specs=r.source_specs();self.assertEqual(len(specs),23)
  self.assertEqual(len({s['key'] for s in specs}),23)
  scene=next(s for s in specs if s['name']=='ECOMECH_V4/outputs/scene-report.json');self.assertEqual(scene['bytes'],235)
  native=next(s for s in specs if s['name']=='HALLOWEEN_MUSIC_ROOM/raw/original.glb');self.assertEqual(native['bytes'],67422012)
 def test_actual_recipient(self):
  raw=Path('ops/OWNER_RECOVERY_PUBLIC_20261017.pem').read_bytes()
  self.assertEqual(hashlib.sha256(raw).hexdigest(),'9d8413a3307f276cee9cabaca70a8a8ff936a1cf473883580f426509be2d9c68')
  key=serialization.load_pem_public_key(raw);self.assertIsInstance(key,rsa.RSAPublicKey);self.assertEqual(key.key_size,3072)
 def test_download_exact_bytes(self):
  raw=b'real saved source';c=FakeClient(raw)
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'source';r.checked_download(c,'test',self.item(raw),p);self.assertEqual(p.read_bytes(),raw);self.assertEqual(len(c.calls),1)
 def test_tampered_source_removed(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'source'
   with self.assertRaisesRegex(ValueError,'SOURCE_BYTES_CHANGED'):r.checked_download(FakeClient(b'evil'),'test',self.item(b'good'),p)
   self.assertFalse(p.exists())
 def test_oversize_stream(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'source'
   with self.assertRaisesRegex(ValueError,'SOURCE_TOO_LARGE'):r.checked_download(FakeClient(b'larger',4),'test',self.item(b'good'),p)
   self.assertFalse(p.exists())
 def test_short_stream(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'source'
   with self.assertRaisesRegex(ValueError,'SOURCE_BYTES_CHANGED'):r.checked_download(FakeClient(b'bad',4),'test',self.item(b'good'),p)
 def test_wrong_scope(self):
  item=self.item(b'x');item['key']=item['key'].replace(r.SCOPE,'0'*64)
  with self.assertRaisesRegex(ValueError,'SOURCE_SCOPE_CHANGED'):r.validate_spec(item)
 def test_unsafe_name(self):
  item=self.item(b'x');item['name']='ECOMECH_V4/raw/../../secret'
  with self.assertRaisesRegex(ValueError,'INVALID_FILE_NAME'):r.validate_spec(item)
 def test_hash_format(self):
  item=self.item(b'x');item['sha256']='wrong'
  with self.assertRaisesRegex(ValueError,'INVALID_SOURCE_HASH'):r.validate_spec(item)
 def test_stream_encryption_and_tamper(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'data';raw=b'owner mesh data'*170000;p.write_bytes(raw)
   rec=r.seal_file(p,'ECOMECH_V4/raw/test.bin',self.key.public_key(),Path(d)/'out');sealed=(Path(d)/'out'/rec['sealed']).read_bytes()
   size=struct.unpack('>I',sealed[:4])[0];aad=sealed[4:4+size];h=json.loads(aad)
   aes=self.key.decrypt(bytes.fromhex(h['wrappedKey']),padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),algorithm=hashes.SHA256(),label=b'WORLDIFACT_PRIVATE_FILE_V1'))
   self.assertEqual(AESGCM(aes).decrypt(bytes.fromhex(h['nonce']),sealed[4+size:],aad),raw)
   tampered=bytearray(sealed[4+size:]);tampered[-20]^=1
   with self.assertRaises(InvalidTag):AESGCM(aes).decrypt(bytes.fromhex(h['nonce']),bytes(tampered),aad)
 def test_existing_target_not_overwritten(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'x';p.write_bytes(b'original')
   with self.assertRaisesRegex(ValueError,'OUTPUT_EXISTS'):r.checked_download(FakeClient(b'x'),'test',self.item(b'x'),p)
   self.assertEqual(p.read_bytes(),b'original')
 def glb(self,uri):
  data={'asset':{'version':'2.0'},'buffers':[{'byteLength':0}], 'images':[]}
  if uri:data['images']=[{'uri':'https://example.invalid/private'}]
  b=json.dumps(data).encode();b+=b' '*((-len(b))%4)
  return struct.pack('<4sIIII',b'glTF',2,20+len(b),len(b),0x4e4f534a)+b
 def test_external_glb_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'x.glb';p.write_bytes(self.glb(True))
   with self.assertRaisesRegex(ValueError,'EXTERNAL_GLB_RESOURCE'):r.reject_external_glb(p)
 def test_embedded_glb_allowed(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'x.glb';p.write_bytes(self.glb(False));r.reject_external_glb(p)
if __name__=='__main__':unittest.main()
