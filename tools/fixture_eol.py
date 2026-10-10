#!/usr/bin/env python3
"""After tools/refresh-fixtures.sh: give each copied file the line endings git stores for it.

On Windows, Git's core.autocrlf=true writes every LF-stored text file of FLYFF-V19-SOURCE as CRLF on disk (the game and the
servers on that PC have always read those CRLF files: leave them so). The test copies must hold what the repo holds (what
Ubuntu sees, what the tests expect), so a copy of a file git stores as LF but finds CRLF on disk is turned back into LF.
Nothing in FLYFF-V19-SOURCE is touched. On Ubuntu nothing changes (no file is CRLF on disk and LF in git).
Usage: python3 tools/fixture_eol.py <FLYFF-V19-SOURCE> <test folder>
"""
import os
import subprocess
import sys

src, dst = sys.argv[1], sys.argv[2]
pairs = []
for sub, srcsub in (('Resource', 'Server/Resource'), ('Client', 'Client')):
    root = os.path.join(dst, sub)
    for dp, _, fn in os.walk(root):
        for f in fn:
            full = os.path.join(dp, f)
            pairs.append((full, srcsub + '/' + os.path.relpath(full, root).replace(os.sep, '/')))
eol = {}
for i in range(0, len(pairs), 200):
    r = subprocess.run(['git', '-C', src, 'ls-files', '--eol', '--'] + [p for _, p in pairs[i:i + 200]], capture_output=True, text=True)
    for line in r.stdout.splitlines():
        meta, path = line.split('\t', 1)
        eol[path] = meta.split()
n = 0
for full, p in pairs:
    m = eol.get(p)
    if m and len(m) >= 2 and m[0] == 'i/lf' and m[1] == 'w/crlf':
        b = open(full, 'rb').read()
        open(full, 'wb').write(b.replace(b'\r\n', b'\n'))
        n += 1
print(f'line endings: {n} copied file(s) were CRLF on disk but LF in git -> LF (as the repo holds them)')
