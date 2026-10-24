#!/usr/bin/env python3
"""Install/check the independently pinned Pine Script Skill."""
import argparse
import json
import subprocess

from sync_business_charts import ROOT, sync


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    parser.add_argument('--update',action='store_true')
    args=parser.parse_args()
    try:
        print(json.dumps(sync(ROOT,check=args.check,update=args.update,manifest_name='pine-script.lock.json'),ensure_ascii=False))
    except (ValueError,RuntimeError,subprocess.CalledProcessError) as exc:
        parser.exit(1,f'pine-script dependency: {exc}\n')


if __name__=='__main__':main()
