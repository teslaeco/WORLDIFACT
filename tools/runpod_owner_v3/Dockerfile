FROM ghcr.io/teslaeco/worldifact-runpod3d@sha256:d303d66ec97aec3826dea3679ce5bf6b2786718fc2a0777409e859ce5375347e
# Keep the qualified CUDA/DRTK/model bundle unchanged; replace only reviewed
# application code. Sources and final outputs are never baked into the image.
COPY tools/runpod_worker/contracts.py tools/runpod_worker/engine.py tools/runpod_worker/storage.py tools/runpod_worker/handler.py tools/runpod_worker/blender_export.py tools/runpod_worker/owner_scene_v3.py /opt/worldifact/worker/
ENTRYPOINT ["python", "-u", "/opt/worldifact/qualification/entrypoint.py"]
CMD []
