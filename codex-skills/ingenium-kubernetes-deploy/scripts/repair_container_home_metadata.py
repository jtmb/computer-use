"""Apply authenticated source-home metadata after content and source-fence verification. Read JSON on stdin; never changes file contents."""
import json,sys,pathlib,os,stat,hashlib
patch=json.load(sys.stdin);allowed={'/home/ingenium-vscode/.config','/home/ingenium-vscode/.vscode-oss-shared','/home/ingenium-ttyd'}
items=[]
for x in patch['entries']:
 root=pathlib.Path(x['sourceHome']);assert str(root) in allowed
 rel=pathlib.PurePosixPath(x['relative']);assert not rel.is_absolute() and '..' not in rel.parts
 p=root if x['relative']=='.' else root/rel
 for parent in [p,*p.parents]:
  if parent==root.parent:break
  assert not parent.is_symlink()
 st=p.lstat();assert stat.S_ISDIR(st.st_mode) if x['kind']=='directory' else stat.S_ISREG(st.st_mode)
 if x['kind']=='file':
  with p.open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==x['sha256']
 items.append((p,x,st.st_mtime_ns))
for p,x,mtime in items:
 os.chown(p,x['uid'],x['gid'],follow_symlinks=False);os.chmod(p,x['mode'],follow_symlinks=False)
 st=p.lstat();assert st.st_uid==x['uid'] and st.st_gid==x['gid'] and stat.S_IMODE(st.st_mode)==x['mode'] and st.st_mtime_ns==mtime
 if x['kind']=='file':
  with p.open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==x['sha256']
print(json.dumps({'passed':True,'entriesRepaired':len(items),'sourceOwnershipAndModesMatch':True,'fileContentsUnchanged':True,'existingTimestampsUnchanged':True}))
