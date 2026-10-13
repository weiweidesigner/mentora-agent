#!/usr/bin/env python3
"""Install every dependency pinned by the host lock manifests."""
import argparse
import json
from sync_business_charts import ROOT, sync


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--update", action="store_true")
    args = parser.parse_args()
    for manifest in sorted(ROOT.glob("*.lock.json")):
        result = sync(ROOT, check=args.check, update=args.update, manifest_name=manifest.name)
        print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
