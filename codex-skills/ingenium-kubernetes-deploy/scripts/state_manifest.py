#!/usr/bin/env python3
"""Operator-only state manifest, encrypted archive and independent-restore checks.
No service control, credential generation, deletion or deployment is performed.
The caller owns the actual source fence and the restored target's empty claim.
"""
import argparse,base64,hashlib,json,os,pathlib,stat,subprocess,tarfile,time,select,tempfile
MAX_BYTES=12*1024**3
MAX_ENTRIES=350000
AGE=pathlib.Path('/home/brajam/.local/share/branconet-migration/bin/age')
AGE_SHA='eb7dd1b518f0a307c99cd97782623c5321da049154b04acd2d98d21aa7bc9b2c'
def need(ok,message):
    if not ok: raise RuntimeError(message)
def digest_stream(stream):
    h=hashlib.sha256()
    while True:
        b=stream.read(1024*1024)
        if not b:break
        h.update(b)
    return h.hexdigest()
def stable(st):return (st.st_dev,st.st_ino,st.st_mode,st.st_uid,st.st_gid,st.st_size,st.st_mtime_ns,st.st_ctime_ns)
def metadata(path):
    s=path.lstat(); mode=stat.S_IMODE(s.st_mode)
    kind='directory' if stat.S_ISDIR(s.st_mode) else 'file' if stat.S_ISREG(s.st_mode) else 'symlink' if stat.S_ISLNK(s.st_mode) else 'unsupported'
    need(kind!='unsupported','Special filesystem entry refuses capture')
    attrs={k:base64.b64encode(os.getxattr(path,k,follow_symlinks=False)).decode() for k in sorted(os.listxattr(path,follow_symlinks=False))}
    row={'kind':kind,'mode':mode,'uid':s.st_uid,'gid':s.st_gid,'mtimeNs':s.st_mtime_ns,'xattrs':attrs}
    if kind=='file':
        fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
        with os.fdopen(fd,'rb') as f:
            need(stable(os.fstat(f.fileno()))==stable(s),'File identity changed before capture')
            row.update(size=s.st_size,sha256=digest_stream(f))
            need(stable(os.fstat(f.fileno()))==stable(s),'File changed during capture')
    if kind=='symlink':row['link']=os.readlink(path)
    need(stable(path.lstat())==stable(s),'Entry changed during capture')
    return row,s

def inventory(scope):
    entries={};sources={};inode_names={};bytes_read=0
    for root in scope['sources']:
        source=pathlib.Path(root['source']);target=root['target'];need(not source.is_symlink() and source.is_dir(),'Root must be a regular directory')
        need(target and not target.startswith('/') and '..' not in pathlib.PurePosixPath(target).parts,'Invalid archive root')
        excluded=set(root.get('excludedPreservedOnSource',[]));overrides=root.get('overrides',{});omitted=set(root.get('omittedSupersededFiles',[]))
        paths=[source]
        for base,dirs,files in os.walk(source,followlinks=False):
            base=pathlib.Path(base)
            for name in list(dirs):
                rel=(base/name).relative_to(source).as_posix()
                if rel in excluded or rel in omitted:dirs.remove(name)
            for name in dirs+files:
                q=base/name;rel=q.relative_to(source).as_posix()
                if rel not in excluded and rel not in omitted:paths.append(q)
        for original in sorted(paths,key=lambda q:q.as_posix()):
            rel=original.relative_to(source).as_posix();archive=target if rel=='.' else target+'/'+rel
            path=pathlib.Path(overrides.get(rel,str(original)))
            need(archive not in entries,'Duplicate logical archive member')
            row,s=metadata(path)
            if row['kind']=='file':
                inode=(s.st_dev,s.st_ino)
                if s.st_nlink>1 and inode in inode_names:row['hardlinkTo']=inode_names[inode]
                else:inode_names[inode]=archive
                bytes_read+=row['size']
            entries[archive]=row;sources[archive]=str(path)
            need(len(entries)<=MAX_ENTRIES and bytes_read<=MAX_BYTES,'Complete capture exceeds reviewed bound')
    return {'schema':1,'capturedAt':int(time.time()),'entries':entries,'sourcePaths':sources,'apparentBytes':bytes_read,'sourceFenceVerified':False}

def assert_same(expected,actual):
    need(set(expected['entries'])==set(actual['entries']),'Restored path set differs')
    for name,row in expected['entries'].items():
        need(row==actual['entries'][name],'Restored content or metadata differs')

def merge_expected_manifests(components,replace_directory_metadata=()):
    # Combining authenticated components is for independent restore comparison,
    # never permission to recapture from old/deleted physical source paths.
    entries={};allowed=set(replace_directory_metadata)
    for component in components:
        need(component.get('schema')==1,'Unsupported component manifest schema')
        for name,row in component['entries'].items():
            if name in entries:
                need(name in allowed and entries[name]['kind']=='directory' and row['kind']=='directory','Unexpected archive component collision')
            entries[name]=row
    return {'schema':1,'entries':entries,'apparentBytes':sum(x.get('size',0) for x in entries.values()),'sourceFenceVerified':False,'expectedRestoreOnly':True}

def tar_command(manifest):
    # One explicit transform per reviewed physical-to-logical prefix; symlink values stay unchanged.
    pairs=sorted(((source.lstrip('/'),name) for name,source in manifest['sourcePaths'].items()),key=lambda x:len(x[0]),reverse=True)
    # Map the 13 actual roots plus any SQLite/log overlays, not every file.
    roots=[]
    for source,name in reversed(pairs):
        if not any(source.startswith(a+'/') and name==b+source[len(a):] for a,b in roots):roots.append((source,name))
    args=['tar','--create','--file=-','--format=pax','--numeric-owner','--acls','--xattrs','--xattrs-include=*','--pax-option=delete=atime,delete=ctime','--no-recursion','--directory=/']
    def sed(s):return s.replace('\\','\\\\').replace('.','\\.').replace(',','\\,').replace('&','\\&')
    for source,name in sorted(roots,key=lambda x:len(x[0]),reverse=True):
        args+=['--transform=flags=rh;s,^'+sed(source)+'$,'+sed(name)+',','--transform=flags=rh;s,^'+sed(source)+'/,'+sed(name)+'/,']
    return args+['--null','--verbatim-files-from','--files-from=-']

def age_checked():need(hashlib.sha256(AGE.read_bytes()).hexdigest()==AGE_SHA,'Existing age binary differs')
def encrypt_archive(manifest,destination,recipient):
    age_checked();need(not destination.exists(),'Refusing archive replacement');need(not manifest.get('expectedRestoreOnly'),'Merged restore expectations cannot be recaptured')
    filelist=b''.join(os.fsencode(source.lstrip('/'))+b'\0' for source in manifest['sourcePaths'].values())
    errors_out=[tempfile.TemporaryFile(dir=destination.parent) for _ in range(3)]
    tar=subprocess.Popen(tar_command(manifest),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=errors_out[0])
    gzip=subprocess.Popen(['gzip','-1'],stdin=tar.stdout,stdout=subprocess.PIPE,stderr=errors_out[1]);tar.stdout.close()
    age=subprocess.Popen([str(AGE),'-R',str(recipient)],stdin=gzip.stdout,stdout=subprocess.PIPE,stderr=errors_out[2]);gzip.stdout.close()
    # Pipe input is delivered by a small writer thread so output can always drain.
    import threading
    errors=[]
    def feed():
        try:tar.stdin.write(filelist);tar.stdin.close()
        except BaseException as e:errors.append(type(e).__name__)
    writer=threading.Thread(target=feed);writer.start();written=0
    try:
        with destination.open('xb') as out:
            os.chmod(destination,0o600)
            deadline=time.monotonic()+1800
            while True:
                need(time.monotonic()<deadline,'Archive pipeline exceeded30-minute bound')
                ready,_,_=select.select([age.stdout],[],[],1)
                if not ready:continue
                data=os.read(age.stdout.fileno(),1024*1024)
                if not data:break
                written+=len(data);need(written<=MAX_BYTES,'Encrypted archive exceeds reviewed bound');out.write(data)
            out.flush();os.fsync(out.fileno())
        writer.join(timeout=30);need(not writer.is_alive() and not errors,'Archive file list was not fully delivered')
        statuses=[p.wait(timeout=30) for p in [tar,gzip,age]]
        need(statuses==[0,0,0],'Archive pipeline failed; partial ciphertext retained')
    finally:
        for p in [tar,gzip,age]:
            if p.poll() is None:p.terminate()
        for p in [tar,gzip,age]:
            try:p.wait(timeout=10)
            except subprocess.TimeoutExpired:p.kill();p.wait()
        writer.join(timeout=10)
        for proc in [tar,gzip,age]:
            for pipe in [proc.stdin,proc.stdout,proc.stderr]:
                if pipe is not None and not pipe.closed:pipe.close()
        for f in errors_out:f.close()
    return written

def verify_archive(manifest,archive,identity):
    age_checked();p=subprocess.Popen([str(AGE),'-d','-i',str(identity),str(archive)],stdout=subprocess.PIPE,stderr=subprocess.PIPE);seen=set()
    try:
        with tarfile.open(fileobj=p.stdout,mode='r|gz') as tree:
            for item in tree:
                name=item.name.rstrip('/');need(name in manifest['entries'] and name not in seen,'Unexpected or duplicate archive member');seen.add(name);row=manifest['entries'][name]
                need(item.uid==row['uid'] and item.gid==row['gid'] and item.mode==row['mode'],'Archive ownership or mode differs')
                if row['kind']=='directory':need(item.isdir(),'Directory archive type differs')
                elif row['kind']=='symlink':need(item.issym() and item.linkname==row['link'],'Symlink archive target differs')
                elif 'hardlinkTo' in row:need(item.islnk() and item.linkname==row['hardlinkTo'],'Hardlink archive target differs')
                else:
                    need(item.isfile() and item.size==row['size'],'File archive type or size differs')
                    with tree.extractfile(item) as f:need(digest_stream(f)==row['sha256'],'File archive content differs')
        while p.stdout.read(1024*1024):pass
        need(p.wait(timeout=30)==0,'Archive authentication failed')
        need(seen==set(manifest['entries']),'Archive omits required content')
    finally:
        if p.poll() is None:
            p.terminate()
            try:p.wait(timeout=10)
            except subprocess.TimeoutExpired:p.kill();p.wait()
        p.stdout.close();p.stderr.close()
    return len(seen)

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('scope');ap.add_argument('manifest');a=ap.parse_args();out=pathlib.Path(a.manifest);need(not out.exists(),'Refusing manifest replacement');obj=inventory(json.loads(pathlib.Path(a.scope).read_text()));out.write_text(json.dumps(obj));out.chmod(0o600);print(json.dumps({'entries':len(obj['entries']),'apparentBytes':obj['apparentBytes'],'sourceFenceVerified':False}))
