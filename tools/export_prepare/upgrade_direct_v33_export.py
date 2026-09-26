"""Upgrade one exact reviewed Oracle v33 server revision to direct export v2.

Accepted inputs are only the three reviewed hashes that have existed in
production: FAST v33 base, v33 + project files, and v33 + project files +
post-hoc export preparation v1. Unknown source is refused.
"""
import hashlib
import direct_v33_patch as direct
import patch_server as export_v1

BASE_SHA256="1f09db9835e9ee22361e468d051da7e847dbff36fe7e52a2f2c9c6f6337402b9"
PROJECT_SHA256="6795c356d67c72f4aed545505772182f907c9a242ad0cf0076689720a386bb14"
EXPORT_V1_SHA256="aa18c1d081c5e29c2481def9874b46082dbfaf6e58664bb07b1b28fbbea9206a"

def sha256_text(source):
    return hashlib.sha256(source.encode("utf-8")).hexdigest()

def once(source, old, new):
    if source.count(old)!=1:
        raise ValueError("v3 export upgrade context changed: %r" % old[:160])
    return source.replace(old,new,1)

def replace_export_reads(source):
    old="paths = export_files(folder, name)"
    if source.count(old)!=2:
        raise ValueError("Expected exactly two export-file read sites.")
    return source.replace(old,"paths = customer_export_files(folder, name)")

def patch_project(source):
    source=once(source,"\nclass Handler(BaseHTTPRequestHandler):\n",direct.HELPERS+"\nclass Handler(BaseHTTPRequestHandler):\n")
    source=once(source,
        r"(?:/(model|cancel|quality|exports(?:/(?:fbx|obj|stl|blend|scene-json|master|pbr))?))?",
        r"(?:/(model|cancel|quality|exports(?:/(?:fbx|obj|stl|blend|scene-json|master|pbr|prepare))?))?")
    source=once(source,"            if write and action == 'cancel':\n",direct.PREPARE+"            if write and action == 'cancel':\n")
    source=once(source,
        "'projectFileRetentionDays':PROJECT_FILE_RETENTION_SECONDS//86400})",
        "'projectFileRetentionDays':PROJECT_FILE_RETENTION_SECONDS//86400,'posthocExportRevision':2,'legacyGlbExportRecoveryRevision':1})")
    source=replace_export_reads(source)
    compile(source,"server.py","exec")
    return source

def patch_export_v1(source):
    source=once(source,export_v1.HELPERS,direct.HELPERS)
    source=once(source,
        "'posthocExportRevision':1})",
        "'posthocExportRevision':2,'legacyGlbExportRecoveryRevision':1})")
    source=replace_export_reads(source)
    compile(source,"server.py","exec")
    return source

def patch_known(source):
    current=sha256_text(source)
    if current==BASE_SHA256:
        return direct.patch_server(source),"FAST_V33_BASE"
    if current==PROJECT_SHA256:
        return patch_project(source),"FAST_V33_PROJECT_FILES"
    if current==EXPORT_V1_SHA256:
        return patch_export_v1(source),"FAST_V33_PROJECT_FILES_EXPORT_PREPARE_V1"
    raise ValueError("Installed server.py is not a reviewed v33 source revision: "+current)
