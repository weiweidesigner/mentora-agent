# TradingView query node

The production server cannot directly reach scanner.tradingview.com on its current network. The read-only TradingView tool therefore uses a loopback HTTP service across an authenticated SSH reverse tunnel. This does not expose a generic proxy or accept arbitrary destination URLs.

- Mac worker: `scripts/screener_mac_bridge.py`, bound to `127.0.0.1:8767`.
- Ubuntu tunnel endpoint: `127.0.0.1:18767`.
- Server settings: `TRADINGVIEW_SCREENER_RELAY_URL=http://127.0.0.1:18767`, `TRADINGVIEW_SCREENER_TOKEN_FILE=/home/ubuntu/.config/mentora/screener-token`.
- A fresh shared token is stored with mode 600 at `~/.config/mentora/screener-token` on each host, outside Git.
- Mac LaunchAgents: `com.mentora.screener-worker` and `com.mentora.screener-tunnel`; plists in `~/Library/LaunchAgents`, logs in `~/Library/Logs/com.mentora.screener-*.log`.
- The Mac worker runs the repository `.venv/bin/python`, and uses the existing local network proxy at `127.0.0.1:7890` for outbound TradingView requests. No credentials are sent by the model.
- The tunnel runs `ssh -NT -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -R 127.0.0.1:18767:127.0.0.1:8767` using the existing deployment identity. LaunchAgents restart failed processes and start at login.

The Mac must remain awake and connected. If the worker, local proxy or tunnel is unavailable, the tool returns an explicit error and the agent may choose another source. It does not produce fake rows or silently reclassify the failure as no candidates.

Health checks: `curl http://127.0.0.1:8767/health` on the Mac; `curl http://127.0.0.1:18767/health` on Ubuntu. `/screen` requires the shared bearer token and validates `TradingViewInput`. Only stock screening is supported; trading, arbitrary scripts and destination URLs are not accepted. Avoid printing the token when troubleshooting.

To use a server with direct access, clear `TRADINGVIEW_SCREENER_RELAY_URL` and restart the app. The exact same pinned TradingView client and schema are used in both transports.
