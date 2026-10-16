FROM ghcr.io/teslaeco/worldifact-runpod3d@sha256:f6cd2c5facce5008e6d40b5d08ce34bfb9050347d585ab8b4d91c79cfb76b993
COPY tools/runpod_qualification/worker.py tools/runpod_qualification/entrypoint.py /opt/worldifact/qualification/
ENTRYPOINT ["python", "-u", "/opt/worldifact/qualification/entrypoint.py"]
CMD []
