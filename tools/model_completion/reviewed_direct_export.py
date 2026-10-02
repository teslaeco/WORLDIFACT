"""Patch exact FAST v33 with no-AI post-hoc export preparation.

This source transform is intentionally independent of project-file storage.
It adds one authenticated same-job POST endpoint that can finalize an existing
model.blend, or recover legacy completed GLB-only jobs by importing that exact
GLB into Blender and exporting BLEND/FBX/textures. It never requests AI,
submits a new job, changes the base GLB, or marks manufacturing readiness.
"""

def once(source: str, old: str, new: str) -> str:
    if source.count(old) != 1:
        raise ValueError("Direct export patch context changed: %r" % old[:140])
    return source.replace(old, new, 1)

HELPERS = r'''
POSTHOC_EXPORTING=set()
POSTHOC_IMPORT_SCRIPT=r"""
import bpy,json,sys
from pathlib import Path
sys.path.insert(0,'/runner')
from scene_exports import export_interchange
folder=Path('/work')
model=folder/'model.glb'
if not model.is_file():raise ValueError('Missing saved GLB')
bpy.ops.wm.read_factory_settings(use_empty=True)
status=bpy.ops.import_scene.gltf(filepath=str(model))
if status!={'FINISHED'}:raise ValueError('GLB import failed: '+str(status))
for image in bpy.data.images:
    if image.has_data and (image.packed_file is None or image.is_dirty):image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(folder/'model.blend'))
report={}
path=folder/'result.json'
if path.is_file():
    try:report=json.loads(path.read_text())
    except Exception:report={}
report.setdefault('master_export',{'formats':['glb','blend'],'decimation_applied':False})
report['interchange_exports']=export_interchange(folder,folder/'scene.json' if (folder/'scene.json').is_file() else None)
report['master_export']['formats']=report['interchange_exports'].get('formats',[])
path.write_text(json.dumps(report))
print('WORLDIFACT_POSTHOC_EXPORTS_READY')
"""

def file_sha256(path):
    digest=hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda:source.read(1024*1024),b''):digest.update(block)
    return digest.hexdigest()

def customer_export_files(folder,name):
    try:return export_files(folder,name)
    except (ValueError,OSError,KeyError,TypeError):
        if name!='pbr':raise
    result=folder/'result.json'
    if result.is_symlink() or not result.is_file() or result.stat().st_size>2*1024**2:raise ValueError('Brak raportu tekstur.')
    report=json.loads(result.read_text()).get('interchange_exports',{})
    records=report.get('textures',[])
    if not isinstance(records,list) or not records:raise ValueError('Brak zapisanych tekstur modelu.')
    paths=[];total=0
    for record in records:
        name_value=record.get('path') if isinstance(record,dict) else None
        if not isinstance(name_value,str) or not re.fullmatch(r'textures/[A-Za-z0-9_.-]+\.(png|jpg)',name_value):
            raise ValueError('Nieprawidlowa sciezka tekstury.')
        path=folder/name_value
        if path.is_symlink() or path.parent.is_symlink() or not path.is_file():raise ValueError('Brak pliku tekstury.')
        size=path.stat().st_size;total+=size
        if size<1 or total>EXPORT_LIMIT:raise ValueError('Paczka tekstur przekracza limit.')
        digest=file_sha256(path)
        if record.get('bytes')!=size or record.get('sha256')!=digest:raise ValueError('Tekstura zmienila sie po eksporcie.')
        paths.append(path)
    return paths

def run_legacy_glb_export(job_id,folder,timeout=300):
    script=folder/'.worldifact-posthoc-export.py'
    if script.exists() or script.is_symlink():script.unlink(missing_ok=True)
    script.write_text(POSTHOC_IMPORT_SCRIPT,encoding='utf-8');os.chmod(script,0o600)
    name='froge-posthoc-'+job_id
    command=['podman','run','--rm','--pull=never','--name',name]+sandbox_options(job_memory_gib(folder))+[
        '-v',str(ROOT/'runtime')+':/runner:ro,Z','-v',str(folder)+':/work:rw,Z',
        IMAGE,'--background','--factory-startup','--threads','2','--python-exit-code','1',
        '--python','/work/'+script.name]
    log=folder/'posthoc-export.log'
    try:
        with log.open('wb') as output:
            process=subprocess.Popen(command,stdin=subprocess.DEVNULL,stdout=output,stderr=subprocess.STDOUT)
            try:process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                subprocess.run(['podman','kill',name],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15)
                process.wait(timeout=20);raise TimeoutError('Blender export timed out.')
            if process.returncode:
                tail=log.read_bytes()[-2500:].decode('utf-8',errors='replace')
                raise ValueError('Blender export failed: '+tail)
    finally:script.unlink(missing_ok=True)

def available_customer_exports(folder):
    ready=[]
    for name in ('pbr','fbx','blend'):
        try:customer_export_files(folder,name);ready.append(name)
        except (ValueError,OSError,KeyError,TypeError):pass
    return ready

def prepare_customer_exports(job_id,row):
    if row['state']!='succeeded':return {'error':'Model nie jest jeszcze gotowy.'},409
    folder=JOBS/job_id;model=folder/'model.glb'
    if model.is_symlink() or not model.is_file() or not 20<=model.stat().st_size<=48*1024**2:
        return {'error':'Brak zachowanego GLB. Nie uruchomiono nowej generacji.'},409
    ready=available_customer_exports(folder)
    if all(name in ready for name in ('pbr','fbx','blend')):
        return {'prepared':False,'alreadyReady':True,'formats':ready,'paidGenerationRequested':False,'generationRequested':False},200
    if ai_busy():return {'error':'Generator jest zajety. Sprobuj ponownie po zakonczeniu aktywnego modelu.'},409
    with LOCK:
        if job_id in POSTHOC_EXPORTING:return {'error':'Eksport tego modelu jest juz przygotowywany.'},409
        POSTHOC_EXPORTING.add(job_id)
    before=file_sha256(model);blend=folder/'model.blend'
    had_blend=blend.is_file() and not blend.is_symlink()
    try:
        if had_blend:
            run_blender_finalize(job_id,folder,threading.Event(),timeout=300)
        else:
            run_legacy_glb_export(job_id,folder,timeout=300)
        if file_sha256(model)!=before:raise ValueError('Bazowy GLB zmienil sie podczas eksportu.')
        ready=available_customer_exports(folder)
        if not ready:return {'error':'Blender nie przygotowal dodatkowych plikow. GLB pozostaje bez zmian.'},409
        return {'prepared':True,'alreadyReady':False,'formats':ready,'paidGenerationRequested':False,'generationRequested':False,
                'legacyGlbRecovery':not had_blend},200
    except (ValueError,TimeoutError,OSError,subprocess.SubprocessError):
        return {'error':'Nie udalo sie przygotowac eksportow z zapisanego modelu. GLB pozostaje bez zmian; nie wyslano zapytania AI.'},409
    finally:
        with LOCK:POSTHOC_EXPORTING.discard(job_id)
'''

PREPARE = r'''
            if write and action == 'exports/prepare':
                data,status_code=prepare_customer_exports(job_id,row)
                return self.send_json(data,status_code)
'''

def patch_server(source: str) -> str:
    source=once(source,"\nclass Handler(BaseHTTPRequestHandler):\n",HELPERS+"\nclass Handler(BaseHTTPRequestHandler):\n")
    source=once(source,
        r"(?:/(model|cancel|quality|exports(?:/(?:fbx|obj|stl|blend|scene-json|master|pbr))?))?",
        r"(?:/(model|cancel|quality|exports(?:/(?:fbx|obj|stl|blend|scene-json|master|pbr|prepare))?))?")
    source=once(source,"            if write and action == 'cancel':\n",PREPARE+"            if write and action == 'cancel':\n")
    source=once(source,"return self.send_json(capability(health()))",
        "return self.send_json({**capability(health()),'posthocExportRevision':2,'legacyGlbExportRecoveryRevision':1})")
    # Both export-listing and concrete download use the same verified fallback.
    old="paths = export_files(folder, name)"
    if source.count(old)!=2:raise ValueError("Export route context changed.")
    source=source.replace(old,"paths = customer_export_files(folder, name)")
    compile(source,'server.py','exec')
    return source
