# Private component repositories

The application composes these pinned repositories through the existing lock-file installer:

| Repository | Owns |
| --- | --- |
| `weiweidesigner/mentora-companion` | QQ channel, chat, images/voice/singing, character/profile settings, memory and proactive contact |
| `weiweidesigner/mentora-themes` | Background selection, opening animation/audio, custom backgrounds and media assets |
| `weiweidesigner/mentora-workflows` | Scheduled tasks, task planning, workflow contracts/graph/execution and task UI |
| `weiweidesigner/ainvest-page-navigation` | Existing Android/iOS/Web navigation Skills |

`mentora-agent` owns the application entry points, shared conversation and account context, HTML shell, global layout, integration tests, chart/data integration and deployment machinery. Existing Deal and other upstream repository locks remain intact.

## Install and update

Private repositories require authenticated Git access. Run `python scripts/setup_dependencies.py` for a fresh checkout, or `python scripts/sync_private_components.py --update` after changing a component lock. `--check` validates installed commits, clean tracked sources and every export link. To intentionally replace a regular implementation with its repository link once, use `--migrate`; that installer retains a recovery copy.

Each Python module remains importable at its original `app.*` path. `app.host_paths.PROJECT_ROOT` provides the host root to repository-backed modules. Runtime databases, output files, account/robot secrets and device pairing credentials stay outside all component repositories.

Static component files are served from explicit lock exports through `app.component_assets`. The generic static server keeps its symlink-traversal protections. A component cannot expose Python source or another repository through the static asset mounts.

## Existing server migration

The first migration seeds authenticated, verified pinned Git objects into the server's existing bare mirror cache before updating `mentora-agent/main`. This requires no new credential or access grant. Future pinned revisions must either be seeded by the authenticated publisher or fetched using read access configured by the repository owner. No token or private key is committed.

Run `python scripts/install_consolidated_overlay_guards.py` on the existing server before activating this release. The script backs up integrated source-patch installers and makes them skip only releases containing `module-repositories.json`; rolling back to an earlier release restores their existing behavior. Device/navigation environment integrations remain separate.

## Validation during migration

344 backend, component asset and host-path tests passed after extraction. The selected browser unit suite passed 120 tests; 13 older task-workspace cases still refer to previous recommendation-wizard entries, saved-history test doubles or old labels. Those failures were present before extraction and are recorded rather than treated as a successful full frontend suite. Syntax checks and explicit component static URL checks are required before release activation.
