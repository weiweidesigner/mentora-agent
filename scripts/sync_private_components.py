#!/usr/bin/env python3
"""Install or verify the private Mentora components using their pinned locks."""
import argparse
import json

from sync_business_charts import ROOT, sync


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--update', action='store_true')
    parser.add_argument('--migrate', action='store_true')
    args = parser.parse_args()
    for name in ('mentora-companion', 'mentora-themes', 'mentora-workflows',
                 'ainvest-page-navigation'):
        print(json.dumps(sync(ROOT, check=args.check, update=args.update,
                              migrate=args.migrate, manifest_name=name + '.lock.json'),
                         ensure_ascii=False))


if __name__ == '__main__':
    main()
