# Codex task — Oracle-backed project files for Shop + Game Lab

Date: 2026-09-20  
Repository: teslaeco/WORLDIFACT  
Branch: feat/oracle-project-files-v1-20260920

## Goal

Upgrade the already deployed local attachment picker so files can also be stored through the authenticated WORLDIFACT → Oracle bridge.

User-facing requirements:

- AI Shop and AI Game Lab;
- at most **2 project files**;
- at most **100 MB per file**;
- PDF / Word / text;
- common 3D formats;
- texture/image formats;
- video;
- ZIP;
- local fallback must remain if Oracle storage is not ready.

## Architecture

1. Browser never receives `ORACLE_API_TOKEN`.
2. WORLDIFACT Worker creates a signed 24-hour project-file session using the existing server secret.
3. Browser uploads the raw body to same-origin `/api/project-files/...`.
4. Worker validates:
   - same origin;
   - signed project session;
   - IP rate limit;
   - slot 0/1;
   - exact content length 1 byte–100 MB;
   - safe file name;
   - supported extension/category;
   - dangerous executable/script/HTML types rejected.
5. Worker streams the body to the authenticated Oracle tunnel without buffering the 100 MB file in JSON.
6. Oracle worker stores the bytes in a dedicated private `state/project-files/<scope>/<project-id>` vault:
   - mode 0700/0600;
   - SHA-256;
   - metadata only in JSON;
   - 2 slots maximum;
   - 100 MB per slot;
   - 4 GB free-disk floor;
   - seven-day temporary retention;
   - GET metadata list and DELETE slot.
7. Oracle `/v1/health` must advertise:
   - `projectFilesRevision: 1`;
   - `projectFileMaxBytes: 104857600`;
   - `projectFileMaxCount: 2`.
8. Browser auto-syncs when and only when the capability is verified. Otherwise it remains LOCAL REFERENCE.

## Truth boundary

Oracle project-file storage is **not** the same as model input.

Until a reviewed parser/import pipeline is added for a specific format:
- PDF/Word/3D/video/ZIP attachments are project references;
- do not claim that GPT-6 Astra or Blender read their content;
- existing dedicated reference-image flow remains the binary model-generation input;
- no supplier/manufacturing transfer is automatic.

## Oracle maintenance

The running connector is v33 and already contains the reviewed FAST patch. Do not overwrite it with a newer full worker.

Build a narrow server-only patch from the exact reconstructed current v33 source. The installer must:
- verify exact live `server.py` SHA-256;
- refuse symlinks/unexpected source;
- refuse while a generation job is active;
- create a rollback copy;
- stop only `froge-worker.service`;
- patch only `server.py`;
- compile before replacement;
- restart only `froge-worker.service`;
- verify authenticated local health advertises project-files revision 1;
- roll back automatically on failure;
- make no AI/model request.

## QA

Required:
- exact current source identity;
- Python 3.9 compile;
- 2-file / 100 MB limits;
- file type allow-list and executable rejection;
- interrupted upload cleanup;
- disk-floor rejection;
- list/delete;
- signed Cloudflare proxy session;
- same-origin enforcement;
- token mismatch rejection;
- no secret exposure;
- existing FAST, STANDARD, Shop, Game Lab and production release tests remain green.

## Release gate

Owner explicitly authorized implementation and production deployment in this conversation. WORLDIFACT web release may merge after exact-head CI is green.

Oracle runtime installation is separate from the website deployment and must only be reported LIVE after an authenticated `/v1/health` check proves `projectFilesRevision: 1`.
