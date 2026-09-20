# Codex task — local project attachments for Shop and Game Lab

Date: 2026-09-20  
Repository: teslaeco/WORLDIFACT  
Branch: feat/project-attachments-100mb-20260920

## Goal

Add a shared project-file attachment surface to both:

- AI Shop
- AI Game Lab

Users may attach at most **2 files**, with a maximum of **100 MB per file**.

## Supported file classes

- Documents: PDF, DOC/DOCX, ODT, RTF, TXT, Markdown, CSV, JSON
- 3D: GLB/GLTF, FBX, OBJ, STL, PLY, USD/USDZ, BLEND, MTL/BIN
- Textures/images: PNG, JPG/JPEG, WebP, TIFF, BMP, EXR, HDR
- Video: MP4, WebM, MOV/M4V
- Package: ZIP

Do not accept executables, shell scripts, HTML or JavaScript.

## Storage and truth boundary

The current Astra and Oracle request contracts do not support arbitrary 100 MB binary attachments. Therefore:

- files are stored locally in the browser/device attachment archive;
- texture and video files may receive a local preview through object URLs;
- document/3D/archive files are listed as local project references;
- do not upload these attachments to GPT-6 Astra, Oracle, suppliers or manufacturing automatically;
- existing dedicated image-reference flows remain the only binary reference inputs sent into generation;
- if IndexedDB persistence fails because of browser/device quota, keep the selected files for the current browser session and say so explicitly.

Never imply that PDF/Word/video/3D binary content influenced a generated model when it was not actually transmitted to the generation backend.

## UX

- one reusable component shared by Shop and Game Lab;
- clearly display 0/2, 1/2 or 2/2;
- show category and size;
- allow removing each file;
- preview local textures/images and video;
- show the supported formats and the LOCAL REFERENCE boundary.

## QA

Cover:

- exact 2-file ceiling;
- exact 100 MB per-file ceiling;
- supported file classes;
- executable rejection;
- shared picker presence on Shop and Game Lab;
- truth-boundary copy;
- existing generation, FAST/SLOW, reference-image and release tests must remain green.

Do not merge or deploy without owner approval after exact-head CI is green.
