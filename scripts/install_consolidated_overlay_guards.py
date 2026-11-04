#!/usr/bin/env python3
"""Retire integrated source patches on new releases while preserving rollback."""
import argparse
import ast
from pathlib import Path
import shutil


PREFIXES = ('mentora-theme-settings/', 'mentora-qq-group-proactive/',
            'mentora-qq-images/', 'mentora-character-performance/',
            'mentora-character-ui-cleanup/', 'mentora-affinity-wave/',
            'mentora-chat-views/', 'mentora-runtime-resources/',
            'mentora-nebula-fullscreen/', 'mentora-profile-position/',
            'mentora-widget-theme-refresh/')
MARK = '# mentora-consolidated-source-guard-v1'


def install(library, release):
    changed = []
    for prefix in PREFIXES:
        for path in (library / prefix).glob('*/install*.py'):
            if path.name not in {'install.py', 'install_overlay.py'}:
                continue
            source = path.read_text()
            if MARK in source:
                continue
            tree = ast.parse(source)
            at = 0
            for node in tree.body:
                if (isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant)
                        and isinstance(node.value.value, str)):
                    at = node.end_lineno
                elif isinstance(node, ast.ImportFrom) and node.module == '__future__':
                    at = node.end_lineno
                else:
                    break
            lines = source.splitlines(keepends=True)
            guard = (f'\n{MARK}\nfrom pathlib import Path as _ConsolidatedPath\n'
                     f'if (_ConsolidatedPath({str(release)!r}) / "module-repositories.json").is_file():\n'
                     '    print("Integrated source is supplied by pinned component repositories")\n'
                     '    raise SystemExit(0)\n\n')
            lines.insert(at, guard)
            updated = ''.join(lines)
            compile(updated, str(path), 'exec')
            backup = path.with_name(path.name + '.before-repository-split')
            if not backup.exists():
                shutil.copy2(path, backup)
            temporary = path.with_name(path.name + '.guard-new')
            temporary.write_text(updated)
            temporary.replace(path)
            changed.append(str(path))
    return changed


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--library', type=Path, default=Path('/home/ubuntu/.local/lib'))
    parser.add_argument('--release', type=Path, default=Path('/home/ubuntu/mentora-releases/current'))
    args = parser.parse_args()
    for path in install(args.library, args.release):
        print(path)
