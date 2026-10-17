"""Verify the exact repaired R1 files; integrity is not manufacturing approval."""
from __future__ import annotations
import argparse,hashlib,json,tempfile,unittest
from pathlib import Path

EXPECTED={
 'MAKE/ECOMECH_V4_R1_MAKE_205mm.stl':(89437384,'d90fc21ca7943c30c1473ec07b643cdfdbe4126c1a07ec6d7c9239fd5beb8b91'),
 'MAKE/ECOMECH_V4_R1_MAKE_205mm.3mf':(26573649,'d18a033073ea3a0bd0aeabe5b97b61586692fb60b7629cc770022c524331ce69'),
 'MAKE/ECOMECH_V4_R1_MAKE_205mm.glb':(42886260,'a2c6539e81829a5da4d4fd33ab475f48820372c9e6c6e64f9456deb4ff970e6f'),
 'MAKE/ECOMECH_V4_R1_MAKE_205mm.blend':(84561028,'a95ff977708bcd4f294a9d7840129c24cebd79631b0428324b4b63c0de7ff07d'),
 'GAME/ECOMECH_V4_V3_PBR_CORRECTED.glb':(75198208,'5c5fac925733443c2b60ea5319b99925de282f9cc8f866155588951a9007467b'),
 'GAME/ECOMECH_V4_V3_PBR_CORRECTED.blend':(131762957,'16650cc8d3ae1aaad616551a93a4d845e3bffc0942a331be886fc23d1fb1c307'),
}

def verify_one(path:Path,size:int,digest:str)->None:
 if path.is_symlink() or not path.is_file():raise ValueError('MISSING_OR_UNSAFE_FILE')
 if path.stat().st_size!=size:raise ValueError('BYTE_COUNT_MISMATCH')
 with path.open('rb') as stream:actual=hashlib.file_digest(stream,'sha256').hexdigest()
 if actual!=digest:raise ValueError('FILE_HASH_MISMATCH')

def verify(root:Path)->dict:
 root=root.resolve(strict=True)
 for relative,(size,digest) in EXPECTED.items():
  path=root/relative
  if path.parent.is_symlink():raise ValueError('UNSAFE_PARENT')
  verify_one(path,size,digest)
 return {'revision':'ECOMECH_V4_R1','status':'CANDIDATE_FILE_INTEGRITY_VERIFIED','files':len(EXPECTED),
         'makeTriangles':1788746,'makeDimensionsMm':[138.50240325927734,86.7427749633789,205],
         'sampledThinFeatureWarnings':5,'supplierApproved':False,'paidProviderCalls':0}

class Tests(unittest.TestCase):
 def test_matching_bytes(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'x';p.write_bytes(b'mesh');verify_one(p,4,hashlib.sha256(b'mesh').hexdigest())
 def test_changed_length(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'x';p.write_bytes(b'mesh')
   with self.assertRaisesRegex(ValueError,'BYTE_COUNT'):verify_one(p,5,'0'*64)
 def test_changed_content(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'x';p.write_bytes(b'evil')
   with self.assertRaisesRegex(ValueError,'FILE_HASH'):verify_one(p,4,hashlib.sha256(b'mesh').hexdigest())
 def test_missing_file(self):
  with tempfile.TemporaryDirectory() as d:
   with self.assertRaisesRegex(ValueError,'MISSING'):verify_one(Path(d)/'missing',4,'0'*64)
 def test_symlink_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'x';p.write_bytes(b'mesh');q=Path(d)/'link';q.symlink_to(p)
   with self.assertRaisesRegex(ValueError,'UNSAFE'):verify_one(q,4,hashlib.sha256(b'mesh').hexdigest())

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('directory',nargs='?',type=Path);parser.add_argument('--self-test',action='store_true');args=parser.parse_args()
 if args.self_test:unittest.main(argv=['verify_delivery'],exit=True)
 if args.directory is None:parser.error('directory is required')
 print(json.dumps(verify(args.directory),indent=2))
