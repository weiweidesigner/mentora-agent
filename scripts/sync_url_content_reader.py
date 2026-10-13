#!/usr/bin/env python3
"""Install/check the pinned public URL content reader repository."""
import argparse
import json
import subprocess

from sync_business_charts import ROOT, sync


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--migrate', action='store_true')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--update', action='store_true')
    args = parser.parse_args()
    try:
        result = sync(ROOT, migrate=args.migrate, check=args.check, update=args.update,
                      manifest_name='url-content-reader.lock.json')
    except (ValueError, RuntimeError, subprocess.CalledProcessError) as exc:
        parser.exit(1, f'url-content-reader dependency: {exc}\n')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
