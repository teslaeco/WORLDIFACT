"""CPU-build receipt; deliberately does not claim CUDA/inference acceptance."""
import hashlib
import importlib.metadata
import importlib.util
import json
from pathlib import Path
import subprocess

import torch

for module in ('drtk', 'cumesh', 'flex_gemm', 'o_voxel', 'flash_attn'):
    if importlib.util.find_spec(module) is None:
        raise RuntimeError('MISSING_NATIVE_MODULE_' + module)
for module in ('nvdiffrast', 'nvdiffrec_render'):
    if importlib.util.find_spec(module) is not None:
        raise RuntimeError('UNAPPROVED_RENDERER_PRESENT')
from transformers import DINOv3ViTModel
from trellis_mit_patch import audit
audit(Path('/opt/TRELLIS.2'))

sources = {}
binaries = {}
for name in ('TRELLIS.2', 'DRTK', 'CuMesh', 'FlexGEMM'):
    root = Path('/opt') / name
    sources[name] = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    for path in root.rglob('*.so'):
        with path.open('rb') as f:
            binaries[str(path)] = hashlib.file_digest(f, 'sha256').hexdigest()
for name in ('cumesh', 'flex_gemm', 'flash_attn'):
    spec = importlib.util.find_spec(name)
    for directory in spec.submodule_search_locations or []:
        for path in Path(directory).rglob('*.so'):
            with path.open('rb') as f:
                binaries[str(path)] = hashlib.file_digest(f, 'sha256').hexdigest()
receipt = {
    'sourceRevisions': sources, 'nativeBinarySha256': binaries,
    'packages': sorted([{'name': d.metadata['Name'], 'version': d.version} for d in importlib.metadata.distributions()], key=lambda d: d['name'].lower()),
    'torch': torch.__version__, 'cudaBuild': torch.version.cuda,
    'nativeModuleDiscovery': True, 'dinoClassImport': True,
    'gpuTested': False, 'photoTo3dTested': False,
}
Path('/opt/worldifact/runtime/runtime-build-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print('CPU_RUNTIME_MODULES_DISCOVERED; DINO_CLASS_IMPORT_VERIFIED; GPU_INFERENCE_NOT_TESTED')
