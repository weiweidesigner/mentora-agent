# Ubuntu cloud deployment

The Mentora backend listens on loopback port 8000 and runs under systemd. Include `nginx-mentora.conf` (and `nginx-veya.conf` for legacy links) inside an existing HTTPS server block to serve `/mentora/` with streaming responses and direct access. The prefix filter adapts the current root-relative frontend/API/artifact URLs; verify chat, report iframes and sharing after frontend changes.

Install Python 3.11+, venv/pip, and Chromium dependencies. Install the repository and its pinned dependencies before `pip install -r requirements.txt`. Private dependency checkouts may be transferred from an authenticated local installation without placing GitHub account credentials on the server. Keep Git metadata to validate revisions with `scripts/setup_dependencies.py --check`.

Copy only runtime credentials to the server's ignored `.env`, mode 0600. Set `AICHART_PROJECT_ROOT` and `DSH_HOME` to server paths, set `AICHART_BASE_PATH=/mentora` for the prefix route, set the framework to `deepseek`, and remove developer-machine SDK paths. Local Apple Silicon FLUX/Ollama runtimes are not included in this CPU web deployment.

Install the service template at `/etc/systemd/system/veya-agent.service`, adjusting the user and paths as needed. This deployment uses direct access without a login password; visitors can invoke the configured model and tools. Keep model credentials and deployment details outside Git. HTTP requests to `/mentora/` should redirect to the HTTPS URL. Preserve and test existing site routes before reloading nginx.
