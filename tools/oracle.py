#!/usr/bin/env python3
"""Independent reference counts for the JS emulator (differential testing).

Written separately from the JS code (it began as the Phase 2 investigation
script), so if both agree we have two implementations saying the same thing.
Usage: python3 tools/oracle.py <Resource folder>   -> prints JSON
"""
import collections, json, os, re, sys

DEL = set(b"+-*^/%=;(),':{}.")
ISDELIM = set(b" !:;,+-<>'/*%^=()&|\"{}\t\r\n\x00")


def tokens(b):
    i, n, out = 0, len(b), []
    while True:
        while True:
            while i < n and 0 < b[i] <= 0x20:
                i += 1
            if b[i:i + 2] == b'//':
                while i < n and b[i] not in (13, 10):
                    i += 1
                continue
            if b[i:i + 2] == b'/*':
                j = b.find(b'*/', i + 2)
                i = n if j < 0 else j + 2
                continue
            break
        if i >= n:
            return out
        c = b[i]
        if c in b'!<>' or (c == 61 and b[i + 1:i + 2] == b'='):
            k = 2 if b[i + 1:i + 2] == b'=' else 1
            out.append(b[i:i + k]); i += k; continue
        if c in DEL:
            out.append(bytes([c])); i += 1; continue
        if c == 34:
            j = i + 1
            while j < n and b[j] not in (34, 13):
                j += 1
            out.append(b'"' + b[i + 1:j] + b'"'); i = j + 1; continue
        j = i
        while j < n and b[j] not in ISDELIM:
            j += 1
        if j == i:
            j = i + 1
        out.append(b[i:j]); i = j


def values(ts):
    v, k = [], 0
    while k < len(ts):
        if ts[k] in (b'-', b'+') and k + 1 < len(ts):
            v.append(ts[k] + ts[k + 1]); k += 2
        else:
            v.append(ts[k]); k += 1
    return v


def read_defines(root, names):
    d = {}
    for n in names:
        for m in re.finditer(rb'#define[ \t]+(\w+)[ \t]+(0x[0-9a-fA-F]+|\d+)', open(os.path.join(root, n), 'rb').read()):
            k = m.group(1).decode()
            if k not in d:
                v = m.group(2).decode()
                d[k] = int(v, 16) if v.startswith('0x') else int(v)
    return d


def num(tok, defs):
    """A value as GetNumber sees it: '=' is -1, '-5' negative, names via defines."""
    s = tok.decode() if isinstance(tok, bytes) else tok
    s = s.strip()
    if s == '=':
        return -1
    neg = s.startswith('-')
    s = s.lstrip('+-')
    v = defs.get(s)
    if v is None:
        m = re.match(r'\d+', s)
        v = int(m.group()) if m else 0
    return -v if neg else v


def vendor_sim(root):
    """Independent re-implementation of how the server fills NPC shops.
    Reads Spec_Item.txt by its tab columns (named by the file's own header row)."""
    defs = read_defines(root, ['defineJob.h', 'defineItem.h', 'defineItemkind.h'])
    lines = open(os.path.join(root, 'Spec_Item.txt'), 'rb').read().decode('latin1').split('\r\n')
    header = [h.lstrip('/') for h in lines[1].split('\t')]
    col = {h: i for i, h in enumerate(header)}
    U = lambda v: v & 0xffffffff
    props = {}
    amp = 60000
    for l in lines:
        if not l.strip() or l.lstrip().startswith('//'):
            continue
        c = l.split('\t')
        if num(c[0], defs) > 19:
            continue
        p = dict(id=U(num(c[col['dwID']], defs)), define=c[col['dwID']].strip(),
                 ik1=U(num(c[col['dwItemKind1']], defs)), ik3=U(num(c[col['dwItemKind3']], defs)),
                 job=U(num(c[col['dwItemJob']], defs)), rare=U(num(c[col['dwItemRare']], defs)),
                 shop=U(num(c[col['dwShopAble']], defs)), chip=num(c[col['dwReferValue1']], defs))
        props[p['id']] = p
        if p['ik3'] == defs['IK3_EXP_RATE']:
            for _ in range(num(c[col['nMaxDuplication']], defs) - 1):
                props[amp] = dict(p, id=amp); amp += 1
    kinds = collections.defaultdict(list)
    for i in sorted(props):
        p = props[i]
        if p['ik3'] != 0xffffffff and p['ik3'] < 300:
            kinds[p['ik3']].append(p)
    mm = {}
    for k, a in kinds.items():
        for j in range(len(a) - 1):          # the server's (unstable) swap sort
            for m in range(j + 1, len(a)):
                if a[m]['rare'] < a[j]['rare']:
                    a[j], a[m] = a[m], a[j]
        for j, p in enumerate(a):
            if p['rare'] != 0xffffffff:
                mm.setdefault((k, p['rare']), [j, j])[1] = j

    def idx(k, r, w):
        r = U(r)
        return -1 if r >= 400 else mm.get((U(k), r), [-1, -1])[w]

    out, empty = {}, 0
    for f in ['character.inc', 'character-etc.inc', 'character-school.inc']:
        t = open(os.path.join(root, f), 'rb').read()[2:].decode('utf-16-le').encode('utf-8', 'replace')
        v = values(tokens(t))
        i = 0
        while i < len(v):
            key = v[i].decode('utf-8', 'replace'); i += 2      # name + the token taken as '{'
            depth, vtype, stm = 1, 0, []
            while depth and i < len(v):
                tk = v[i]; i += 1
                if tk == b'{': depth += 1
                elif tk == b'}': depth -= 1
                elif tk in (b'AddVendorItem', b'AddVenderItem'):
                    a = [v[i + 1 + 2 * k] for k in range(6)]; i += 13
                    stm.append(('gen', [num(x, defs) for x in a]))
                elif tk in (b'AddVenderItem2', b'AddVendorItem2'):
                    stm.append(('chip', [num(v[i + 1], defs), num(v[i + 3], defs)])); i += 5
                elif tk == b'AddShopItem':
                    slot, it = num(v[i + 1], defs), num(v[i + 3], defs)
                    i += 5 if v[i + 4] == b')' else 7
                    stm.append(('fixed', [slot, it]))
                elif tk == b'SetVenderType':
                    vtype = num(v[i + 1], defs); i += 3
            tabs = []
            for tab in range(4):
                ent = []
                if vtype in (1, 2):
                    for kind, a in stm:
                        if kind == 'chip' and a[0] == tab:
                            p = props.get(U(a[1]))
                            if p and p['chip'] >= 1 and len(ent) < 100:
                                ent.append(p)
                else:
                    gen = []
                    for kind, a in stm:
                        if kind != 'gen' or a[0] != tab:
                            continue
                        _, ik3, job, lo, hi, _n = a
                        if len(gen) >= 100:
                            continue
                        mn = next((x for x in (idx(ik3, j, 0) for j in range(lo, hi + 1)) if x != -1), -1)
                        mx = next((x for x in (idx(ik3, j, 1) for j in range(hi, lo - 1, -1)) if x != -1), -1)
                        if mn < 0:
                            empty += 1
                            continue
                        for p in kinds[U(ik3)][mn:mx + 1]:
                            if p['shop'] == 0xffffffff or (job != -1 and p['job'] != U(job)):
                                continue
                            if len(gen) >= 100:
                                break
                            gen.append(p)
                    for j in range(len(gen) - 1):
                        for m in range(j + 1, len(gen)):
                            a_, b_ = gen[j], gen[m]
                            if b_['ik1'] < a_['ik1'] or (b_['ik1'] == a_['ik1'] and b_['rare'] < a_['rare']):
                                gen[j], gen[m] = gen[m], gen[j]
                    ent += gen
                for kind, a in stm:
                    if kind == 'fixed' and a[0] == tab:
                        p = props.get(U(a[1]))
                        if p and len(ent) < 100:
                            ent.append(p)
                tabs.append([p['id'] for p in ent])
            out[f + '|' + key] = tabs
    return out, empty


def battlepass(root, path):
    """BattlePass.inc by regex over comment-stripped text, monster levels from
    propMover.txt read as tab-separated columns (one record per line)."""
    raw = open(path, 'rb').read()
    t = raw.decode('latin-1')
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    t = re.sub(r'//[^\r\n]*', '', t)
    defs = read_defines(root, ['define.h', 'defineItem.h', 'defineObj.h', 'defineAttribute.h'])
    passes = re.findall(r'\bBPItem\s+(\S+)\s+(\S+)\s+(\S+)', t)
    rewards = re.findall(r'\bBPReward\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+"([^"]*)"\s+"([^"]*)"\s+"([^"]*)"', t)
    monsters = re.findall(r'\bBPMonster\s+(\S+)\s+(\S+)\s+(\S+)', t)
    movers = {}
    for line in open(os.path.join(root, 'propMover.txt'), 'rb').read().decode('latin-1').splitlines():
        c = [x.strip() for x in line.split('\t')]
        if len(c) > 16 and c[0].startswith('MI_'):
            movers[c[0]] = (num(c[12], defs), num(c[15], defs))
    bands = [(20, 4, 6), (40, 8, 12), (60, 14, 20), (80, 22, 32), (100, 32, 44), (120, 44, 60), (140, 60, 80), (10 ** 9, 80, 110)]
    mult = {4: 1.5, 5: 1.25, 7: 2}
    off = 0
    for name, lo, hi in monsters:
        lv, rk = movers[name]
        b = next(x for x in bands if lv <= x[0])
        k = mult.get(rk, 1)
        if (int(lo), int(hi)) != (int(b[1] * k + 0.5), int(b[2] * k + 0.5)):
            off += 1
    levels = sorted(int(r[1]) for r in rewards)
    return {'passes': [[int(a), b, int(c)] for a, b, c in passes], 'rewards': len(rewards), 'levels': levels,
            'reach_top': sum(int(r[2]) for r in rewards if int(r[1]) < max(levels)) if levels else 0,
            'monsters': len(monsters), 'off_band': off,
            'mover_levels': {n: list(movers[n]) for n, _, _ in monsters},
            'eol': 'crlf' if b'\r\n' in raw else 'lf'}


def exchange(path):
    """Exchange_Script.txt as a nested-brace tree (balanced braces, NOT the server's
    token loop): every top-level `NAME { ... }`, its SET blocks and their lines."""
    raw = open(path, 'rb').read()
    ts = tokens(raw)

    def block(k):
        # ts[k] == b'{' -> (list of items, index after the matching '}'); an item is a token or a sub-block
        out, k = [], k + 1
        while k < len(ts) and ts[k] != b'}':
            if ts[k] == b'{':
                sub, k = block(k)
                out.append(sub)
            else:
                out.append(ts[k]); k += 1
        return out, k + 1

    menus, k = [], 0
    while k < len(ts):
        name = ts[k].decode('latin-1')
        body, k = block(k + 1)
        sets, other = [], []
        for i, x in enumerate(body):
            if isinstance(x, bytes) and x.startswith(b'SET') and i + 2 < len(body) and isinstance(body[i + 2], list):
                if x != b'SET':
                    other.append(x.decode())
                    continue
                parts = body[i + 2]
                st = {'cond': [], 'pay': [], 'paynum': None}
                for j, y in enumerate(parts):
                    if y == b'CONDITION':
                        lst = parts[j + 1]
                        st['cond'] = [[lst[q].decode(), int(lst[q + 1])] for q in range(0, len(lst), 2)]
                    if y == b'PAY':
                        st['paynum'] = int(parts[j + 1])
                        lst = parts[j + 2]
                        q, rows = 0, []
                        while q < len(lst):
                            row = [lst[q].decode(), int(lst[q + 1]), int(lst[q + 2])]
                            q += 3
                            if q < len(lst) and lst[q][:1].isdigit():
                                row.append(int(lst[q])); q += 1
                            rows.append(row)
                        st['pay'] = rows
                sets.append(st)
        menus.append({'name': name, 'sets': sets, 'unknown': sorted(set(other))})
    return {'menus': menus, 'eol': 'crlf' if b'\r\n' in raw else 'lf'}


def main(root):
    res = {}
    spec = values(tokens(open(os.path.join(root, 'Spec_Item.txt'), 'rb').read()))
    res['spec_values'] = len(spec)
    res['spec_rows'] = len(spec) // 175 if len(spec) % 175 == 0 else None
    cnt = collections.Counter()
    for f in ['character.inc', 'character-etc.inc', 'character-school.inc']:
        t = open(os.path.join(root, f), 'rb').read()[2:].decode('utf-16-le')
        t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
        t = re.sub(r'//[^\r\n]*', '', t)
        for k in ['AddShopItem', 'AddVenderItem2', 'AddVendorItem', 'SetVenderType', 'AddVendorSlot', 'SetName', 'AddMenu']:
            cnt[k] += len(re.findall(r'\b' + k + r'\b', t))
    res['character'] = dict(cnt)
    # DonationShop.inc: rows inside DONATIONSHOP { }, comments stripped (regex, not the token port)
    ds = os.path.join(root, 'DonationShop.inc')
    if os.path.exists(ds):
        t = open(ds, 'rb').read().decode('latin-1')
        t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
        t = re.sub(r'//[^\r\n]*', '', t)
        m = re.search(r'DONATIONSHOP\s*\{(.*?)\}', t, flags=re.S)
        rows = re.findall(r'DSItem\s+"([^"]*)"\s+(\w+)', m.group(1)) if m else []
        cats = []
        for c, _ in rows:
            if c not in cats:
                cats.append(c)
        res['donation'] = {'rows': len(rows), 'items': len({d for _, d in rows}), 'categories': cats,
                           'eol': 'crlf' if b'\r\n' in open(ds, 'rb').read() else 'lf'}
    bp = os.path.join(root, 'BattlePass.inc')
    if os.path.exists(bp):
        res['battlepass'] = battlepass(root, bp)
    ex = os.path.join(root, 'Exchange_Script.txt')
    if os.path.exists(ex):
        res['exchange'] = exchange(ex)
    shops, empty = vendor_sim(root)
    res['vendor'] = shops
    res['vendor_empty_rules'] = empty
    return res


if __name__ == '__main__':
    print(json.dumps(main(sys.argv[1] if len(sys.argv) > 1 else 'test-data/Resource')))
