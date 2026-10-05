#!/usr/bin/env python3
"""Builds dist/flyff-resource-editor.html: one self-contained file.

A page opened from disk (file://) cannot load <script type="module" src=...>,
so the separate source files in src/ are inlined here in src/order.txt order.
Standard library only.  Usage: python3 build.py
"""
import datetime, pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / 'src'
OUT = ROOT / 'dist' / 'flyff-resource-editor.html'


def build_info():
    try:
        rev = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    except OSError:
        rev = ''
    return f"build 1 · {datetime.date.today().isoformat()}" + (f" · {rev}" if rev else '')


def main():
    harness = '--harness' in sys.argv
    order = [l.strip() for l in (SRC / 'order.txt').read_text().splitlines() if l.strip() and not l.startswith('#')]
    parts = [f'globalThis.FRE = globalThis.FRE || {{}}; FRE.BUILD_INFO = {build_info()!r};']
    for rel in order:
        code = (SRC / rel).read_text(encoding='utf-8')
        parts.append(f'// ---- {rel} ----\n{code}')
    if harness:  # test build: fake file system + scripted UI scenario (tests/ui-harness.js)
        import base64, json
        fx = ROOT / 'test-data' / 'Resource'
        data = {f.name: base64.b64encode(f.read_bytes()).decode() for f in sorted(fx.iterdir()) if f.is_file()}
        parts.append('FRE.HARNESS_FILES = ' + json.dumps(data) + ';')
        parts.append((ROOT / 'tests' / 'ui-harness.js').read_text(encoding='utf-8'))
    js = '\n'.join(parts)
    js = re.sub(r'</(script)', r'<\\/\1', js, flags=re.I)   # never close the inline <script> early
    css = (SRC / 'styles.css').read_text(encoding='utf-8')
    html = (SRC / 'shell.html').read_text(encoding='utf-8')
    html = html.replace('/*STYLES*/', css).replace('/*SCRIPTS*/', js)
    out = ROOT / 'test-data' / 'harness.html' if harness else OUT
    out.parent.mkdir(exist_ok=True)
    out.write_text(html, encoding='utf-8', newline='\n')
    print(f'wrote {out.relative_to(ROOT)} ({out.stat().st_size:,} bytes, {len(order)} source files)')


if __name__ == '__main__':
    main()
