"""Copy encrypted Ingenium recovery artifacts to existing NAS without source deletion."""
import argparse,hashlib,json,os,pathlib,shutil,subprocess,time,uuid
FLOOR=15*1024**3
STREAM="""from pathlib import Path
import sys,os,stat
p=Path(sys.argv[1]);root=Path(sys.argv[2])
if not p.resolve().is_relative_to(root.resolve()) or p.is_symlink() or not p.name.endswith('.age'):
 raise RuntimeError('Unexpected encrypted recovery source')
fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
with os.fdopen(fd,'rb') as f:
 before=os.fstat(f.fileno())
 if not stat.S_ISREG(before.st_mode):raise RuntimeError('Recovery source must be a regular file')
 while True:
  chunk=f.read(1024*1024)
  if not chunk:break
  sys.stdout.buffer.write(chunk)
 after=os.fstat(f.fileno())
 if (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns):
  raise RuntimeError('Recovery source changed during streaming')
"""
def digest(path):
 with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def main():
 ap=argparse.ArgumentParser();ap.add_argument('profile');a=ap.parse_args();profile=json.loads(pathlib.Path(a.profile).read_text());nas=pathlib.Path(profile['nasRoot'])
 if not str(nas).lower().startswith('\\\\truenas\\plex_smb_share\\branconet-recovery-backups\\ingenium\\'):raise RuntimeError('Unexpected recovery destination')
 if nas.is_symlink():raise RuntimeError('Recovery destination is a link')
 nas.mkdir(parents=True,exist_ok=True);resolved=nas.resolve();owner=nas/'owner.json'
 identity={'owner':profile['owner'],'purpose':'Encrypted Ingenium migration recovery; original PC data preserved'}
 if owner.exists():
  if json.loads(owner.read_text())!=identity:raise RuntimeError('Recovery destination has another owner')
 else:
  with owner.open('x') as f:json.dump(identity,f)
 receipt_name=profile.get('receiptName','nas-recovery-copy-receipt.json')
 if pathlib.Path(receipt_name).name!=receipt_name or not receipt_name.endswith('.json'):raise RuntimeError('Unexpected receipt filename')
 results=[];receipt_path=pathlib.Path(a.profile).resolve().parent/receipt_name;result={'owner':profile['owner'],'nasRoot':str(resolved),'startedAt':int(time.time()),'files':results,'sourceFilesRemoved':False,'completeApplicationMigration':False}
 def save():receipt_path.write_text(json.dumps(result,indent=2))
 save()
 for item in profile['files']:
  name=item['name']
  if pathlib.Path(name).name!=name or not name.endswith('.age'):raise RuntimeError('Unexpected recovery filename')
  final=nas/name
  if final.resolve().parent!=resolved:raise RuntimeError('Recovery target escapes declared directory')
  if final.exists():
   if final.stat().st_size!=item['bytes'] or digest(final)!=item['sha256']:raise RuntimeError('Existing recovery artifact differs; no overwrite')
   results.append({'name':name,'bytes':item['bytes'],'sha256':item['sha256'],'state':'existing_verified'});save();continue
  if shutil.disk_usage('C:/').free<FLOOR or shutil.disk_usage(nas).free-item['bytes']<FLOOR:raise RuntimeError('Recovery copy storage guard refused')
  partial=nas/(name+'.'+uuid.uuid4().hex+'.partial');row={'name':name,'partial':str(partial),'state':'copying'};results.append(row);save()
  child=subprocess.Popen(['wsl.exe','-d','Ubuntu','-u','root','--cd','/home/brajam','--exec','/usr/bin/python3','-B','-c',STREAM,item['source'],profile['sourceRoot']],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  h=hashlib.sha256();count=0
  try:
   with partial.open('xb') as out:
    while True:
     data=child.stdout.read(1024*1024)
     if not data:break
     count+=len(data)
     if count>item['bytes']:raise RuntimeError('Source exceeds declared encrypted artifact size')
     out.write(data);h.update(data)
    out.flush();os.fsync(out.fileno())
   if child.wait(timeout=30)!=0 or count!=item['bytes'] or h.hexdigest()!=item['sha256']:raise RuntimeError('Encrypted recovery stream differs; partial retained')
   if digest(partial)!=item['sha256']:raise RuntimeError('Full NAS encrypted-artifact readback differs')
   partial.rename(final)
   if digest(final)!=item['sha256']:raise RuntimeError('Published NAS artifact readback differs')
   row.update(state='copied_and_readback_verified',bytes=count,sha256=h.hexdigest(),path=str(final));save();print(json.dumps({'name':name,'bytes':count,'readbackVerified':True}),flush=True)
  finally:
   if child.poll() is None:child.terminate();child.wait(timeout=15)
   child.stdout.close();child.stderr.close()
 result.update(finishedAt=int(time.time()),passed=True);save();print('ENCRYPTED_NAS_RECOVERY_COPY_COMPLETE',flush=True)
if __name__=='__main__':main()
