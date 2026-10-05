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
    return res


if __name__ == '__main__':
    print(json.dumps(main(sys.argv[1] if len(sys.argv) > 1 else 'test-data/Resource')))
