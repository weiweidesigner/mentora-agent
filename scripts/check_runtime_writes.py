#!/usr/bin/env python3
"""Bounded Linux sandbox probe; no model calls or application data changes."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile


def check(workspace):
    workspace=Path(workspace).resolve(strict=True)
    # Match the installed DSH bwrap workspace-write profile. /tmp is private.
    command=['bwrap','--ro-bind','/','/','--dev','/dev','--unshare-pid',
             '--proc','/proc','--die-with-parent','--tmpfs','/tmp',
             '--bind',str(workspace),str(workspace),'--chdir',str(workspace),'--']
    with tempfile.TemporaryDirectory(prefix='.sandbox-check-',dir=workspace/'outputs') as outputs, \
         tempfile.TemporaryDirectory(prefix='.sandbox-check-',dir=workspace/'work') as work, \
         tempfile.TemporaryDirectory(prefix='mentora-boundary-',dir=workspace.parent) as outside:
        script='''import json,sys
from pathlib import Path
for directory in sys.argv[1:3]:
    file=Path(directory)/'probe.txt'
    file.write_text('sandbox write verified')
    assert file.read_text()=='sandbox write verified'
try:
    (Path(sys.argv[3])/'must-not-write.txt').write_text('unexpected')
except PermissionError:
    pass
except OSError as error:
    import errno
    if error.errno!=errno.EROFS:raise
else:
    raise RuntimeError('Sandbox allowed an outside-workspace write')
print(json.dumps(dict(outputsWritable=True,workWritable=True,outsideWriteDenied=True)))
'''
        result=subprocess.run(command+[sys.executable,'-c',script,outputs,work,outside],
                              capture_output=True,text=True,timeout=20)
        if result.returncode:
            raise RuntimeError('Sandbox write check failed: '+result.stderr[-2000:])
        report=json.loads(result.stdout)
        assert all(report.values()),report
        print(json.dumps(report))


if __name__=='__main__':
    check(sys.argv[1])
