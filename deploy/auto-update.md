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
