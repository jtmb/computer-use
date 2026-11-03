"""Console-free Windows host for the existing private WSL SSH supervisor."""
import argparse
import collections
import json
import os
import pathlib
import subprocess
import threading
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--state-root', required=True)
    args = parser.parse_args()
    root = pathlib.PurePosixPath(args.state_root)
    if (not root.is_absolute() or '..' in root.parts or
            any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_./-' for c in str(root))):
        raise RuntimeError('Use the declared absolute Linux runtime directory')
    state = pathlib.Path('\\\\wsl.localhost\\Ubuntu' + str(root).replace('/', '\\'))
    state.mkdir(parents=True, exist_ok=True)
    command = [str(pathlib.Path(os.environ['SystemRoot'])/'System32/wsl.exe'),
               '-d', 'Ubuntu', '-u', 'brajam', '--cd', '/home/brajam', '--exec',
               '/usr/bin/python3', '-B',
               '/mnt/c/Users/james/.codex/skills/ingenium-kubernetes-deploy/scripts/production_forward.py',
               '--state-root', str(root)]
    attempt = 0

    def status(**fields):
        value = {'time': int(time.time()), 'windowsHostPid': os.getpid(),
                 'attempt': attempt, 'consoleFree': True, **fields}
        temporary = state/'windows-host-status.next'
        temporary.write_text(json.dumps(value), encoding='utf-8')
        temporary.replace(state/'windows-host-status.json')

    while True:
        attempt += 1
        tail = collections.deque(maxlen=32)
        child = subprocess.Popen(command, stdin=subprocess.DEVNULL,
                                 stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                 creationflags=subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP)

        def drain():
            while True:
                chunk = child.stdout.read(2048)
                if not chunk:
                    return
                tail.append(chunk)

        reader = threading.Thread(target=drain, daemon=True)
        reader.start()
        status(phase='running', wslPid=child.pid)
        try:
            while child.poll() is None:
                time.sleep(0.5)
        finally:
            if child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()
            reader.join(timeout=3)
            child.stdout.close()
        diagnostic = b''.join(tail).decode(errors='replace')[-4096:]
        status(phase='restarting', wslPid=child.pid, exitCode=child.returncode,
               diagnostic=diagnostic)
        first_failure = state/'windows-host-first-exit.json'
        if not first_failure.exists():
            with first_failure.open('x', encoding='utf-8') as output:
                json.dump({'time': int(time.time()), 'exitCode': child.returncode,
                           'diagnostic': diagnostic}, output)
        time.sleep(min(30, 3 * attempt))


if __name__ == '__main__':
    main()
