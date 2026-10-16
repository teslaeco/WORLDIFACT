"""Build-time model materialization; HF credentials exist only in a secret mount.

Each checkpoint is verified against its pinned upstream LFS SHA-256. The final
manifest contains only relative paths and hashes, never credentials or URLs.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile

MODEL = 'microsoft/TRELLIS.2-4B'
REVISION = 'af44b45f2e35a493886929c6d786e563ec68364d'
DINO = 'facebook/dinov3-vitl16-pretrain-lvd1689m'
DINO_REVISION = 'ea8dc2863c51be0a264bab82070e3e8836b02d51'
DINO_WEIGHT_SHA = 'dcb2e45127cccbf1601e5f42fef165eea275c8e5213197e8dcf3f48822718179'
SOURCE_REVISION = '75fbf0183001ed9876c8dbb35de6b68552ee08bd'
ROOT = Path('/models/trellis2')
PARTS = {
    'sparse_structure_decoder': ('ss_dec_conv3d_16l8_fp16', '1c76d4a40519aa2d711cc263a8404105231ac26db31d946bed48b84fee79009a'),
    'sparse_structure_flow_model': ('ss_flow_img_dit_1_3B_64_bf16', 'ca01377c485bec418076d38ee80166d32dc776d744f2553b835cba1e97a7abf6'),
    'shape_slat_decoder': ('shape_dec_next_dc_f16c32_fp16', 'e3b718d3e43e4f8780e9a24ac6fff231811a67e3b058e336e10fe654c911d581'),
    'shape_slat_flow_model_512': ('slat_flow_img2shape_dit_1_3B_512_bf16', 'ec5e0917ef9b7e25ad51dffc7d19687a42019871f94239f2fa7f86264c55b70f'),
    'shape_slat_flow_model_1024': ('slat_flow_img2shape_dit_1_3B_1024_bf16', '07cd0596f634c5adc1890023d16023afc5eed02fb84b22bb23aff5bf0030fbbd'),
    'tex_slat_decoder': ('tex_dec_next_dc_f16c32_fp16', '97ea69addea2ecd9312910f5f548234665eef51c088386180b7cd5b258645e3c'),
    'tex_slat_flow_model_512': ('slat_flow_imgshape2tex_dit_1_3B_512_bf16', '8371aa1c5d13be79dcd5ddfd2cf3835e902e204dc34427169a1c702828e1a94d'),
    'tex_slat_flow_model_1024': ('slat_flow_imgshape2tex_dit_1_3B_1024_bf16', '580401269059a339b8318ab9ced459a13ba63391721c83a6c383198c29e77686'),
}


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def download(repo, revision, filename, relative, expected=None):
    from huggingface_hub import get_hf_file_metadata, hf_hub_download, hf_hub_url
    token = Path('/run/secrets/hf_token').read_text().strip()
    metadata = get_hf_file_metadata(hf_hub_url(repo, filename, revision=revision), token=token)
    if metadata.commit_hash != revision:
        raise ValueError('MODEL_COMMIT_MISMATCH')
    if expected and metadata.etag != expected:
        raise ValueError('MODEL_UPSTREAM_HASH_CHANGED')
    # Remove the transient HF cache in this same layer, retaining only the
    # checked file. No token is written by hf_hub_download(token=...).
    with tempfile.TemporaryDirectory(prefix='worldifact-download-') as cache:
        source = Path(hf_hub_download(repo, filename, revision=revision, token=token, cache_dir=cache))
        if source.stat().st_size != metadata.size:
            raise ValueError('MODEL_SIZE_MISMATCH')
        sha = digest(source)
        if expected and sha != expected:
            raise ValueError('MODEL_CONTENT_HASH_MISMATCH')
        if len(metadata.etag) == 40:
            raw = source.read_bytes()
            git_hash = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
            if git_hash != metadata.etag:
                raise ValueError('MODEL_CONFIG_CONTENT_MISMATCH')
        destination = ROOT / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    print(json.dumps({'file': relative, 'sha256': sha, 'bytes': metadata.size}))


def finalize(review_path=Path('/opt/worldifact/runtime/license-review.json')):
    required = {'pipeline.json', 'dinov3/config.json', 'dinov3/model.safetensors',
                'dinov3/preprocessor_config.json', 'dinov3/LICENSE.md', 'dinov3/README.md'}
    for name, _ in PARTS.values():
        required.update({'ckpts/' + name + suffix for suffix in ('.json', '.safetensors')})
    actual = {str(p.relative_to(ROOT)) for p in ROOT.rglob('*') if p.is_file()}
    if actual != required:
        raise ValueError('BUNDLE_FILE_SET_MISMATCH')
    for name, expected in PARTS.values():
        if digest(ROOT / ('ckpts/' + name + '.safetensors')) != expected:
            raise ValueError('BUNDLE_CHECKPOINT_CORRUPTED')
    if digest(ROOT / 'dinov3/model.safetensors') != DINO_WEIGHT_SHA:
        raise ValueError('BUNDLE_DINO_CORRUPTED')
    config = json.loads((ROOT / 'pipeline.json').read_text())
    if set(config['args']['models']) != set(PARTS):
        raise ValueError('PIPELINE_PART_SET_MISMATCH')
    encoder = config['args']['image_cond_model']['args']['model_name']
    dino = json.loads((ROOT / 'dinov3/config.json').read_text())
    if encoder != DINO or dino.get('hidden_size') != 1024 or dino.get('patch_size') != 16:
        raise ValueError('WRONG_DINO_VARIANT')
    review = json.loads(review_path.read_text())
    if review.get('reviewed') is not True or review.get('dino') != DINO:
        raise ValueError('LICENSE_REVIEW_REQUIRED')
    manifest = {
        'sourceRevision': SOURCE_REVISION, 'modelRevision': REVISION,
        'dinov3Revision': DINO_REVISION, 'dependencyLicensesReviewed': True,
        'pipelineConfig': 'pipeline.json', 'dinov3Directory': 'dinov3',
        'modelPrefixes': {key: 'ckpts/' + pair[0] for key, pair in PARTS.items()},
        'files': {name: digest(ROOT / name) for name in sorted(required)},
    }
    (ROOT / 'worldifact-bundle.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('BUNDLE_CONTENT_VERIFIED; CUDA_INFERENCE_NOT_YET_TESTED')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('part', choices=[*PARTS, 'dinov3', 'pipeline', 'finalize'])
    args = parser.parse_args()
    os.environ['HF_HUB_DISABLE_PROGRESS_BARS'] = '1'
    try:
        if args.part == 'finalize':
            finalize()
        elif args.part == 'pipeline':
            download(MODEL, REVISION, 'pipeline.json', 'pipeline.json')
        elif args.part == 'dinov3':
            for name in ('config.json', 'preprocessor_config.json', 'LICENSE.md', 'README.md', 'model.safetensors'):
                sha = DINO_WEIGHT_SHA if name.endswith('.safetensors') else None
                download(DINO, DINO_REVISION, name, 'dinov3/' + name, sha)
        else:
            name, sha = PARTS[args.part]
            repo, revision = (('microsoft/TRELLIS-image-large', '25e0d31ffbebe4b5a97464dd851910efc3002d96')
                              if args.part == 'sparse_structure_decoder' else (MODEL, REVISION))
            for suffix in ('.json', '.safetensors'):
                relative = 'ckpts/' + name + suffix
                download(repo, revision, relative, relative, sha if suffix == '.safetensors' else None)
    except Exception:
        # HTTP error text can contain a signed model download URL.
        print('MODEL_BUNDLE_BUILD_FAILED; credentials and provider error bodies suppressed', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
