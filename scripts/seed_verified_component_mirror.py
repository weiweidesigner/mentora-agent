#!/usr/bin/env python3
"""Seed a Git mirror from authenticated metadata and hash-verified local blobs.

Used by the authenticated publisher when the deployment host has no independent
credential for a new private component. No credentials are accepted or stored.
"""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import subprocess


def git(repo, *args, data=None):
    result = subprocess.run(['git', '-C', str(repo), *args], input=data,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    return result.stdout.decode().strip()


def object_sha(kind, data):
    return hashlib.sha1(f'{kind} {len(data)}\0'.encode() + data).hexdigest()


def commit_bytes(commit):
    verification = commit.get('verification') or {}
    payload, signature = verification.get('payload'), verification.get('signature')
    if payload and signature:
        head, body = payload.split('\n\n', 1)
        signed = head + '\ngpgsig ' + signature.replace('\n', '\n ') + '\n\n' + body
        if object_sha('commit', signed.encode()) == commit['sha']:
            return signed.encode()
    def identity(key, zone):
        row = commit[key]
        timestamp = int(dt.datetime.fromisoformat(row['date'].replace('Z', '+00:00')).timestamp())
        return f"{row['name']} <{row['email']}> {timestamp} {zone}"
    headers = ['tree ' + commit['tree']['sha']]
    headers += ['parent ' + p['sha'] for p in commit['parents']]
    # REST converts dates to UTC and omits their original Git timezone offsets.
    # Recover only an encoding that reproduces the authenticated object SHA.
    zones = list(dict.fromkeys(['+0000', '+0800', '-0000'] + [
        f"{'+' if n >= 0 else '-'}{abs(n) // 60:02d}{abs(n) % 60:02d}"
        for n in range(-840, 841, 15)]))
    for author_zone in zones:
        for committer_zone in zones:
            identity_headers = ['author ' + identity('author', author_zone),
                                'committer ' + identity('committer', committer_zone)]
            value = '\n'.join(headers + identity_headers) + '\n\n' + commit['message']
            for candidate in (value, value + '\n', value.rstrip('\n')):
                if object_sha('commit', candidate.encode()) == commit['sha']:
                    return candidate.encode()
    raise ValueError('Commit metadata does not reproduce GitHub object: ' + commit['sha'])


def seed(repo, metadata, blobs, assets=None):
    if not repo.exists():
        subprocess.run(['git', 'init', '--bare', '-q', str(repo)], check=True)
    all_blobs = {}
    for tree in metadata['trees'].values():
        if tree.get('truncated'):
            raise ValueError('Incomplete tree metadata')
        for row in tree['tree']:
            if row['type'] == 'blob':
                all_blobs.setdefault(row['sha'], row['path'])
    for sha, relative in all_blobs.items():
        if subprocess.run(['git', '-C', str(repo), 'cat-file', '-e', sha],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
            continue
        path = blobs / sha
        if not path.is_file() and assets:
            path = assets / relative
        if not path.is_file():
            raise ValueError('Missing source blob: ' + relative)
        data = path.read_bytes()
        if object_sha('blob', data) != sha:
            raise ValueError('Source content does not match GitHub: ' + relative)
        assert git(repo, 'hash-object', '-w', '--stdin', data=data) == sha
    for root_sha, tree in metadata['trees'].items():
        groups = {'': []}
        expected = {'': root_sha}
        for row in tree['tree']:
            path = Path(row['path'])
            parent = path.parent.as_posix()
            if parent == '.':
                parent = ''
            groups.setdefault(parent, []).append(row)
            if row['type'] == 'tree':
                groups.setdefault(row['path'], [])
                expected[row['path']] = row['sha']
        for directory in sorted(groups, key=lambda x: len(Path(x).parts), reverse=True):
            records = b''.join(f"{r['mode']} {r['type']} {r['sha']}\t{Path(r['path']).name}\0".encode()
                               for r in groups[directory])
            actual = git(repo, 'mktree', '-z', data=records)
            if actual != expected[directory]:
                raise ValueError('Tree hash mismatch: ' + directory)
    for commit in metadata['commits'].values():
        raw = commit_bytes(commit)
        assert git(repo, 'hash-object', '-w', '-t', 'commit', '--stdin', data=raw) == commit['sha']
    git(repo, 'update-ref', 'refs/heads/published', metadata['head'])
    git(repo, 'fsck', '--connectivity-only', '--no-dangling', metadata['head'])
    return metadata['head']


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository', type=Path, required=True)
    parser.add_argument('--metadata', type=Path, required=True)
    parser.add_argument('--blobs', type=Path, required=True)
    parser.add_argument('--assets', type=Path)
    args = parser.parse_args()
    print(seed(args.repository, json.loads(args.metadata.read_text()), args.blobs, args.assets))
