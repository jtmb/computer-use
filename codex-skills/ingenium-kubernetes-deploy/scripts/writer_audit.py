#!/usr/bin/env python3
"""Readonly process-file writer audit across container path aliases; no service control."""
import json,os,pathlib,stat

def identities(scope):
    names={};errors=[]
    for root in scope['sources']:
        source=pathlib.Path(root['source']);excluded=set(root.get('excludedPreservedOnSource',[]));omitted=set(root.get('omittedSupersededFiles',[]))
        for base,dirs,files in os.walk(source,followlinks=False,onerror=lambda e:errors.append(type(e).__name__)):
            base=pathlib.Path(base)
            for name in list(dirs):
                if (base/name).relative_to(source).as_posix() in excluded|omitted:dirs.remove(name)
            for name in files:
                q=base/name;rel=q.relative_to(source).as_posix()
                if rel in excluded|omitted:continue
                try:
                    s=q.lstat()
                    if stat.S_ISREG(s.st_mode):names[(s.st_dev,s.st_ino)]=root['target']+'/'+rel
                except FileNotFoundError:errors.append('source_path_disappeared')
    return names,errors

def audit(scope,source_container_id=None):
    files,errors=identities(scope);writers=[];unreadable=[]
    for proc in pathlib.Path('/proc').iterdir():
        if not proc.name.isdigit() or int(proc.name)==os.getpid():continue
        pid=int(proc.name)
        try:
            group=(proc/'cgroup').read_text();owned=bool(source_container_id and source_container_id in group)
            try:exe=os.readlink(proc/'exe')
            except OSError:exe='unavailable'
            seen=set()
            for fd in (proc/'fd').iterdir():
                try:
                    info=(proc/'fdinfo'/fd.name).read_text();flags=next((int(l.split()[1],8) for l in info.splitlines() if l.startswith('flags:')),0)
                    if flags&os.O_ACCMODE==os.O_RDONLY:continue
                    s=fd.stat();key=(s.st_dev,s.st_ino)
                    if key in files and key not in seen:
                        seen.add(key);writers.append({'pid':pid,'exe':exe,'logicalPath':files[key],'sourceContainer':owned,'method':'writable_fd_by_device_inode'})
                except (FileNotFoundError,ProcessLookupError):continue
                except PermissionError:unreadable.append({'pid':pid,'kind':'fd_permission_denied'})
            for line in (proc/'maps').read_text().splitlines():
                fields=line.split(None,5)
                if len(fields)<5 or 'w' not in fields[1] or not fields[1].endswith('s'):continue
                major,minor=(int(v,16) for v in fields[3].split(':'));key=(os.makedev(major,minor),int(fields[4]))
                if key in files and key not in seen:
                    seen.add(key);writers.append({'pid':pid,'exe':exe,'logicalPath':files[key],'sourceContainer':owned,'method':'shared_writable_mapping_by_device_inode'})
        except (FileNotFoundError,ProcessLookupError):continue
        except PermissionError:unreadable.append({'pid':pid,'kind':'process_permission_denied'})
    return {'indexedFiles':len(files),'writers':writers,'inventoryErrors':errors,'unreadableProcesses':unreadable,'quiescenceProven':not writers and not errors and not unreadable,'sourceContainerIdSupplied':bool(source_container_id)}
