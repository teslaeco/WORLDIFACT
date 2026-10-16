# syntax=docker/dockerfile:1
# Private, weight-bearing image. Never make this package public.
FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-devel@sha256:0cf3402e946b7c384ba943ee05c90b4c5a4a05227923921f2b0918c011cfaf56 AS runtime
ENV DEBIAN_FRONTEND=noninteractive PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    TORCH_CUDA_ARCH_LIST="8.0;8.6;8.9" MAX_JOBS=2 BUILD_TARGET=cuda \
    HF_HUB_DISABLE_TELEMETRY=1 HF_HUB_DISABLE_PROGRESS_BARS=1 \
    HF_HUB_DISABLE_XET=1
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates build-essential cmake pkg-config xz-utils \
    libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 libxi6 libxfixes3 \
    libxkbcommon0 libegl1 libopengl0 libxxf86vm1 libfontconfig1 \
    && rm -rf /var/lib/apt/lists/*
COPY tools/runpod_worker/requirements.txt /opt/worldifact/runpod_worker/requirements.txt
COPY tools/runpod_runtime/requirements.txt /opt/worldifact/runpod_runtime/requirements.txt
RUN python -m pip install --no-cache-dir -r /opt/worldifact/runpod_runtime/requirements.txt \
    && python -c "import torch; assert torch.__version__.split('+')[0]=='2.6.0'; assert torch.version.cuda=='12.4'"
RUN python -m pip install --no-cache-dir --no-build-isolation flash-attn==2.7.3
RUN git init /opt/TRELLIS.2 && git -C /opt/TRELLIS.2 fetch --depth=1 https://github.com/microsoft/TRELLIS.2.git 75fbf0183001ed9876c8dbb35de6b68552ee08bd \
    && git -C /opt/TRELLIS.2 checkout --detach FETCH_HEAD \
    && git -C /opt/TRELLIS.2 submodule update --init --recursive --depth=1
RUN git init /opt/CuMesh && git -C /opt/CuMesh fetch --depth=1 https://github.com/JeffreyXiang/CuMesh.git 12289e1062f0603f2f0d0771b02e1395d247f26f \
    && git -C /opt/CuMesh checkout --detach FETCH_HEAD \
    && git -C /opt/CuMesh submodule update --init --recursive --depth=1 \
    && python -m pip install --no-cache-dir --no-build-isolation /opt/CuMesh
RUN git init /opt/FlexGEMM && git -C /opt/FlexGEMM fetch --depth=1 https://github.com/JeffreyXiang/FlexGEMM.git 6dd94a859c26ee8246888502eada3dd8ad85532e \
    && git -C /opt/FlexGEMM checkout --detach FETCH_HEAD \
    && git -C /opt/FlexGEMM submodule update --init --recursive --depth=1 \
    && python -m pip install --no-cache-dir --no-build-isolation /opt/FlexGEMM
# DRTK extensions share a build.ninja path. Serialize extension builds; MAX_JOBS
# still permits two compiler workers within the current extension.
RUN git init /opt/DRTK && git -C /opt/DRTK fetch --depth=1 https://github.com/facebookresearch/DRTK.git 43c3095d01d0ff435c798518e97e387c784b567f \
    && git -C /opt/DRTK checkout --detach FETCH_HEAD \
    && cd /opt/DRTK && python setup.py build_ext --inplace -j 1
COPY tools/runpod_worker/ /opt/worldifact/worker/
COPY tools/runpod_runtime/ /opt/worldifact/runtime/
ENV PYTHONPATH=/opt/DRTK:/opt/TRELLIS.2:/opt/TRELLIS.2/o-voxel:/opt/worldifact/worker \
    TRELLIS_CODE_DIR=/opt/TRELLIS.2 TRELLIS_BUNDLE_DIR=/models/trellis2 \
    BLENDER_BIN=/opt/blender/blender ENABLE_RUNPOD_WORKER=false \
    ATTN_BACKEND=flash_attn SPARSE_CONV_BACKEND=flex_gemm \
    TORCH_HOME=/tmp/torch-cache HF_HOME=/tmp/hf-cache TRITON_CACHE_DIR=/tmp/triton-cache \
    XDG_CACHE_HOME=/tmp/xdg-cache PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
RUN python /opt/worldifact/worker/trellis_mit_patch.py --apply --source /opt/TRELLIS.2 \
    && python -m pip install --no-cache-dir --no-build-isolation -e /opt/TRELLIS.2/o-voxel \
    && python /opt/worldifact/worker/trellis_mit_patch.py --check --source /opt/TRELLIS.2
RUN cd /tmp && curl -fL --retry 2 https://download.blender.org/release/Blender4.3/blender-4.3.0-linux-x64.tar.xz -o blender-4.3.0-linux-x64.tar.xz \
    && curl -fL --retry 2 https://download.blender.org/release/Blender4.3/blender-4.3.0.sha256 -o blender-4.3.0.sha256 \
    && sha256sum --check --ignore-missing blender-4.3.0.sha256 \
    && tar -xf blender-4.3.0-linux-x64.tar.xz \
    && mv blender-4.3.0-linux-x64 /opt/blender \
    && rm blender-4.3.0-linux-x64.tar.xz blender-4.3.0.sha256
RUN python -m pip check \
    && python /opt/worldifact/runtime/inspect_runtime.py \
    && /opt/blender/blender --background --factory-startup --version \
    && useradd --uid 10001 --create-home worker

FROM runtime AS model-bundle
# One checkpoint per layer: keep layers below common registry upload limits.
# The token is never an ARG, ENV, file in the image, or build output.
RUN --mount=type=secret,id=hf_token,required=true python /opt/worldifact/runtime/download_bundle.py pipeline
RUN --mount=type=secret,id=hf_token,required=true python /opt/worldifact/runtime/download_bundle.py sparse_structure_decoder
RUN --mount=type=secret,id=hf_token,required=true python /opt/worldifact/runtime/download_bundle.py sparse_structure_flow_model
RUN --mount=type=secret,id=hf_token,required=true python /opt/worldifact/runtime/download_bundle.py shape_slat_decoder
RUN --mount=type=secret,id=hf_token,required=true python /opt/worldifact/runtime/download_bundle.py shape_slat_flow_model_512
RUN --mount=type=secret,id=hf_token,required=true python /opt/worldifact/runtime/download_bundle.py shape_slat_flow_model_1024
RUN --mount=type=secret,id=hf_token,required=true python /opt/worldifact/runtime/download_bundle.py tex_slat_decoder
RUN --mount=type=secret,id=hf_token,required=true python /opt/worldifact/runtime/download_bundle.py tex_slat_flow_model_512
RUN --mount=type=secret,id=hf_token,required=true python /opt/worldifact/runtime/download_bundle.py tex_slat_flow_model_1024
RUN --mount=type=secret,id=hf_token,required=true python /opt/worldifact/runtime/download_bundle.py dinov3
RUN python /opt/worldifact/runtime/download_bundle.py finalize \
    && python -c "from pathlib import Path; from engine import load_bundle; load_bundle(Path('/models/trellis2'))"
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
WORKDIR /opt/worldifact/worker
USER 10001:10001
CMD ["python", "-u", "handler.py"]
