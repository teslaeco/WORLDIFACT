import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('collect',Path(__file__).parents[1]/'tools/runpod_owner_models/collect.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class OutputTests(unittest.TestCase):
    def test_output_delegation_cannot_escape_job_or_read_arbitrary_objects(self):
        prefix='jobs/'+'a'*64+'/12345678-1234-4123-8123-123456789012/'
        value={'key':prefix+'raw/original.glb','bytes':100,'sha256':'b'*64}
        module.check_artifact(value,prefix)
        for path in ['../other','reference.png','raw/../secret.json','outputs/customer-photo.jpg']:
            with self.assertRaises(ValueError):module.check_artifact({**value,'key':prefix+path},prefix)
        with self.assertRaises(ValueError):module.check_artifact({**value,'bytes':300*1024*1024},prefix)

if __name__=='__main__':unittest.main()
