"""Patch the exact installed FAST v33 Oracle server with project-file storage.

Source transformation only. It does not connect to Oracle, restart services,
upload a file or make an AI request. Apply only through the reviewed installer.
"""

def once(source, old, new):
    if source.count(old) != 1:
        raise ValueError('Project-file patch context changed: %r' % old[:120])
    return source.replace(old, new, 1)


PROJECT_HELPERS = r'''
PROJECT_FILE_MAX_BYTES = 100 * 1024 * 1024
PROJECT_FILE_MAX_COUNT = 2
PROJECT_FILE_RETENTION_SECONDS = 7 * 24 * 3600
PROJECT_FILE_SCOPES = ('shop', 'game-lab')
PROJECT_FILE_EXTENSIONS = {
    'document': {'pdf','doc','docx','odt','rtf','txt','md','csv','json'},
    'model-3d': {'glb','gltf','fbx','obj','stl','ply','usd','usdz','blend','mtl','bin'},
    'texture': {'png','jpg','jpeg','webp','tif','tiff','bmp','exr','hdr'},
    'video': {'mp4','webm','mov','m4v'},
    'archive': {'zip'},
}

def project_file_expected_category(name):
    value=name.strip().lower()
    extension=value.rsplit('.',1)[1] if '.' in value else ''
    for category,extensions in PROJECT_FILE_EXTENSIONS.items():
        if extension in extensions:return category
    return None

def project_file_folder(scope, project_id):
    if scope not in PROJECT_FILE_SCOPES or not UUID.fullmatch(project_id):
        raise ValueError('Nieprawidlowy projekt plikow.')
    folder=PROJECT_FILES/scope/project_id
    scope_folder=PROJECT_FILES/scope
    if scope_folder.is_symlink() or folder.is_symlink():
        raise ValueError('Nieprawidlowa sciezka projektu.')
    return folder

def cleanup_project_files():
    now=time.time()
    for scope in PROJECT_FILE_SCOPES:
        folder=PROJECT_FILES/scope
        if folder.is_symlink():raise ValueError('Nieprawidlowy magazyn projektu.')
        folder.mkdir(mode=0o700,parents=True,exist_ok=True)
        for item in list(folder.iterdir())[:256]:
            if item.is_symlink() or not item.is_dir():continue
            try:age=now-item.stat().st_mtime
            except OSError:continue
            if age>PROJECT_FILE_RETENTION_SECONDS:
                shutil.rmtree(item)

def project_file_metadata(folder):
    records=[]
    for slot in range(PROJECT_FILE_MAX_COUNT):
        meta=folder/('slot-%d.json'%slot);data=folder/('slot-%d.bin'%slot)
        if not meta.is_file() or meta.is_symlink() or not data.is_file() or data.is_symlink():continue
        if meta.stat().st_size>4096:continue
        value=json.loads(meta.read_text(encoding='utf-8'))
        if value.get('slot')!=slot or value.get('bytes')!=data.stat().st_size:continue
        records.append(value)
    return records
'''

HANDLER_METHOD = r'''
    def handle_project_files(self):
        cleanup_project_files()
        match=re.fullmatch(r'/v1/project-files/(shop|game-lab)/([a-f0-9-]{36})(?:/(0|1))?',self.path)
        if not match:return self.send_json({'error':'Nie znaleziono magazynu plikow projektu.'},404)
        scope,project_id,slot_text=match.groups()
        folder=project_file_folder(scope,project_id)
        slot=int(slot_text) if slot_text is not None else None
        if self.command=='GET' and slot is None:
            if not folder.exists():return self.send_json({'projectId':project_id,'scope':scope,'files':[]})
            return self.send_json({'projectId':project_id,'scope':scope,'files':project_file_metadata(folder),
                                   'retentionDays':PROJECT_FILE_RETENTION_SECONDS//86400})
        if slot is None:return self.send_json({'error':'Wybierz slot pliku 0 lub 1.'},400)
        data_path=folder/('slot-%d.bin'%slot);meta_path=folder/('slot-%d.json'%slot)
        if self.command=='DELETE':
            with LOCK:
                if data_path.exists() and not data_path.is_symlink():data_path.unlink()
                if meta_path.exists() and not meta_path.is_symlink():meta_path.unlink()
                if folder.exists() and not any(folder.iterdir()):folder.rmdir()
            return self.send_json({'deleted':True,'slot':slot})
        if self.command!='PUT':return self.send_json({'error':'Dozwolone sa GET, PUT i DELETE.'},405)
        try:size=int(self.headers.get('X-WORLDIFACT-File-Size','0'))
        except ValueError:raise ValueError('Nieprawidlowy rozmiar pliku.')
        content_length=self.headers.get('Content-Length')
        if content_length is not None:
            try:declared=int(content_length)
            except ValueError:raise ValueError('Nieprawidlowa dlugosc zadania.')
            if declared!=size:raise ValueError('Rozmiar pliku nie zgadza sie z zadaniem.')
        if not 1<=size<=PROJECT_FILE_MAX_BYTES:raise ValueError('Plik projektu musi miec od 1 bajtu do 100 MB.')
        encoded=self.headers.get('X-WORLDIFACT-File-Name','')
        if not encoded or len(encoded)>720:raise ValueError('Brak nazwy pliku.')
        try:name=urllib.parse.unquote(encoded)
        except Exception:raise ValueError('Nieprawidlowa nazwa pliku.')
        if not name.strip() or len(name)>180 or any(ord(c)<32 or ord(c)==127 for c in name):
            raise ValueError('Nieprawidlowa nazwa pliku.')
        category=self.headers.get('X-WORLDIFACT-Category','')
        if category not in PROJECT_FILE_EXTENSIONS or project_file_expected_category(name)!=category:
            raise ValueError('Format pliku nie pasuje do kategorii.')
        content_type=(self.headers.get('Content-Type') or 'application/octet-stream')[:160]
        if content_type in ('application/x-msdownload','application/x-dosexec','application/x-sh','application/javascript','text/javascript','text/html'):
            raise ValueError('Niedozwolony typ pliku.')
        if shutil.disk_usage(STATE).free < 4*1024**3:
            return self.send_json({'error':'Na Oracle zostalo mniej niz 4 GB wolnego miejsca. Plik nie zostal zapisany.'},409)
        folder.mkdir(mode=0o700,parents=True,exist_ok=True)
        os.chmod(folder,0o700)
        temporary=folder/('.slot-%d-%d.part'%(slot,time.time_ns()))
        digest=hashlib.sha256();remaining=size
        self.connection.settimeout(180)
        try:
            with temporary.open('xb') as output:
                os.chmod(temporary,0o600)
                while remaining:
                    chunk=self.rfile.read(min(65536,remaining))
                    if not chunk:raise ValueError('Przesylanie pliku zostalo przerwane.')
                    output.write(chunk);digest.update(chunk);remaining-=len(chunk)
                output.flush();os.fsync(output.fileno())
            metadata={'slot':slot,'name':name.strip(),'category':category,'contentType':content_type,
                      'bytes':size,'sha256':digest.hexdigest(),'uploadedAt':time.time()}
            with LOCK:
                temporary.replace(data_path);os.chmod(data_path,0o600)
                write_json(meta_path,metadata)
                os.utime(folder,None)
            return self.send_json({'stored':True,'projectId':project_id,'scope':scope,'file':metadata,
                                   'retentionDays':PROJECT_FILE_RETENTION_SECONDS//86400},201)
        finally:
            if temporary.exists():temporary.unlink()
'''

def patch_server(source):
    source=once(source, 'import urllib.request\n', 'import urllib.request\nimport urllib.parse\n')
    source=once(source, "JOBS = STATE / 'jobs'\nCONFIG = STATE / 'config.json'\n",
                "JOBS = STATE / 'jobs'\nPROJECT_FILES = STATE / 'project-files'\nCONFIG = STATE / 'config.json'\n")
    source=once(source, "    JOBS.mkdir(mode=0o700, exist_ok=True)\n",
                "    JOBS.mkdir(mode=0o700, exist_ok=True)\n    PROJECT_FILES.mkdir(mode=0o700, exist_ok=True)\n")
    source=once(source, "\nclass Handler(BaseHTTPRequestHandler):\n", PROJECT_HELPERS+"\nclass Handler(BaseHTTPRequestHandler):\n")
    source=once(source, "    def do_GET(self):\n        self.handle_request(False)\n\n    def do_POST(self):\n        self.handle_request(True)\n",
                HANDLER_METHOD+"\n    def do_GET(self):\n        self.handle_request(False)\n\n    def do_POST(self):\n        self.handle_request(True)\n\n    def do_PUT(self):\n        self.handle_request(True)\n\n    def do_DELETE(self):\n        self.handle_request(True)\n")
    source=once(source, "            if not self.authorized(config['token']):\n                return self.send_json({'error': 'Wymagane polaczenie z kontem Froge.'}, 401)\n",
                "            if not self.authorized(config['token']):\n                return self.send_json({'error': 'Wymagane polaczenie z kontem Froge.'}, 401)\n            if self.path.startswith('/v1/project-files/'):\n                return self.handle_project_files()\n")
    source=once(source, "return self.send_json(capability(health()))",
                "return self.send_json({**capability(health()),'projectFilesRevision':1,'projectFileMaxBytes':PROJECT_FILE_MAX_BYTES,'projectFileMaxCount':PROJECT_FILE_MAX_COUNT,'projectFileRetentionDays':PROJECT_FILE_RETENTION_SECONDS//86400})")
    compile(source,'server.py','exec')
    return source

if __name__=='__main__':
    import sys
    from pathlib import Path
    if len(sys.argv)!=3:raise SystemExit('patch_server.py INPUT_SERVER OUTPUT_SERVER')
    source=Path(sys.argv[1]).read_text(encoding='utf-8')
    Path(sys.argv[2]).write_text(patch_server(source),encoding='utf-8')
