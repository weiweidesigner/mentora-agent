# Automatic GitHub deployment

The server checks `weiweidesigner/mentora-agent` branch `main` every two minutes
with `mentora-github-sync.timer`. Dependency repositories follow the exact
commits in the host's `*.lock.json` files. Update those locks in Git to deploy
dependency changes.

Each commit is prepared under `/home/ubuntu/mentora-releases/<commit>`.
Preparation downloads locked dependency sources, selects a Python environment
for the requirements, and checks Python/JavaScript syntax. Committed regular
files take precedence over dependency links. Runtime data, outputs, environment
secrets and Harness sessions remain in the existing server directories.
`outputs` and `work` are bind-mounted into each release, not symlinked outside
its workspace. This preserves shared data while keeping sandbox writes inside
the canonical project path. Preparation verifies the mounts before activation;
the web service's privileged `ExecStartPre` restores them after a reboot or rollback.
It never changes the sandbox mode or grants write access to the legacy project root.
`scripts/check_runtime_writes.py` uses the same Linux bwrap workspace-write
profile as the installed Harness. Before activation it verifies writes under
both shared directories and rejection of an outside-workspace write. Probe
files are isolated and removed automatically; it makes no model/API calls.

Only a prepared version replaces the `current` symlink. The web service then
restarts and must pass HTTP checks. A failed start restores the preceding
release. The same failed commit is not retried automatically; push a corrected
commit or run the deployment script with `--retry` after fixing an external
failure. Releases and the original deployment remain available for recovery.

```sh
systemctl status mentora-github-sync.timer
journalctl -u mentora-github-sync.service -n 60
cat /home/ubuntu/mentora-releases/status.json
sudo systemctl start mentora-github-sync.service
```

To pause automatic updates:

```sh
sudo systemctl stop mentora-github-sync.timer
```

The runner is installed at
`/home/ubuntu/.local/lib/mentora-deploy/auto_deploy.py`; the checked-in service,
timer and `mentora-release.conf` are the installation templates. The SSH key
and application `.env` stay on the server and are never included in Git.
Private dependency repositories use separate read-only GitHub deploy keys in
`/home/ubuntu/.ssh/mentora-auto/<repository-name>`. Public repositories use the
existing server GitHub SSH identity. No GitHub account token is stored by the runner.
