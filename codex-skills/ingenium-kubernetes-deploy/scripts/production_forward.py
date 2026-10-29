#!/usr/bin/env python3
"""Private Ingenium access over existing SSH; no workload/resource mutations."""
import argparse,fcntl,json,os,pathlib,select,shlex,signal,subprocess,time
REMOTE=r"""
import fcntl,os,pathlib,select,signal,subprocess,sys,time
state=pathlib.Path.home()/'.local/state/ingenium-access'
state.mkdir(mode=0o700,parents=True,exist_ok=True)
if state.is_symlink() or state.stat().st_uid!=os.getuid() or state.stat().st_mode&0o077:raise SystemExit('unsafe access lease directory')
fd=os.open(state/'loopback-{dashboard}-{callback}.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
except BlockingIOError:raise SystemExit('existing access lease still owns loopback ports')
child=subprocess.Popen(['kubectl','-n','ingenium','port-forward','--address','127.0.0.1','--pod-running-timeout','30s','service/{service}','{dashboard}:3000','{callback}:1456'],stdin=subprocess.DEVNULL,start_new_session=True)
stop=False
"""
# The remote process owns only its port-forward child. Heartbeat loss closes it
# even if a broken network leaves sshd unaware that its former client exited.
REMOTE=REMOTE+r"""
def halt(*args):
 global stop
 stop=True
signal.signal(signal.SIGTERM,halt);signal.signal(signal.SIGINT,halt)
last=time.monotonic()
try:
 while not stop and child.poll() is None:
  ready,_,_=select.select([sys.stdin.buffer],[],[],1)
  if ready:
   if not os.read(sys.stdin.fileno(),4096):break
   last=time.monotonic()
  if time.monotonic()-last>45:break
finally:
 if child.poll() is None:
  os.killpg(child.pid,signal.SIGTERM)
  try:child.wait(timeout=10)
  except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);child.wait()
 os.close(fd)
raise SystemExit(child.returncode if child.returncode is not None and child.returncode>0 else 0)
"""

def remote_command(service,dashboard,callback):
    if service not in ['ingenium','ingenium-access-check']:raise ValueError('Unsupported scoped service')
    for p in [dashboard,callback]:
        if not 1024<=p<=65535:raise ValueError('Invalid loopback port')
    script=REMOTE.format(service=service,dashboard=dashboard,callback=callback)
    return shlex.join(['/usr/bin/python3','-u','-c',script])

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--state-root',required=True);ap.add_argument('--service',default='ingenium',choices=['ingenium','ingenium-access-check']);ap.add_argument('--dashboard-port',type=int,default=3000);ap.add_argument('--callback-port',type=int,default=1455);ap.add_argument('--remote-dashboard-port',type=int,default=23000);ap.add_argument('--remote-callback-port',type=int,default=21456);a=ap.parse_args()
    for p in [a.dashboard_port,a.callback_port]:
        if not 1024<=p<=65535:raise RuntimeError('Invalid local port')
    state=pathlib.Path(a.state_root);state.mkdir(mode=0o700,parents=True,exist_ok=True)
    if state.is_symlink() or state.stat().st_uid!=os.getuid() or state.stat().st_mode&0o077:raise RuntimeError('Unsafe access state directory')
    lock=os.open(state/'supervisor.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    args=['ssh','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=10','-o','ServerAliveCountMax=3','-i','/home/brajam/.ssh/id_ed25519','-p','2002','-L',f'127.0.0.1:{a.dashboard_port}:127.0.0.1:{a.remote_dashboard_port}','-L',f'127.0.0.1:{a.callback_port}:127.0.0.1:{a.remote_callback_port}','james@192.168.0.4',remote_command(a.service,a.remote_dashboard_port,a.remote_callback_port)]
    stopping=False;attempt=0
    def stop(*_):
        nonlocal stopping
        stopping=True
    signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
    def write_status(**fields):
        value={'time':int(time.time()),'supervisorPid':os.getpid(),'service':a.service,'attempt':attempt,**fields};tmp=state/'status.next';tmp.write_text(json.dumps(value));tmp.chmod(0o600);tmp.replace(state/'status.json')
    while not stopping:
        attempt+=1;child=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True);write_status(phase='connecting',sshPid=child.pid);last=0;pending=b'';bound=set()
        try:
            while not stopping and child.poll() is None:
                now=time.monotonic()
                if now-last>=10:
                    try:child.stdin.write(b'\n');child.stdin.flush()
                    except BrokenPipeError:break
                    last=now
                ready,_,_=select.select([child.stdout],[],[],0.25)
                if not ready:continue
                chunk=os.read(child.stdout.fileno(),4096)
                if not chunk:break
                pending=(pending+chunk)[-16384:]
                while b'\n' in pending:
                    line,pending=pending.split(b'\n',1);text=line.decode(errors='replace')
                    for port in [a.remote_dashboard_port,a.remote_callback_port]:
                        if 'Forwarding from 127.0.0.1:'+str(port)+' ' in text:bound.add(port)
                    if len(bound)==2:write_status(phase='forwarding',sshPid=child.pid)
        finally:
            if child.poll() is None:
                os.killpg(child.pid,signal.SIGTERM)
                try:child.wait(timeout=12)
                except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);child.wait()
            child.stdin.close();child.stdout.close();write_status(phase='stopped' if stopping else 'reconnecting',sshPid=child.pid,exitCode=child.returncode)
        until=time.monotonic()+3
        while not stopping and time.monotonic()<until:time.sleep(0.2)
    os.close(lock)
if __name__=='__main__':main()
