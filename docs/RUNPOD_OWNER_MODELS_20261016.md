# Owner reference generation

The owner requested real GPU reconstructions of ECOMECH V4 and Halloween Music Room. The original robot image and two Halloween views have been recovered privately. Their SHA-256 and byte lengths are fixed in `ops/RUNPOD_OWNER_REFERENCES_20261016.json`; no image bytes or private encryption key enter this public repository.

The manual-only trusted-main transfer workflow prepares three create-only R2 PUT URLs, each expiring after 15 minutes and binding the object, content length, JPEG content type and source SHA metadata. Its artifact contains only RSA-OAEP/AES-GCM ciphertext addressed to the operator's private key. Production R2 credentials stay on the protected runner. The original files are subsequently uploaded once, their actual bytes must be rehashed server-side before any paid generation, and a conflicting upload is never overwritten.

This step allocates no GPU and makes no OpenAI call. No new customer generation route, Oracle change or billing change is included. The current actual GPU qualification is run 38964818698; native CUDA/DRTK, sparse/shape/texture generation, original GLB (14,879,468 bytes), Blender source and eight renders all passed. Native runtime took 351.954 seconds on A100-SXM4-80GB. Endpoint deletion was confirmed. Scale-to-zero was not observed within the one-minute health window (idle/ready counts remained 1), so it is not claimed from this run. Models are not delivered until their genuine output files and reference fidelity have been inspected.

Byte inspection confirmed the uploaded files have JPEG encoding despite their historical PNG filenames. Original JPEG bytes remain unchanged in source storage; model input normalization will create separate PNG derivatives.
