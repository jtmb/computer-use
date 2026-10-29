#!/usr/bin/env python3
"""Consistent snapshot of Ingenium's readonly host history; does not stop host OpenCode."""
import hashlib,json,os,pathlib,shutil,sqlite3,time

def quote(name):return '"'+name.replace('"','""')+'"'
def signature(db):
    schema=list(db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name"))
    names=[r[1] for r in schema if r[0]=='table']
    return {'schemaSha256':hashlib.sha256(json.dumps(schema,separators=(',',':')).encode()).hexdigest(),
            'tableCounts':{name:db.execute('SELECT count(*) FROM '+quote(name)).fetchone()[0] for name in names}}

def snapshot(source,target,seconds=600):
    source=pathlib.Path(source);target=pathlib.Path(target)
    if target.exists() or target.is_symlink():raise RuntimeError('Refusing history snapshot replacement')
    if source.is_symlink() or not source.is_file():raise RuntimeError('History source must be a regular file')
    fd=os.open(target,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.close(fd)
    started=time.time();deadline=time.monotonic()+seconds
    def progress(status,left,total):
        if time.monotonic()>deadline:raise TimeoutError('Consistent history capture exceeded reviewed bound')
    src=sqlite3.connect(source.as_uri()+'?mode=ro',uri=True,timeout=10);dst=sqlite3.connect(target,timeout=10)
    try:
        src.execute('BEGIN')
        expected=signature(src)
        src.backup(dst,pages=256,progress=progress,sleep=0.05)
        src.rollback()
        actual=signature(dst)
        if expected!=actual:raise RuntimeError('Consistent history schema or row counts differ')
        if dst.execute('PRAGMA quick_check').fetchall()!=[('ok',)]:raise RuntimeError('History snapshot integrity check failed')
        dst.execute('PRAGMA journal_mode=DELETE').fetchone()
    # Context managers commit transactions; explicitly close before file metadata/archiving.
    finally:
        src.close();dst.close()
    st=source.stat();os.chown(target,st.st_uid,st.st_gid);shutil.copystat(source,target,follow_symlinks=False)
    for suffix in ['-wal','-shm','-journal']:
        if pathlib.Path(str(target)+suffix).exists():raise RuntimeError('History snapshot sidecar remains')
    with target.open('rb') as f:
        h=hashlib.file_digest(f,'sha256').hexdigest()
    return {'method':'SQLite backup API in fixed readonly transaction; independent host writer remains running',
            'startedAt':started,'finishedAt':time.time(),'bytes':target.stat().st_size,'sha256':h,
            'signature':actual,'quickCheck':'ok','sourceOpenedReadOnly':True,'furtherHostWritesRemainOnOriginal':True}
