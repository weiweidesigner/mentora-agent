# FLUX runtime deployment

The web host calls the pinned `flux-image` Skill. When `AICHART_FLUX_RUNNER`
names `flux_remote_runner.py`, the host checks the Mac worker's `/health` with
a five-second timeout before preparing/generating an image. An unavailable or
busy worker returns an actionable error, not a successful artifact. While the
Skill subprocess runs, status events report elapsed waiting time every ten
seconds; these are not claimed inference percentages or private subprocess logs.
The existing thirty-minute host deadline remains authoritative. Closing the
generator terminates its local subprocess group.

The authenticated Mac worker listens only on `127.0.0.1:8766`; the launchd SSH
tunnel forwards the web host's loopback port `18766` to it. `/health` reports
readiness and whether the single-generation slot is occupied. `/generate`
requires the existing bearer token, rejects overlapping jobs, bounds image
parameters/body size, and limits its runner to fifteen minutes. No secrets,
weights or generated images belong in Git.

Install `scripts/flux_mac_worker.py` into a durable runtime directory such as
`~/.local/lib/mentora-runtime/flux_mac_worker.py`, not a temporary source checkout.
The launchd `com.mentora.flux-worker` ProgramArguments must reference that saved
file with `--runner` pointing at the existing FLUX.2 runner and `--token-file`
pointing at the existing private token file. Keep the actual model/venv/runner
and token files when cleaning temporary development clones. Back up the plist
before changing it and restart the worker only when no generation is active.
The web host's configured runner must likewise use the checked-in
`scripts/flux_remote_runner.py` version; preserve executable permissions.

If a reconnect reports that port `18766` is occupied, first probe that exact
port's `/health`. A healthy existing tunnel must not be killed. If unhealthy,
identify the exact SSH listener and its owner before recovering it; never kill
all SSH processes or change unrelated forwards. Retain launchd's KeepAlive,
ExitOnForwardFailure and SSH keepalive settings.

Verify local and server-side health, then run the canonical Skill once with its
normal four-step settings and confirm fresh non-empty HTML plus a PNG signature.
The currently installed MFLUX scheduler fails for a one-step test; do not silently
substitute parameters for a user request or claim that such a test succeeded.
