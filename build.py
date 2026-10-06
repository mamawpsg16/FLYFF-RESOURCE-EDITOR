#!/usr/bin/env python3
"""Builds dist/flyff-resource-editor.html: one self-contained file.

A page opened from disk (file://) cannot load <script type="module" src=...>,
so the separate source files in src/ are inlined here in src/order.txt order.
Standard library only.  Usage: python3 build.py
"""
import json, base64, datetime, pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / 'src'
OUT = ROOT / 'dist' / 'flyff-resource-editor.html'


def build_info():
    """Version = number of commits (one more per commit); "+" = built from uncommitted changes."""
    def git(*args):
        try:
            return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True).stdout.strip()
        except OSError:
            return ''
    count, rev = git('rev-list', '--count', 'HEAD'), git('rev-parse', '--short', 'HEAD')
    dirty = bool(git('status', '--porcelain', '--', 'src', 'build.py'))
    now = datetime.datetime.now()
    days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    when = f"{days[now.weekday()]} {now.day} {months[now.month - 1]} {now.year}, {now:%H:%M}"   # e.g. Tue 6 Oct 2026, 08:20
    return {'version': (count or '?') + ('+' if dirty else ''), 'when': when, 'rev': rev, 'dirty': dirty}


def main():
    harness = '--harness' in sys.argv
    order = [l.strip() for l in (SRC / 'order.txt').read_text().splitlines() if l.strip() and not l.startswith('#')]
    parts = [f'globalThis.FRE = globalThis.FRE || {{}}; FRE.BUILD_INFO = {json.dumps(build_info())};']
    for rel in order:
        code = (SRC / rel).read_text(encoding='utf-8')
        parts.append(f'// ---- {rel} ----\n{code}')
    if harness:  # test build: fake file system + scripted UI scenario (tests/ui-harness.js)
        fx = ROOT / 'test-data' / 'fixtures' / 'Resource'
        data = {f.name: base64.b64encode(f.read_bytes()).decode() for f in sorted(fx.iterdir()) if f.is_file()}
        # map files keep their folder: "World/WdMadrigal/WdMadrigal.dyo" (+ .rgn, .txt.txt, .wld.cnt: area names)
        data.update({f.relative_to(fx).as_posix(): base64.b64encode(f.read_bytes()).decode()
                     for pat in ('*.dyo', '*.rgn', '*.txt.txt', '*.wld.cnt') for f in sorted(fx.glob('World/*/' + pat))})
        parts.append('FRE.HARNESS_FILES = ' + json.dumps(data) + ';')
        tree = ROOT / 'test-data' / 'fixtures' / 'Client' / 'Client' / 'DonationShopTree.inc'
        parts.append('FRE.HARNESS_TREE = ' + json.dumps(base64.b64encode(tree.read_bytes()).decode() if tree.exists() else None) + ';')
        ml = ROOT / 'test-data' / 'fixtures' / 'Client' / 'Model.list'          # Client/Model file names (new-NPC model check)
        parts.append('FRE.HARNESS_MODEL_LIST = ' + json.dumps(ml.read_text(encoding='latin-1') if ml.exists() else None) + ';')
        # Client/Model/Texture names and each Mvr_*.o3d's textures (new-NPC texture check)
        for var, name in (('HARNESS_TEX_LIST', 'ModelTexture.list'), ('HARNESS_TEX_INDEX', 'Model.textures')):
            f = ROOT / 'test-data' / 'fixtures' / 'Client' / name
            parts.append(f'FRE.{var} = ' + json.dumps(f.read_text(encoding='latin-1') if f.exists() else None) + ';')
        parts.append((ROOT / 'tests' / 'ui-harness.js').read_text(encoding='utf-8'))
    js = '\n'.join(parts)
    js = re.sub(r'</(script)', r'<\\/\1', js, flags=re.I)   # never close the inline <script> early
    css = (SRC / 'styles.css').read_text(encoding='utf-8')
    html = (SRC / 'shell.html').read_text(encoding='utf-8')
    # Tab icon: the 64x64 entry of the client icon (FLYFF-V19-SOURCE Design/Logo/infinity_mmo.ico,
    # = Neuz/res/main_ico.ico since commit 9df9d5c8 "rebrand client to Infinity MMO").
    icon = base64.b64encode((SRC / 'favicon.png').read_bytes()).decode()
    html = html.replace('/*FAVICON*/', icon).replace('/*STYLES*/', css).replace('/*SCRIPTS*/', js)
    out = ROOT / 'test-data' / 'harness.html' if harness else OUT
    out.parent.mkdir(exist_ok=True)
    out.write_text(html, encoding='utf-8', newline='\n')
    print(f'wrote {out.relative_to(ROOT)} ({out.stat().st_size:,} bytes, {len(order)} source files)')


if __name__ == '__main__':
    main()
