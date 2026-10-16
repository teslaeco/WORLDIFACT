# Preparation recipe, NOT an image already built or deployed by this PR.
# Supply an audited Linux CUDA/TRELLIS2 base image by immutable sha256 digest.
# It must contain the pinned upstream git tree and a tested Blender executable.
ARG GPU_BASE_IMAGE
FROM ${GPU_BASE_IMAGE}
ARG GPU_BASE_IMAGE
RUN python -c "import re; assert re.fullmatch(r'.+@sha256:[a-f0-9]{64}', '${GPU_BASE_IMAGE}'), 'Digest-pinned GPU base required'"
WORKDIR /opt/worldifact/worker
COPY tools/runpod_worker/requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir -r requirements.txt && python -m pip check
COPY tools/runpod_worker/ ./
ENV ENABLE_RUNPOD_WORKER=false \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    HF_HUB_DISABLE_TELEMETRY=1 \
    TRELLIS_CODE_DIR=/opt/TRELLIS.2 \
    TRELLIS_BUNDLE_DIR=/models/trellis2 \
    BLENDER_BIN=/opt/blender/blender
# GPU_BASE_IMAGE must already contain a LICENSE-AUDITED, pinned MIT DRTK build,
# the exact TRELLIS.2 git revision and read-only model/checkpoint bundle.
# Never fetch weights or build a CUDA extension inside a user generation request.
RUN python trellis_mit_patch.py --apply --source /opt/TRELLIS.2 && \
    python trellis_mit_patch.py --check --source /opt/TRELLIS.2 && \
    python -c "import importlib.util; assert importlib.util.find_spec('drtk') is not None, 'Pinned MIT DRTK missing'; assert importlib.util.find_spec('nvdiffrast') is None, 'Noncommercial nvdiffrast installed'; assert importlib.util.find_spec('nvdiffrec_render') is None, 'Noncommercial nvdiffrec installed'" && \
    python -m py_compile contracts.py storage.py handler.py engine.py blender_export.py \
      trellis_mit_patch.py uv_contract.py worldifact_drtk_uv.py
# Do not embed OpenAI, RunPod, artifact credentials or weights into Git.
USER 10001:10001
CMD ["python", "-u", "handler.py"]
