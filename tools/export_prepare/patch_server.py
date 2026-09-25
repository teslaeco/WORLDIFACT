"""Add idempotent no-AI export preparation to the exact reviewed Oracle worker.

Source transformation only. It never connects to Oracle, restarts services,
requests AI, changes model geometry or touches a customer job by itself.
Apply only through the reviewed installer after exact-source verification.
"""

def once(source, old, new):
    if source.count(old) != 1:
        raise ValueError('Export-prepare patch context changed: %r' % old[:120])
    return source.replace(old, new, 1)

HELPERS = r'''
EXPORT_PREPARING = set()

def _file_sha256(path):
    digest=hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda:source.read(1024*1024),b''):digest.update(block)
    return digest.hexdigest()

def available_customer_exports(folder):
    ready=[]
    for name in ('pbr','fbx','blend'):
        try:
            export_files(folder,name);ready.append(name)
        except (ValueError,OSError,KeyError,TypeError):
            pass
    return ready

def prepare_customer_exports(job_id,row):
    if row['state']!='succeeded':
        return {'error':'Model nie jest jeszcze gotowy.'},409
    folder=JOBS/job_id
    model=folder/'model.glb';blend=folder/'model.blend'
    for path in (model,blend):
        if path.is_symlink() or not path.is_file() or path.stat().st_size<20 or path.stat().st_size>EXPORT_LIMIT:
            return {'error':'Brak zachowanego pliku modelu potrzebnego do eksportu. Nie uruchomiono nowej generacji.'},409
    ready=available_customer_exports(folder)
    if all(name in ready for name in ('pbr','fbx','blend')):
        return {'prepared':False,'alreadyReady':True,'formats':ready,'paidGenerationRequested':False,'generationRequested':False},200
    # Do not compete with a generation job for Blender/CPU, and never convert
    # export preparation into a generation reservation.
    if ai_busy():
        return {'error':'Generator jest zajety. Sprobuj przygotowac eksport ponownie po zakonczeniu aktywnego modelu.'},409
    with LOCK:
        if job_id in EXPORT_PREPARING:
            return {'error':'Eksport tego modelu jest juz przygotowywany.'},409
        EXPORT_PREPARING.add(job_id)
    before=_file_sha256(model)
    try:
        cancelled=threading.Event()
        run_blender_finalize(job_id,folder,cancelled,timeout=300)
        if _file_sha256(model)!=before:
            raise ValueError('Finalizacja zmienila bazowy GLB; eksport odrzucony.')
        ready=available_customer_exports(folder)
        if not ready:
            return {'error':'Blender nie przygotowal zadnego dodatkowego eksportu. GLB pozostaje bez zmian.'},409
        return {'prepared':True,'alreadyReady':False,'formats':ready,'paidGenerationRequested':False,'generationRequested':False},200
    except (ValueError,TimeoutError,OSError,subprocess.SubprocessError):
        return {'error':'Nie udalo sie przygotowac brakujacych eksportow z zachowanego modelu. GLB pozostaje bez zmian; nie wyslano zapytania AI.'},409
    finally:
        with LOCK:EXPORT_PREPARING.discard(job_id)
'''

PREPARE_HANDLER = r'''
            if write and action == 'exports/prepare':
                data,status_code=prepare_customer_exports(job_id,row)
                return self.send_json(data,status_code)
'''

def patch_server(source):
    source=once(source, "\nclass Handler(BaseHTTPRequestHandler):\n", HELPERS+"\nclass Handler(BaseHTTPRequestHandler):\n")
    source=once(source,
        r"(?:/(model|cancel|quality|exports(?:/(?:fbx|obj|stl|blend|scene-json|master|pbr))?))?",
        r"(?:/(model|cancel|quality|exports(?:/(?:fbx|obj|stl|blend|scene-json|master|pbr|prepare))?))?")
    source=once(source,
        "            if write and action == 'cancel':\n",
        PREPARE_HANDLER+"            if write and action == 'cancel':\n")
    # Project-files capability wrapper is present on the exact currently
    # installed server. Add a narrow capability marker without changing v33.
    source=once(source,
        "'projectFileRetentionDays':PROJECT_FILE_RETENTION_SECONDS//86400})",
        "'projectFileRetentionDays':PROJECT_FILE_RETENTION_SECONDS//86400,'posthocExportRevision':1})")
    compile(source,'server.py','exec')
    return source

if __name__=='__main__':
    import sys
    from pathlib import Path
    if len(sys.argv)!=3:raise SystemExit('patch_server.py INPUT_SERVER OUTPUT_SERVER')
    Path(sys.argv[2]).write_text(patch_server(Path(sys.argv[1]).read_text(encoding='utf-8')),encoding='utf-8')
