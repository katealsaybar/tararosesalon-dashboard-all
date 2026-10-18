#!/usr/bin/env python3
"""Stamp every ?v= on a local .js / .css reference from the file's own content.

Audit 18 Oct 2026 (P1-19). The stamps used to be bumped by hand in index.html, hub/*.html, upload/*.html and
the lazy-load map, and a forgotten bump meant a phone kept running yesterday's file. Now the stamp is the first
eight hex digits of the file's hash, so it changes when the file does and not otherwise.

    python scripts/stamp-assets.py            rewrite the stamps that are stale
    python scripts/stamp-assets.py --check    exit 1 and list the stale ones (nothing is written)

The hash ignores any ?v= text inside the file and line endings, so a file that names another file's stamp does
not change because that one did, and Windows and the server agree. Run it after editing any script or
stylesheet and before the commit; the search-index builder's --check is a separate gate.
"""
import hashlib
import os
import re
import sys
from urllib.parse import unquote

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SKIP_DIRS = {'.git', 'node_modules', 'vendor', 'archive', '_source', 'FINAL CARDS 2ND BATCH', 'docs',
             'migrations', 'supabase', 'mobile-audit', '.claude', '__pycache__'}
REF = re.compile(r"(?P<path>[A-Za-z0-9_@%./-]+?\.(?:js|css))\?v=(?P<v>[A-Za-z0-9_.-]+)")
STAMP = re.compile(r"\?v=[A-Za-z0-9_.-]+")
_hash_cache = {}


def digest(path):
    if path not in _hash_cache:
        with open(path, 'rb') as f:
            raw = f.read().replace(b'\r\n', b'\n')
        text = STAMP.sub('?v=', raw.decode('utf-8', 'replace'))
        _hash_cache[path] = hashlib.sha1(text.encode('utf-8')).hexdigest()[:8]
    return _hash_cache[path]


def resolve(ref_path, from_file):
    p = unquote(ref_path)
    if p.startswith('/'):
        cands = [os.path.join(ROOT, p.lstrip('/'))]
    else:
        cands = [os.path.join(os.path.dirname(from_file), p), os.path.join(ROOT, p)]
    for c in cands:
        c = os.path.normpath(c)
        if os.path.isfile(c):
            return c
    return None


def sources():
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            if name.endswith(('.html', '.js')) and name != 'search-index.js':
                yield os.path.join(base, name)


def main():
    check = '--check' in sys.argv
    stale, missing, changed_files = [], [], 0
    for src in sources():
        with open(src, 'rb') as f:
            raw = f.read()
        crlf = b'\r\n' in raw
        text = raw.decode('utf-8', 'replace')
        if '?v=' not in text:
            continue
        rel = os.path.relpath(src, ROOT).replace(os.sep, '/')

        def fix(m):
            target = resolve(m.group('path'), src)
            if not target:
                missing.append(f"{rel}: {m.group('path')}")
                return m.group(0)
            want = digest(target)
            if m.group('v') != want:
                stale.append(f"{rel}: {m.group('path')} {m.group('v')} -> {want}")
                return f"{m.group('path')}?v={want}"
            return m.group(0)

        new = REF.sub(fix, text)
        if new != text and not check:
            with open(src, 'wb') as f:
                f.write(new.encode('utf-8'))
            changed_files += 1
    if check:
        if stale:
            print(f"STAMP CHECK FAILED ({len(stale)} stale): run  python scripts/stamp-assets.py  and commit it")
            for s in stale[:40]:
                print('  - ' + s)
            sys.exit(1)
        print('stamp check ok: every ?v= matches its file')
    else:
        print(f"stamped {len(stale)} reference(s) in {changed_files} file(s)")
    if missing:
        print(f"note: {len(set(missing))} reference(s) point at a file that is not here (left alone):")
        for s in sorted(set(missing))[:15]:
            print('  ? ' + s)


if __name__ == '__main__':
    main()
