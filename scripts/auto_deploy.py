#!/usr/bin/env python3
"""Deploy GitHub main to isolated releases; keep the previous release on failure."""
from __future__ import annotations
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import urllib.request

LEGACY=Path('/home/ubuntu/veya-agent')
BASE=Path('/home/ubuntu/mentora-releases')
SSH='ssh -i /home/ubuntu/.ssh/portfolio_github -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/home/ubuntu/.ssh/github_known_hosts'
ENV={**os.environ,'GIT_TERMINAL_PROMPT':'0'}
ENV.pop('GIT_SSH_COMMAND',None)

def run(args,**kwargs):
    return subprocess.run([str(x) for x in args],check=True,env=ENV,timeout=900,**kwargs)

def output(args):
    return run(args,stdout=subprocess.PIPE,text=True).stdout.strip()

def mirror(name,repository,seed=None,revision=None):
    if not re.fullmatch(r'https://github.com/weiweidesigner/[A-Za-z0-9_.-]+\.git',repository):
        raise ValueError('Unexpected dependency repository')
    remote='git@github.com:'+repository.split('github.com/',1)[1]
    key=Path('/home/ubuntu/.ssh/mentora-auto')/repository.rsplit('/',1)[1][:-4]
    ssh=SSH.replace('/home/ubuntu/.ssh/portfolio_github',str(key)) if key.is_file() else SSH
    cache=BASE/'mirrors'/(name+'.git')
    if not cache.exists():
        if seed and (seed/'.git').exists():
            run(['git','clone','--quiet','--bare','--shared',seed,cache])
        else:
            run(['git','-c','core.sshCommand='+ssh,'clone','--quiet','--bare',remote,cache])
    run(['git','-C',cache,'config','core.sshCommand',ssh])
    run(['git','-C',cache,'remote','set-url','origin',remote])
    if revision:
        exists=subprocess.run(['git','-C',str(cache),'cat-file','-e',revision+'^{commit}'],env=ENV,stderr=subprocess.DEVNULL).returncode==0
        if not exists:run(['git','-C',cache,'fetch','--quiet','origin',revision])
    else:
        run(['git','-C',cache,'fetch','--quiet','origin','+refs/heads/main:refs/heads/main'])
    return cache

def export(cache,revision,destination):
    destination.mkdir(parents=True,exist_ok=True)
    archive=subprocess.Popen(['git','-C',str(cache),'archive',revision],stdout=subprocess.PIPE,env=ENV)
    try:run(['tar','-xf','-','-C',destination],stdin=archive.stdout)
    finally:archive.stdout.close()
    if archive.wait(timeout=60):raise RuntimeError('Git archive failed')

def safe(root,relative):
    path=Path(relative)
    if path.is_absolute() or '..' in path.parts:raise ValueError('Unsafe dependency path')
    return root/path

def requirements_digest(root):
    digest=hashlib.sha256()
    paths=[root/'requirements.txt']
    for manifest in sorted(root.glob('*.lock.json')):
        if manifest.name.startswith('.'):continue
        spec=json.loads(manifest.read_text())
        if 'checkout' in spec:paths.append(safe(root,spec['checkout'])/'requirements.txt')
    for path in paths:
        if path.is_file():
            digest.update(str(path.relative_to(root)).encode());digest.update(path.read_bytes())
    return digest.hexdigest()

def is_mountpoint(path):
    return subprocess.run(['mountpoint','--quiet',str(path)],env=ENV,check=False,timeout=10).returncode==0

def mount_runtime(destination):
    """Keep persistent tool writes inside the sandbox's canonical workspace."""
    destination=destination.resolve(strict=True)
    if destination==LEGACY.resolve():return
    if destination.parent!=BASE.resolve() or not re.fullmatch('[a-f0-9]{40}(?:-previous-attempt-[0-9]+)?',destination.name):
        raise ValueError('Runtime mounts require a managed release')
    for name in ('outputs','work'):
        source=LEGACY/name
        source.mkdir(mode=0o700,exist_ok=True)
        target=destination/name
        if target.is_symlink():
            if target.resolve()!=source.resolve():raise ValueError('Unexpected runtime link: '+str(target))
            target.unlink()  # Only the link is removed; persistent data stays untouched.
        target.mkdir(mode=0o700,exist_ok=True)
        if is_mountpoint(target):
            if not os.path.samefile(source,target):raise ValueError('Unexpected runtime mount: '+str(target))
        else:
            if any(target.iterdir()):raise ValueError('Refusing to cover nonempty runtime directory: '+str(target))
            run(['sudo','mount','--bind',source,target])
            if not is_mountpoint(target) or not os.path.samefile(source,target):
                raise RuntimeError('Runtime bind mount verification failed: '+str(target))

def prepare(revision,cache):
    destination=BASE/revision
    if destination.exists():
        destination.rename(BASE/(revision+'-previous-attempt-'+str(time.time_ns())))
    export(cache,revision,destination)
    locks=[]
    for path in sorted(destination.glob('*.lock.json')):
        if path.name.startswith('.'):continue
        spec=json.loads(path.read_text())
        if not all(key in spec for key in ('repository','revision','checkout','links')):continue
        if not re.fullmatch('[a-f0-9]{40}',spec['revision']):raise ValueError('Dependencies must pin a commit')
        checkout=safe(destination,spec['checkout'])
        dependency=mirror(path.stem,spec['repository'],safe(LEGACY,spec['checkout']),spec['revision'])
        checkout.parent.mkdir(parents=True,exist_ok=True)
        run(['git','clone','--quiet','--shared','--no-checkout',dependency,checkout])
        run(['git','-C',checkout,'fetch','--quiet',dependency,spec['revision']])
        run(['git','-C',checkout,'remote','set-url','origin',spec['repository']])
        run(['git','-C',checkout,'checkout','--quiet','--detach',spec['revision']])
        locks.append(spec)
        for target,source in spec['links'].items():
            target=safe(destination,target);source=safe(checkout,source)
            if not source.exists():raise ValueError('Missing dependency component: '+str(source))
            if target.is_symlink():
                if target.resolve()!=source.resolve():raise ValueError('Unexpected dependency link: '+str(target))
            elif not target.exists():
                target.parent.mkdir(parents=True,exist_ok=True)
                target.symlink_to(os.path.relpath(source,target.parent))
            # A checked-in regular implementation is an intentional host override.
    mount_runtime(destination)
    for name in ('.dsh','.dsh-v021','.env'):
        source=LEGACY/name
        if source.exists() and not (destination/name).exists():(destination/name).symlink_to(source)
    digest=requirements_digest(destination)
    environment=BASE/'environments'/digest
    ready=BASE/'environments'/(digest+'.ready')
    if not environment.exists():
        if digest==requirements_digest(LEGACY):
            environment.symlink_to(LEGACY/'.venv')
        else:
            run(['/usr/bin/python3','-m','venv',environment])
    if not ready.exists():
        if not environment.is_symlink():
            run([environment/'bin/python','-m','pip','install','-r','requirements.txt'],cwd=destination)
        ready.touch()
    (destination/'.venv').symlink_to(environment)
    run([environment/'bin/python','-m','compileall','-q','app'],cwd=destination)
    for path in ('app/static/app.js','app/static/widgets.js','app/static/portfolio.js'):
        run(['node','--check',path],cwd=destination)
    deal=next((spec['revision'] for spec in locks if spec['checkout']=='.dependencies/mentora-deal'),'')
    (destination/'deploy-runtime.env').write_text('MENTORA_AGENT_REVISION='+revision+'\nMENTORA_DEAL_REVISION='+deal+'\n')
    run([environment/'bin/python','-c','import app.presentation'],cwd=destination)
    run([environment/'bin/python',destination/'scripts/check_runtime_writes.py',destination],cwd=destination)
    return destination

def switch(target):
    temporary=BASE/('.current-'+str(time.time_ns()))
    temporary.symlink_to(target);temporary.replace(BASE/'current')

def healthy():
    deadline=time.monotonic()+100
    while time.monotonic()<deadline:
        try:
            for path in ('/','/api/client-config.js'):
                with urllib.request.urlopen('http://127.0.0.1:8000'+path,timeout=5) as response:
                    if response.status!=200:raise RuntimeError('HTTP health check failed')
            return True
        except Exception:time.sleep(3)
    return False

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--retry',action='store_true')
    parser.add_argument('--mount-current',action='store_true');args=parser.parse_args()
    if args.mount_current:
        mount_runtime(BASE/'current');return
    BASE.mkdir(parents=True,exist_ok=True)
    for name in ('mirrors','environments'):(BASE/name).mkdir(exist_ok=True)
    with (BASE/'deploy.lock').open('w') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return
        cache=mirror('mentora-agent','https://github.com/weiweidesigner/mentora-agent.git',LEGACY)
        revision=output(['git','-C',cache,'rev-parse','refs/heads/main'])
        current=BASE/'current';previous=current.resolve() if current.is_symlink() else LEGACY
        if previous.name==revision:
            print('Already deployed '+revision,flush=True);return
        failed=BASE/('failed-'+revision+'.json')
        if failed.exists() and not args.retry:
            print('Skipping previously failed revision '+revision,flush=True);return
        try:
            print('Preparing '+revision,flush=True)
            target=prepare(revision,cache)
            switch(target)
            try:
                run(['sudo','systemctl','restart','veya-agent'])
                if not healthy():raise RuntimeError('New release did not become healthy')
            except Exception:
                switch(previous);run(['sudo','systemctl','restart','veya-agent'])
                if not healthy():raise RuntimeError('Rollback also failed its health check')
                raise
            record=dict(revision=revision,previous=str(previous),deployedAt=dt.datetime.now(dt.timezone.utc).isoformat(),healthy=True)
            (BASE/'status.json').write_text(json.dumps(record,indent=2)+'\n')
            print('Deployed and healthy '+revision,flush=True)
        except Exception as exc:
            failed.write_text(json.dumps(dict(revision=revision,error=str(exc),failedAt=dt.datetime.now(dt.timezone.utc).isoformat()),indent=2)+'\n')
            raise

if __name__=='__main__':main()
