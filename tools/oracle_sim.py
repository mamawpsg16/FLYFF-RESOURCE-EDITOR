#!/usr/bin/env python3
"""Second, independent copy of the in-game simulators (differential testing).

Written straight from the C++, without looking at the JS simulators, so a slip in
one copy shows up as a disagreement in tests/run-tests.js. It makes its own test
cases (bags, seeds, small scripts), runs them, and prints both as JSON; the JS
test runs the same cases through src/loaders/exchange-sim.js and compares.

Usage: python3 tools/oracle_sim.py exchange|battlepass|area <Resource folder>   -> JSON

exchange: CExchange::Load_Script / CheckCondition / GetPayItemList / IsFull /
ResultExchange (_Common/Exchange.cpp), CMover::GetItemNum / RemoveItemA /
RemoveAllItem (MoverParam.cpp:3922, 3964), CMover::CreateItem (Mover.cpp:2757),
CItemContainer::GetEmptyCount / IsFull / Add (Item.h:470, 694, 726),
xRand / xRandom. __NEW_EXCHANGE_V19 on.
Same simplification as the JS copy: equipped items sit after the 336 bag slots
(in the server they keep the object id they had in the bag).
"""
import json, os, re, struct, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from oracle import tokens, ISDELIM  # the CScanner token split (shared with tools/oracle.py)

NULL_ID = 0xFFFFFFFF
BAG = 336            # MAX_INVENTORY
FREE = 168           # MAX_INVENTORY_FREE
PARTS = 31           # MAX_HUMAN_PARTS
FILLER = 0x7FFFFFF0  # "some other item" (packMax 1)
RESULTS = ['SUCCESS', 'FAILED', 'INVENTORY_FAILED', 'CONDITION_FAILED']

# CProject::LoadDefines (ProjectCmn.cpp:1372): first definition wins
DEFINE_FILES = ['define.h', 'defineNeuz.h', 'defineQuest.h', 'defineJob.h', 'defineItem.h', 'defineWorld.h',
                'defineItemkind.h', 'lang.h', 'defineObj.h', 'defineAttribute.h', 'defineSkill.h', 'defineText.h',
                'defineSound.h', 'resdata.h', 'WndStyle.h', 'definelordskill.h', 'defineHonor.h', 'ContinentDef.h',
                'defineMapComboBoxData.h', 'defineItemGrade.h', 'defineItemType.h']


def s16(v):
    v &= 0xFFFF
    return v - 0x10000 if v & 0x8000 else v


def s32(v):
    v &= 0xFFFFFFFF
    return v - 0x100000000 if v & 0x80000000 else v


def defines(root):
    names = {n.lower(): n for n in os.listdir(root)}
    d = {}
    for f in DEFINE_FILES:
        real = names.get(f.lower())
        if not real:
            continue
        for m in re.finditer(rb'^[ \t]*#define[ \t]+(\w+)[ \t]+(0x[0-9a-fA-F]+|\d+)[ \t]*(?://.*)?\r?$', open(os.path.join(root, real), 'rb').read(), re.M):
            k = m.group(1).decode()
            if k not in d:
                v = m.group(2).decode()
                d[k] = int(v, 16) if v.lower().startswith('0x') else int(v)
    return d


def atoi(s):
    m = re.match(r'\s*([+-]?\d+)', s)
    return int(m.group(1)) if m else 0


class Scanner:
    """CScanner::GetToken / GetNumber over a token list."""
    def __init__(self, data):
        self.t = [x.decode('latin-1') for x in tokens(data)]
        self.k = 0
        self.tok = None

    def get(self):
        self.tok = self.t[self.k] if self.k < len(self.t) else None
        self.k += 1
        return self.tok

    def number(self):
        x = self.get()
        if x is None:
            return 0
        if x.lower().startswith('0x'):
            return s32(int(x[2:] or '0', 16))
        if x == '=':
            return -1
        if x in ('-', '+'):
            y = self.get() or ''
            return -atoi(y) if x == '-' else atoi(y)
        return atoi(x)

    def peek_is_number(self):
        x = self.t[self.k] if self.k < len(self.t) else ''
        return x[:1].isdigit() and not x.lower().startswith('0x')


def load_script(data, D):
    """CExchange::Load_Script -> {mmi: [set, ...]} (first menu id wins)."""
    gdn = lambda name: D.get(name, -1)          # CScript::GetDefineNum
    gold = D['II_GOLD_SEED1']
    s = Scanner(data)
    table = {}
    s.get()
    while s.tok is not None:
        mmi = gdn(s.tok)
        s.get()           # {
        s.get()
        sets = []
        count = 0
        while s.tok is not None and s.tok[:1] != '}':
            if s.tok == 'DESCRIPTION':
                s.get(); s.get()
                while s.tok is not None and s.tok[:1] != '}':
                    s.get()
            elif s.tok == 'SET':
                count += 1
                st = {'msg': [], 'cond': [], 'pay': [], 'paynum': 0, 'bad': False}
                s.get()  # text id
                s.get()  # {
                s.get()
                while s.tok is not None and s.tok[:1] != '}':
                    if s.tok == 'RESULTMSG':
                        s.get(); s.get()
                        while s.tok is not None and s.tok[:1] != '}':
                            st['msg'].append(s.tok); s.get()
                    elif s.tok in ('CONDITION', 'REMOVE'):
                        which = s.tok
                        s.get(); s.get()
                        while s.tok is not None and s.tok[:1] != '}':
                            iid = gold if s.tok == 'PENYA' else gdn(s.tok)
                            n = s.number()
                            if which == 'CONDITION':
                                st['cond'].append([iid & 0xFFFFFFFF, n])
                            s.get()
                    elif s.tok in ('CONDITION_POINT', 'REMOVE_POINT'):
                        s.get(); s.get()
                        while s.tok is not None and s.tok[:1] != '}':
                            s.number(); s.get()
                    elif s.tok == 'PAY':
                        total, room = 0, True
                        st['paynum'] = s.number()
                        s.get(); s.get()
                        while s.tok is not None and s.tok[:1] != '}':
                            iid = gdn(s.tok) & 0xFFFFFFFF
                            n = s.number()
                            p = s.number()
                            flag = (s.number() & 0xFF) if s.peek_is_number() else 0
                            total += p
                            if total > 1000000:
                                if room:
                                    st['pay'].append([iid, n, p - (total - 1000000), flag])
                                    room = False
                            else:
                                st['pay'].append([iid, n, p, flag])
                                if total == 1000000:
                                    room = False
                            s.get()
                        if total < 1000000:
                            if st['pay']:
                                st['pay'][-1][2] += 1000000 - total
                            else:
                                st['bad'] = True      # vecPayItem[-1]: crash at startup
                    s.get()
                if count <= 30:
                    sets.append(st)
            s.get()
        if mmi not in table:
            table[mmi] = sets
        s.get()
    return table


def spec_props(root, D):
    """dwPackMax and bCharged per item id, read by the header row's column names."""
    lines = open(os.path.join(root, 'Spec_Item.txt'), 'rb').read().decode('latin-1').splitlines()
    head = [h.strip().lstrip('/') for h in lines[1].split('\t')]
    col = {h: i for i, h in enumerate(head)}
    val = lambda x: D.get(x.strip(), None) if not re.match(r'\s*[-\d=]', x) else (-1 if x.strip() == '=' else atoi(x))
    props = {}
    for l in lines:
        if not l.strip() or l.lstrip().startswith('//'):
            continue
        c = l.split('\t')
        iid = D.get(c[col['dwID']].strip())
        if iid is None:
            continue
        pm = val(c[col['dwPackMax']]) or 0
        ch = val(c[col['bCharged']]) or 0
        props[iid & 0xFFFFFFFF] = (pm & 0xFFFFFFFF, 1 if ch else 0)
    props[FILLER] = (1, 0)
    return props


class Rand:
    """xRand / xRandom: g_next = g_next * 1103515245 + 12345 (DWORD); xRandom(n) = xRand() % n."""
    def __init__(self, seed):
        self.g = seed & 0xFFFFFFFF

    def __call__(self, n):
        self.g = (self.g * 1103515245 + 12345) & 0xFFFFFFFF
        return self.g % (n & 0xFFFFFFFF)


class Player:
    def __init__(self, spec):
        self.gold = spec.get('gold', 0)
        self.unlocked = spec.get('unlocked', FREE)
        self.box = [None] * (BAG + PARTS)      # object id order: the bag, then the equipment
        for where, base in (('slots', 0), ('equip', BAG)):
            for k, v in spec.get(where, {}).items():
                iid, n, flag, ch, busy = v
                self.box[base + int(k)] = {'id': iid, 'n': n, 'flag': flag, 'ch': ch, 'busy': busy}
        left = spec.get('fill', 0)          # `fill` other items in the first empty bag slots
        for i in range(BAG):
            if left <= 0:
                break
            if self.box[i] is None:
                self.box[i] = {'id': FILLER, 'n': 1, 'flag': 0, 'ch': 0, 'busy': False}
                left -= 1

    def usable(self, i):      # IsUsableItem: not slot-locked, GetExtra() == 0
        it = self.box[i]
        return not (i < BAG and i >= self.unlocked) and not it['busy']

    def item_num(self, iid):  # CMover::GetItemNum
        total = 0
        for i, it in enumerate(self.box):
            if it is None:
                continue
            if not self.usable(i):
                return 0
            if it['id'] == iid:
                total += it['n']
        return total

    def empty_count(self):    # GetEmptyCount: bag positions below the unlock count
        return sum(1 for i in range(min(self.unlocked, BAG)) if self.box[i] is None)

    def remove(self, iid, num):   # CMover::RemoveItemA( dwItemId, short nNum )
        num = s16(num)
        if num == -1:
            got = 0
            for i, it in enumerate(self.box):
                if it and it['id'] == iid:
                    got += it['n']; self.box[i] = None
            return got
        left = num
        for i, it in enumerate(self.box):
            if left <= 0:
                break
            if it and it['id'] == iid:
                if left > it['n']:
                    left -= it['n']; self.box[i] = None
                else:
                    it['n'] -= left; left = 0
                    if it['n'] == 0:
                        self.box[i] = None
        return num - left

    def add(self, iid, num, flag, props):   # CMover::CreateItem -> CItemContainer::IsFull + Add
        pr = props.get(iid)
        if pr is None or iid == 0:
            return False
        pack, ch = s16(pr[0]), pr[1]
        top = min(self.unlocked, BAG)
        n = s16(num)
        t, fits = n, False
        for i in range(top):
            e = self.box[i]
            if e is None:
                if t > pack:
                    t -= pack
                else:
                    fits = True; break
            elif e['id'] == iid and e['flag'] == flag and e['ch'] == ch:
                if e['n'] + t > pack:
                    t -= pack - e['n']
                else:
                    fits = True; break
        if not fits:
            return False
        if pr[0] != 1:
            for i in range(top):
                e = self.box[i]
                if e and e['id'] == iid and e['n'] < pack and e['flag'] == flag and e['ch'] == ch:
                    if e['n'] + n > pack:
                        n -= pack - e['n']; e['n'] = pack
                    else:
                        e['n'] += n; n = 0; break
        if n > 0:
            for i in range(top):
                if self.box[i] is None:
                    put = pack if n > pack else n
                    self.box[i] = {'id': iid, 'n': put, 'flag': flag, 'ch': ch, 'busy': False}
                    n -= put
                    if n <= 0:
                        break
        return True

    def dump(self):
        return {'gold': self.gold, 'fill': sum(1 for it in self.box if it and it['id'] == FILLER),
                'items': [[i, it['id'], it['n'], it['flag']] for i, it in enumerate(self.box) if it and it['id'] != FILLER]}


def pay_list(st, rnd):   # CExchange::GetPayItemList
    items = list(range(len(st['pay'])))
    out = []
    left = 1000000
    roll = rnd(1000000)
    acc, got = 0, 0
    i = 0
    while i < len(items):
        acc += st['pay'][items[i]][2]
        if roll < acc:
            out.append(items[i])
            got += 1
            if got == st['paynum']:
                break
            left -= st['pay'][items[i]][2]
            if left <= 0:
                break
            roll = rnd(left)
            acc = 0
            del items[i]
            i = 0
        else:
            i += 1
    return out


def exchange_once(table, mmi, k, p, rnd, props, gold):
    """CExchange::ResultExchange -> (result, given line indexes, lost line indexes)."""
    sets = table.get(mmi)
    if sets is None or k > len(sets) - 1 or k < 0:
        return 'FAILED', [], []
    st = sets[k]
    for iid, n in st['cond']:                     # CheckCondition
        have = p.gold if iid == gold else p.item_num(iid)
        if have < n:
            ok = False
            break
    else:
        ok = True
    if not ok:
        return 'CONDITION_FAILED', [], []
    picks = pay_list(st, rnd)
    empty = p.empty_count()                       # IsFull
    for iid, n in st['cond']:
        rest = n
        for j in range(BAG):
            it = p.box[j]
            if it and p.usable(j) and it['id'] == iid:
                if it['n'] <= rest:
                    empty += 1
                rest -= it['n']
                if rest <= 0:
                    break
    for j in picks:
        iid, n = st['pay'][j][0], st['pay'][j][1]
        pr = props.get(iid)
        if pr:
            empty -= s32((n & 0xFFFFFFFF) // pr[0]) if pr[0] else 0
    if empty <= 0:
        return 'INVENTORY_FAILED', [], []
    for iid, n in st['cond']:                     # take
        if iid == gold:
            p.gold = max(0, p.gold - n)
            continue
        while n > 0x7FFF:
            p.remove(iid, 0x7FFF); n -= 0x7FFF
        p.remove(iid, n)
    given, lost = [], []
    for j in picks:                               # give
        iid, n, _, flag = st['pay'][j]
        if iid not in props:
            return 'CRASH', given, lost
        (given if p.add(iid, n, flag, props) else lost).append(j)
    return 'SUCCESS', given, lost


def run_case(case, table, props, gold):
    mmi = case['mmi']
    rnd = Rand(case['seed'])
    start = case['bag']
    p = Player(start)
    counts = {}
    per = [[0, 0] for _ in table[mmi][case['set']]['pay']] if mmi in table and case['set'] < len(table[mmi]) else []
    trace = []
    for _ in range(case['tries']):
        if case['mode'] == 'same':
            p = Player(start)
        res, given, lost = exchange_once(table, mmi, case['set'], p, rnd, props, gold)
        counts[res] = counts.get(res, 0) + 1
        for j in given:
            per[j][0] += 1
        for j in lost:
            per[j][1] += 1
        if case['tries'] <= 20:
            trace.append([res, given, lost])
        if res == 'CRASH':
            break
    return {'counts': counts, 'lines': per, 'trace': trace, 'end': p.dump()}


def stock_bag(st, times, free, props, gold, unlocked=FREE):
    """Ingredients for `times` exchanges in full stacks, then filler until `free` slots stay empty."""
    slots, g = [], 0
    for iid, n in st['cond']:
        need = max(0, n) * times
        if iid == gold:
            g += need
            continue
        pm, ch = props.get(iid, (1, 0))
        pack = min(pm, 0x7FFF) or 1
        while need > 0:
            slots.append([iid, min(pack, need), 0, ch, False])
            need -= pack
    fill = unlocked - len(slots) - free
    if fill < 0:
        return None
    return {'gold': g, 'unlocked': unlocked, 'slots': {str(i): v for i, v in enumerate(slots)}, 'fill': fill}


SMALL = [
    # (name, script, bag, tries, seed, mode)
    ('PAY 0 floor quirk', 'MMI_PET_RES01 { SET TID_GAME_COLLECT_COND01 { CONDITION { II_SYS_SYS_SCR_SCRAPTOPAZ 5 } '
     'PAY 0 { II_SYS_SYS_SCR_HOLY 1 333334 II_SYS_SYS_SCR_AMPESS 1 333333 II_SYS_SYS_SCR_BLESSEDNESS 1 333333 } } }',
     {'unlocked': 3, 'slots': {'0': ['II_SYS_SYS_SCR_SCRAPTOPAZ', 5], '1': ['FILLER', 1], '2': ['FILLER', 1]}}, 1, 1, 'same'),
    ('busy item', 'MMI_PET_RES01 { SET T { CONDITION { II_SYS_SYS_SCR_SCRAPTOPAZ 5 } PAY 1 { II_SYS_SYS_SCR_HOLY 1 1000000 } } }',
     {'slots': {'0': ['II_SYS_SYS_SCR_SCRAPTOPAZ', 5], '1': ['II_SYS_SYS_SCR_AMPESS', 1, 0, 1, True]}}, 1, 1, 'same'),
    ('locked slot', 'MMI_PET_RES01 { SET T { CONDITION { II_SYS_SYS_SCR_SCRAPTOPAZ 5 } PAY 1 { II_SYS_SYS_SCR_HOLY 1 1000000 } } }',
     {'slots': {'0': ['II_SYS_SYS_SCR_SCRAPTOPAZ', 5], '200': ['II_SYS_SYS_SCR_AMPESS', 1]}}, 1, 1, 'same'),
    ('equipped ingredient', 'MMI_PET_RES01 { SET T { CONDITION { II_SYS_SYS_SCR_SCRAPTOPAZ 5 } PAY 1 { II_SYS_SYS_SCR_HOLY 1 1000000 } } }',
     {'equip': {'0': ['II_SYS_SYS_SCR_SCRAPTOPAZ', 3]}, 'slots': {'0': ['II_SYS_SYS_SCR_SCRAPTOPAZ', 2]}}, 1, 1, 'same'),
    ('penya', 'MMI_PET_RES01 { SET T { CONDITION { PENYA 1000 } PAY 1 { II_SYS_SYS_SCR_HOLY 1 1000000 } } }',
     {'gold': 2500, 'slots': {'0': ['II_SYS_SYS_SCR_PERIN', 5]}}, 4, 1, 'keep'),
    ('qty -1', 'MMI_PET_RES01 { SET T { CONDITION { II_SYS_SYS_SCR_SCRAPTOPAZ = } PAY 1 { II_SYS_SYS_SCR_HOLY 1 1000000 } } }',
     {'slots': {'0': ['II_SYS_SYS_SCR_SCRAPTOPAZ', 7], '1': ['II_SYS_SYS_SCR_SCRAPTOPAZ', 9]}}, 1, 1, 'same'),
    ('40000 in chunks', 'MMI_PET_RES01 { SET T { CONDITION { II_SYS_SYS_SCR_SCRAPTOPAZ 40000 } PAY 1 { II_SYS_SYS_SCR_HOLY 1 1000000 } } }',
     {'slots': {str(i): ['II_SYS_SYS_SCR_SCRAPTOPAZ', 9999] for i in range(5)}}, 1, 1, 'same'),
    ('bound stack', 'MMI_PET_RES01 { SET T { CONDITION { II_SYS_SYS_SCR_SCRAPTOPAZ 1 } PAY 2 { II_SYS_SYS_SCR_HOLY 3 500000 2 II_SYS_SYS_SCR_HOLY 4 500000 } } }',
     {'slots': {'0': ['II_SYS_SYS_SCR_SCRAPTOPAZ', 6], '1': ['II_SYS_SYS_SCR_HOLY', 5, 0, 1]}}, 6, 3, 'keep'),
    ('chances over and under', 'MMI_PET_RES01 { SET T { CONDITION { II_SYS_SYS_SCR_SCRAPTOPAZ 1 } PAY 1 { II_SYS_SYS_SCR_HOLY 1 600000 II_SYS_SYS_SCR_AMPESS 1 600000 II_SYS_SYS_SCR_BLESSEDNESS 1 600000 } } '
     'SET T { CONDITION { II_SYS_SYS_SCR_SCRAPTOPAZ 1 } PAY 2 { II_SYS_SYS_SCR_HOLY 1 100000 II_SYS_SYS_SCR_AMPESS 1 100000 II_SYS_SYS_SCR_BLESSEDNESS 1 100000 } } }',
     {'slots': {'0': ['II_SYS_SYS_SCR_SCRAPTOPAZ', 1]}}, 3000, 9, 'same'),
    ('bound reward vs unbound stack, full bag', 'MMI_PET_RES01 { SET T { CONDITION { II_SYS_SYS_SCR_SCRAPTOPAZ 5 } PAY 0 { II_SYS_SYS_SCR_HOLY 1 500000 2 II_SYS_SYS_SCR_AMPESS 1 500000 } } }',
     {'unlocked': 3, 'slots': {'0': ['II_SYS_SYS_SCR_SCRAPTOPAZ', 5], '1': ['II_SYS_SYS_SCR_HOLY', 5, 0, 1], '2': ['FILLER', 1]}}, 20, 4, 'same'),
    ('bag fills up', 'MMI_PET_RES01 { SET T { CONDITION { II_SYS_SYS_SCR_SCRAPTOPAZ 1 } PAY 1 { II_SYS_SYS_SCR_HOLY 600 1000000 } } }',
     {'unlocked': 4, 'slots': {'0': ['II_SYS_SYS_SCR_SCRAPTOPAZ', 20]}}, 8, 1, 'keep'),
]


def seed_for(first_roll):
    """A seed whose first xRand() is exactly `first_roll` (1103515245 is odd, so it has an inverse mod 2^32)."""
    return ((first_roll - 12345) * pow(1103515245, -1, 1 << 32)) & 0xFFFFFFFF


def resolve_bag(bag, D):
    out = {'gold': bag.get('gold', 0), 'unlocked': bag.get('unlocked', FREE), 'fill': bag.get('fill', 0)}
    for where in ('slots', 'equip'):
        out[where] = {}
        for k, v in bag.get(where, {}).items():
            v = list(v) + [0, None, False][len(v) - 2:]
            iid = FILLER if v[0] == 'FILLER' else D[v[0]]
            ch = v[3] if v[3] is not None else 0
            out[where][k] = [iid, v[1], v[2], ch, v[4]]
    return out


def exchange_cases(root):
    D = defines(root)
    props = spec_props(root, D)
    gold = D['II_GOLD_SEED1']
    data = open(os.path.join(root, 'Exchange_Script.txt'), 'rb').read()
    table = load_script(data, D)
    cases = []
    for mmi in sorted(table):
        if mmi == -1:
            continue
        for k, st in enumerate(table[mmi]):
            if st['bad'] or any(x[0] not in props for x in st['pay']) or any(x[0] != gold and x[0] not in props for x in st['cond']):
                continue
            base = {'script': None, 'mmi': mmi, 'set': k}
            exact = stock_bag(st, 1, 1, props, gold)
            if exact is None:
                continue
            cases.append(dict(base, name='exact', bag=exact, tries=1, seed=1, mode='same'))
            short = json.loads(json.dumps(exact))
            for v in short['slots'].values():
                if v[0] != FILLER:
                    v[1] -= 1
                    break
            else:
                short['gold'] = max(0, short['gold'] - 1)
            cases.append(dict(base, name='one short', bag=short, tries=1, seed=1, mode='same'))
            double = stock_bag(st, 2, 0, props, gold)
            if double:
                cases.append(dict(base, name='double, bag full', bag=double, tries=2, seed=2, mode='keep'))
            keep = stock_bag(st, 3, 1, props, gold)
            if keep:
                cases.append(dict(base, name='keep 3, 1 free', bag=keep, tries=5, seed=7, mode='keep'))
            cases.append(dict(base, name='rates', bag=stock_bag(st, 1, 5, props, gold), tries=1500, seed=11 + k, mode='same'))
    for name, script, bag, tries, seed, mode in SMALL:
        cases.append({'script': script, 'mmi': D['MMI_PET_RES01'], 'set': 0, 'name': name,
                      'bag': resolve_bag(bag, D), 'tries': tries, 'seed': seed, 'mode': mode})
        if name == 'chances over and under':
            cases.append(dict(cases[-1], set=1, name=name + ' (PAY 2)'))
    # a roll exactly on a chance boundary: 400,000 must give the SECOND line (nRandom < nSumProb)
    edge = 'MMI_PET_RES01 { SET T { CONDITION { II_SYS_SYS_SCR_SCRAPTOPAZ 1 } PAY 1 { II_SYS_SYS_SCR_HOLY 1 400000 II_SYS_SYS_SCR_AMPESS 1 600000 } } }'
    for roll in (399999, 400000):
        cases.append({'script': edge, 'mmi': D['MMI_PET_RES01'], 'set': 0, 'name': f'roll exactly {roll}', 'bag': resolve_bag({'slots': {'0': ['II_SYS_SYS_SCR_SCRAPTOPAZ', 1]}}, D),
                      'tries': 1, 'seed': seed_for(roll), 'mode': 'same'})
    for c in cases:
        t = load_script(c['script'].encode('latin-1'), D) if c['script'] else table
        c['expect'] = run_case(c, t, props, gold)
    return {'gold': gold, 'cases': cases}


# ------------------------------------------------------------------ Battle Pass
# CProject::LoadBattlePass (ProjectCmn.cpp:1682) + BattlePassConfigTime (:1660),
# CDPDatabaseClient::OnJoin (DPDatabaseClient.cpp:1355), CMover::IsBattlePass / BattlePassSize
# (Mover.cpp:1150), CUserMng::AddBPUpdate + CUser::GiveBattlePassReward (User.cpp:4631),
# CAttackArbiter::OnDied (AttackArbiter.cpp:966), CDPSrvr::OnDoBP nCheck 1 (DPSrvr.cpp:11818).
# Bag: a count of empty slots. OnDoBP's checks use it; a reward takes one empty slot or is
# mailed (CreateItem fails). Not modelled: a reward stacking onto items already in the bag.
MAX_BPOINTS = 10000


def bp_load(data, D):
    """-> {'items': {itemId: (type, time)}, 'ladder': {level: (type, points, item, qty)}, 'monsters': {id: (min, max)}}"""
    t = [x.decode('latin-1') for x in tokens(data)]
    k = [0]

    def tok():
        x = t[k[0]] if k[0] < len(t) else None
        k[0] += 1
        return x

    def number():     # CScript::GetNumber: names through the defines, unknown -> 0
        x = tok() or ''
        if x == '=':
            return -1
        if x in ('-', '+'):
            y = tok() or ''
            v = D.get(y, atoi(y))
            return -v if x == '-' else v
        if x.lower().startswith('0x'):
            return s32(int(x[2:] or '0', 16))
        if re.match(r'\d', x):
            return atoi(x)
        return D.get(x, 0)

    items, ladder, monsters = {}, {}, {}
    cur = tok()
    while cur is not None:
        if cur in ('BP1', 'BP2', 'BP3', 'BP4', 'BP5'):
            block = cur
            tok()             # {
            cur = tok()
            while cur is not None and cur[:1] != '}':
                if block == 'BP1' and cur == 'BPItem':
                    ty, iid, tm = number(), number() & 0xFFFFFFFF, number()
                    items.setdefault(iid, (ty, tm))
                elif block == 'BP2' and cur == 'BPItemTemp':
                    number(); number(); number()
                elif block == 'BP3' and cur == 'BPPoints':
                    number(); number(); number()
                elif block == 'BP4' and cur == 'BPReward':
                    ty, lv, pts = number(), number(), number()
                    pts = min(max(pts, 1), MAX_BPOINTS)
                    iid, qty = number() & 0xFFFFFFFF, max(number(), 1)
                    tok(); tok(); tok()      # the three quoted strings
                    ladder.setdefault(lv, (ty, pts, iid, qty))
                elif block == 'BP5' and cur == 'BPMonster':
                    mid, lo, hi = number() & 0xFFFFFFFF, max(number(), 1), number()
                    hi = min(max(hi, 1), MAX_BPOINTS)
                    lo = min(lo, hi)
                    monsters.setdefault(mid, (lo, hi))
                cur = tok()
        cur = tok()
    return {'items': items, 'ladder': ladder, 'monsters': monsters}


def bp_time(n):
    """BattlePassConfigTime: YYYYMMDD[HH[MM]] -> local time (seconds), 0 when invalid."""
    import time
    sz = str(n)
    y, mo, d = atoi(sz[0:4]), atoi(sz[4:6]), atoi(sz[6:8])
    h, mi = atoi(sz[8:10]), atoi(sz[10:12])
    if y < 1971 or mo < 1 or mo > 12 or d < 1 or d > 31:
        return 0
    return int(time.mktime((y, mo, d, h, mi, 0, 0, 0, -1)))


def bp_run(root):
    import time
    D = defines(root)
    props = spec_props(root, D)
    path = os.path.join(root, 'BattlePass.inc')
    text = open(path, 'rb').read()
    cfg = bp_load(text, D)
    rnd = Rand(7)
    PASS = D['II_SYS_SYS_SCR_BPPASS1']
    names = ['Ana', 'Ben', 'Cy', 'Dee', 'Eve', 'Fay', 'Gus', 'Hal']
    P = {n: {'level': 0, 'points': 0, 'type': 0, 'enable': 0, 'end': 0, 'got': [], 'pass': 0, 'free': 100, 'refused': 0} for n in names}
    now = [0]

    def running(p):                       # IsBattlePass
        return p['end'] > 0 and p['end'] > now[0]

    def size(p):                          # BattlePassSize
        return sum(1 for r in cfg['ladder'].values() if r[0] == p['type'])

    def reward(p, lv):                    # GiveBattlePassReward
        r = cfg['ladder'].get(lv)
        if r is None or r[0] != p['type'] or r[2] not in props:
            return
        if p['free'] > 0:
            p['free'] -= 1
            p['got'].append([lv, r[2], r[3], 'bag'])
        else:
            p['got'].append([lv, r[2], r[3], 'mail'])

    def add_points(p, n):                 # AddBPUpdate
        if n > 0 and running(p) and p['level'] < size(p):
            r = cfg['ladder'].get(p['level'])
            if r is not None:
                total = p['points'] + n
                if total >= r[1]:
                    p['points'] = total - r[1]
                    p['level'] += 1
                    if p['enable'] == 1:
                        reward(p, p['level'])
                else:
                    p['points'] = total

    def login(p):                         # OnJoin
        if not running(p) and cfg['items']:
            ty, tm = cfg['items'][min(cfg['items'])]
            end = bp_time(tm)
            if end > now[0]:
                p.update(level=1, points=0, type=ty, enable=0, end=end)

    def kill(p, mid):                     # OnDied
        if running(p) and p['level'] < size(p):
            m = cfg['monsters'].get(mid)
            if m:
                lo, hi = m[0] & 0xFFFFFFFF, (m[1] + 1) & 0xFFFFFFFF
                n = lo + rnd(hi - lo) if hi > lo else lo      # xRandom( nMin, nMax + 1 )
                n = s32(n)
                if n > 0:
                    add_points(p, n)
                return n
        return 0

    def use(p):                           # OnDoBP, nCheck 1
        if p['pass'] < 1:
            return
        if PASS not in cfg['items']:
            p['refused'] += 1; return
        ty, tm = cfg['items'][PASS]
        end = bp_time(tm)
        if not running(p):
            if p['free'] <= 0:
                p['refused'] += 1; return
            p.update(level=1, points=0, type=ty, enable=1, end=end)
            reward(p, p['level'])
        elif p['enable'] == 0:
            if p['end'] != end or p['type'] != ty:
                p['refused'] += 1; return
            pending = sum(1 for lv in range(1, p['level'] + 1) if lv in cfg['ladder'] and cfg['ladder'][lv][0] == p['type'])
            if p['free'] < pending:
                p['refused'] += 1; return
            p['enable'] = 1
            for lv in range(1, p['level'] + 1):
                reward(p, lv)
        else:
            p['refused'] += 1; return
        p['pass'] -= 1

    mons = sorted(cfg['monsters'].items(), key=lambda kv: (-kv[1][1], kv[0]))
    top = [k for k, v in D.items() if k.startswith('MI_') and v == mons[0][0]][0]
    MON = 'MI_KINGSTER01'
    steps = [
        ('2026-09-06 12:00', '*', 'login'),
        (None, 'Ana', 'give', 1), (None, 'Ana', 'use'), (None, 'Ana', 'grind', 12, MON),
        (None, 'Ben', 'grind', 8, MON), (None, 'Ben', 'give', 1),
        (None, 'Dee', 'free', 3), (None, 'Dee', 'grind', 6, MON), (None, 'Dee', 'give', 1), (None, 'Dee', 'use'),
        (None, 'Dee', 'free', 10), (None, 'Dee', 'use'), (None, 'Dee', 'use'),
        ('2026-10-05 18:00', '*', 'login'),
        (None, 'Ana', 'grind', 13, MON), (None, 'Cy', 'give', 1), (None, 'Cy', 'use'), (None, 'Cy', 'grind', 2, MON),
        (None, 'Eve', 'free', 0), (None, 'Eve', 'give', 1), (None, 'Eve', 'use'),
        ('2026-10-06 00:00', '-', 'season', 20261106),
        ('2026-10-06 12:00', '*', 'login'),
        (None, 'Ana', 'grind', 5, MON), (None, 'Ana', 'give', 1), (None, 'Ana', 'use'),
        (None, 'Ben', 'grind', 4, MON), (None, 'Ben', 'use'), (None, 'Cy', 'grind', 3, MON),
        (None, 'Fay', 'give', 1), (None, 'Fay', 'use'), (None, 'Fay', 'grind', 51, top), (None, 'Fay', 'give', 1), (None, 'Fay', 'use'),
        # exact point awards (AddBPUpdate( pUser, n ), as a kill or token would call it) at the
        # level-cost boundary: exactly the cost, one short then one more, far more than a level
        (None, 'Gus', 'give', 1), (None, 'Gus', 'use'),
        (None, 'Gus', 'points', 'cost'), (None, 'Gus', 'points', 'cost-1'), (None, 'Gus', 'points', 1),
        (None, 'Gus', 'points', 1000000), (None, 'Gus', 'points', 0),
        # back-pay with exactly as many free slots as rewards, then a reward with a full bag (mailed)
        (None, 'Hal', 'grind', 3, MON), (None, 'Hal', 'free', 3), (None, 'Hal', 'give', 1), (None, 'Hal', 'use'),
        (None, 'Hal', 'grind', 4, MON),
        ('2026-11-06 00:00', '*', 'login'), (None, 'Ana', 'grind', 7, MON), (None, 'Gus', 'points', 'cost'),
    ]
    out = []
    for st in steps:
        at, who, what = st[0], st[1], st[2]
        if at:
            now[0] = int(time.mktime(time.strptime(at, '%Y-%m-%d %H:%M')))
        if what == 'season':
            # a new season, edited here by this copy: end date and nType+1 on the BPItem row
            # and on every BPReward row of the old season (the file header's rule, 2f783090)
            old = cfg['items'][min(cfg['items'])][0]
            lines = text.split(b'\n')
            for i, l in enumerate(lines):
                parts = l.split(b'\t')
                head = [x for x in re.split(rb'\s+', l.strip()) if x]
                if head[:1] == [b'BPItem'] and atoi(head[1].decode()) == old:
                    lines[i] = re.sub(rb'^(\s*BPItem\s+)\d+(\s+\S+\s+)\d+', lambda m: m.group(1) + str(old + 1).encode() + m.group(2) + str(st[3]).encode(), l)
                elif head[:1] == [b'BPReward'] and atoi(head[1].decode()) == old:
                    lines[i] = re.sub(rb'^(\s*BPReward\s+)\d+', lambda m: m.group(1) + str(old + 1).encode(), l)
            text = b'\n'.join(lines)
            cfg = bp_load(text, D)
            out.append({'step': list(st), 'pass': [list(v) for v in cfg['items'].values()]})
            continue
        who_list = names if who == '*' else [who]
        for n in who_list:
            p = P[n]
            if what == 'login':
                login(p)
            elif what == 'give':
                p['pass'] += st[3]
            elif what == 'free':
                p['free'] = st[3]
            elif what == 'use':
                use(p)
            elif what == 'points':
                r = cfg['ladder'].get(p['level'])
                n = st[3] if isinstance(st[3], int) else (r[1] if r else 1) - (1 if st[3] == 'cost-1' else 0)
                p['last'] = n
                add_points(p, n)
            elif what == 'grind':
                kills = 0
                while p['level'] < st[3] and kills < 100000:
                    if kill(p, D[st[4]]) == 0:
                        break
                    kills += 1
                p['kills'] = kills
        out.append({'step': list(st), 'now': now[0], 'players': {n: json.loads(json.dumps(P[n])) for n in who_list}})
    return {'steps': out, 'top': top}


# ============================================================================ area
# Where an NPC stands, named the way the game client names it.
#   .dyo        ReadObj (CreateObj.cpp:761, WorldServer build: OT_SFX gives NULL = stop), CObj::Read
#               (Obj.cpp:474; x and z *= OLD_MPU = 4, Obj.cpp:525, DefineCommon.cpp:11), CMover::Read
#               (Mover.cpp:3365), CCommonCtrl::Read (CommonCtrl.cpp:84), CCtrl / CItem::Read = CObj::Read
#   World.inc   CWorldMng::LoadScript (worldmng.cpp:302): world id -> file name, SetTitle -> m_szWorldName
#   strings     CProject::LoadStrings (ProjectCmn.cpp:1253), CScript::LoadString (Script.cpp:103),
#               CScript::GetToken (Script.cpp:184: string table first, then #define)
#   continents  CContinent::Init / Point_In_Poly / GetContinent / GetTown (_Common/Continent.cpp)
#   map window  CMapInformationManager::LoadPropMapComboBoxData (MapInformationManager.cpp:261),
#               CWndMapEx::GetMapArea (WndMapEx.cpp:1385), InitializeMapComboBoxSelecting (first match)
#   regions     CWorld::LoadRegion / ReadRegion (WorldFile.cpp:775, 413) and the region loop of the
#               client's CWndWorld (WndWorld.cpp:9258-9370; area caption style bdf9f5cb)
# Not modelled: RA_INN (needs the land height; the player stands on the ground), caption timers and
# fades, music, regions the server adds at run time (CDPClient::OnAddRegion), DBCS lead bytes.
# respawn records are skipped token by token (their arguments are all numbers).

OLD_MPU = 4
OT_OBJ, OT_CTRL, OT_SFX, OT_ITEM, OT_MOVER, OT_SHIP = 0, 2, 3, 4, 5, 7
CTRL_ELEM = 432          # sizeof( CCtrlElem ), CommonCtrl.cpp:101

# CProject::LoadStrings, only the files that hold world, region and map-window names, in its order
AREA_STRING_FILES = [
    'world.txt.txt',
    'World/WdVolcane/WdVolcane.txt.txt', 'World/WdMadrigal/wdMadrigal.txt.txt', 'World/WdKebaras/WdKebaras.txt.txt',
    'World/WdGuildWar/WdGuildWar.txt.txt', 'World/WdEvent01/WdEvent01.txt.txt', 'World/DuMuscle/DuMuscle.txt.txt',
    'World/DuKrr/DuKrr.txt.txt', 'World/DuFlMas/DuFlMas.txt.txt', 'World/DuDaDk/DuDaDk.txt.txt',
    'World/DuBear/DuBear.txt.txt', 'World/DuSaTemple/DuSaTemple.txt.txt', 'World/DuSaTempleBoss/DuSaTempleBoss.txt.txt',
    'World/WdVolcane/WdVolcane.txt.txt', 'World/WdVolcaneRed/WdVolcaneRed.txt.txt', 'World/WdVolcaneYellow/WdVolcaneYellow.txt.txt',
    'World/WdArena/WdArena.txt.txt',                                                                     # __JEFF_11_4
    'World/WdHeaven01/wdheaven01.txt.txt', 'World/WdHeaven02/wdheaven02.txt.txt', 'World/WdHeaven03/wdheaven03.txt.txt',
    'World/WdHeaven04/wdheaven04.txt.txt', 'World/WdHeaven05/wdheaven05.txt.txt', 'World/WdHeaven06/wdheaven06.txt.txt',
    'World/WdHeaven06_1/wdheaven06_1.txt.txt',
    'World/WdCisland/WdCisland.txt.txt',                                                                 # __AZRIA_1023
    'World/DuOminous/duominous.txt.txt', 'World/DuOminous_1/duominous_1.txt.txt',
    'World/WdGuildhousesmall/WdGuildhousesmall.txt.txt', 'World/WdGuildhousemiddle/WdGuildhousemiddle.txt.txt',
    'World/WdGuildhouselarge/WdGuildhouselarge.txt.txt', 'World/DuDreadfulCave/DuDreadfulCave.txt.txt',
    'World/DuRustia/DuRustia.txt.txt', 'World/DuRustia_1/DuRustia_1.txt.txt',
    'propMapComboBoxData.txt.txt',                                                                       # __IMPROVE_MAP_SYSTEM
    'World/WdRartesia/WdRartesia.txt.txt', 'World/DuBehamah/DuBehamah.txt.txt', 'World/DuKalgas/DuKalgas.txt.txt',
    'World/WdColosseum/WdColosseum.txt.txt', 'World/DuUpresia/DuUpresia.txt.txt', 'World/DuUpresia_1/DuUpresia_1.txt.txt',
    'World/DuSanpres/DuSanpres.txt.txt', 'World/DuSanpres_1/DuSanpres_1.txt.txt', 'World/DuHerneos/DuHerneos.txt.txt',
    'World/DuHerneos_1/DuHerneos_1.txt.txt', 'World/WdFwc/WdFwc.txt.txt', 'World/WdMarket/WdMarket.txt.txt',
    'World/WdDarkRartesia/WdDarkRartesia.txt.txt',
]


def area_files(root):
    """lowercase relative path -> real path (Windows opens files without caring about case)"""
    idx = {}
    for d, _, fs in os.walk(root):
        for f in fs:
            p = os.path.join(d, f)
            idx[os.path.relpath(p, root).replace(os.sep, '/').lower()] = p
    return idx


def area_bytes(data):
    """CScanner::Read: a UTF-16 file (FF FE) becomes multibyte text; the scan stops at the first NUL"""
    if data[:2] == b'\xff\xfe':
        data = data[2:].decode('utf-16-le').encode('cp949', 'replace')
    nul = data.find(b'\0')
    return data if nul < 0 else data[:nul]


def cdiv(a, b):
    """C integer division: truncates toward zero"""
    q = abs(a) // abs(b)
    return q if (a < 0) == (b < 0) else -q


class AScript:
    """CScript over the CScanner token split: identifiers go through the string table, then #defines"""
    def __init__(self, data, D, S):
        self.t = [x.decode('latin-1') for x in tokens(area_bytes(data))]
        self.D, self.S = D, S
        self.k = 0
        self.tok = None

    def get(self):
        if self.k >= len(self.t):
            self.k += 1
            self.tok = None          # FINISHED
            return None
        x = self.t[self.k]
        self.k += 1
        c = x[:1]
        if c.isalpha() or c in '#_@$?' or (c and ord(c) >= 128):
            if x in self.S:
                x = self.S[x]
            elif x in self.D:
                x = str(self.D[x])
        elif c == '"':
            x = x[1:-1] if len(x) >= 2 and x.endswith('"') else x[1:]
        self.tok = x
        return x

    def number(self):
        x = self.get()
        if x is None or x == '':
            return 0
        if x.lower().startswith('0x'):
            return s32(int(re.match(r'[0-9a-fA-F]*', x[2:]).group(0) or '0', 16))
        if x[0] == '=':
            return -1
        if x[0] in '-+':
            y = self.get() or ''
            return s32(-atoi(y)) if x[0] == '-' else atoi(y)
        return atoi(x)

    def float(self):
        x = self.get()
        if x is None or x == '':
            return 0.0
        if x[0] == '=':
            return -1.0
        neg = False
        if x[0] in '-+':
            neg = x[0] == '-'
            x = self.get() or ''
        m = re.match(r'\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?', x)
        v = float(m.group(0)) if m else 0.0
        return -v if neg else v

    def lang(self):
        """CProject::GetLangScript (ProjectCmn.cpp:1241): the token, then ")" and ";"; empty -> " " """
        s = self.get() or ''
        self.get()
        self.get()
        return s if s else ' '


def area_strings(idx):
    """CScript::LoadString over AREA_STRING_FILES: key (must start with IDS), then GetLastFull
    (rest of the line up to CR, outer white space trimmed). The first key wins (map::insert)."""
    S = {}
    white = lambda c: 0 < c <= 0x20
    for name in AREA_STRING_FILES:
        p = idx.get(name.lower())
        if not p:
            continue
        b = area_bytes(open(p, 'rb').read())
        n, i = len(b), 0
        while True:
            while True:                              # white space and comments
                while i < n and white(b[i]):
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
                break
            j = i
            while j < n and b[j] not in ISDELIM:
                j += 1
            if j == i:
                j = i + 1
            key = b[i:j].decode('latin-1')
            i = j
            if not key.startswith('IDS'):
                continue
            while i < n and white(b[i]) and b[i] != 13:
                i += 1
            j = i
            while j < n and b[j] != 13:
                j += 1
            val = b[i:j]
            while val and white(val[-1]):
                val = val[:-1]
            i = j
            S.setdefault(key, val.decode('latin-1'))
    return S


def area_worlds(data, D, S):
    """CWorldMng::LoadScript: { id: { file, title } }"""
    s = AScript(data, D, S)
    W = {}
    mark = s.k
    i = s.number()
    brace = 1
    while brace:
        if s.tok is None or s.tok[:1] == '}':
            brace -= 1
            if brace == 0:
                continue
        s.get()
        if s.tok == 'SetTitle':
            s.get()                                   # (
            title = s.lang()
            if i in W:
                W[i]['title'] = title
        else:
            s.k = mark                                # GoMark
            i = s.number()
            s.get()
            W[i] = {'id': i, 'file': s.tok or '', 'title': ''}
        mark = s.k                                    # SetMark
        i = s.number()
    return W


def area_dyo(b):
    """ReadObj until it returns NULL: [ (key, x, y, z) ] of the movers that have a character key"""
    out, i, n = [], 0, len(b)
    while i + 4 <= n:
        t = struct.unpack_from('<I', b, i)[0]
        i += 4
        if t in (OT_OBJ, OT_ITEM, OT_SHIP, OT_MOVER, OT_CTRL):
            if i + 60 > n:
                break
            x, y, z = struct.unpack_from('<3f', b, i + 16)
            x, z = x * OLD_MPU, z * OLD_MPU
            i += 60
            if t == OT_MOVER:                         # m_szName[64], szDialogFile[32], m_szCharacterKey[32], 2 DWORDs
                key = b[i + 96:i + 128].split(b'\0')[0].decode('latin-1')
                i += 136
                if key:
                    out.append((key, x, y, z))
            elif t == OT_CTRL:
                v = struct.unpack_from('<I', b, i)[0]
                i += 4
                i += CTRL_ELEM if v == 0x80000000 else (88 + CTRL_ELEM - 152 if v == 0x90000000 else CTRL_ELEM - 40)
        else:
            break
    return out


def area_continents(data, D, S):
    """CContinent::Init: ({id: polygon}, {id: town polygon})"""
    s = AScript(data, D, S)
    cont, town = {}, {}
    vec, cid, btown = [], 0, 0
    while True:
        s.get()
        if s.tok is None:
            break
        if s.tok == 'Continent':
            s.get()
            if s.tok == 'BEGIN':
                vec = []
            elif s.tok == 'END':
                if vec:
                    vec.append(vec[0])
                m = town if btown else cont
                if (cid & 0xFF) not in m:             # map::insert: the first one stays
                    m[cid & 0xFF] = list(vec)
                btown = 0
        elif s.tok == 'C_id':
            cid = s.number()
        elif s.tok == 'VERTEX':
            x = s.float()
            s.float()
            z = s.float()
            vec.append((int(x), int(z)))
        elif s.tok == 'TOWN':
            btown = s.number()
        elif s.tok == 'C_useRealData':
            if not s.number():                        # client-only look: skip to END
                while True:
                    s.get()
                    if s.tok is None or s.tok == 'END':
                        break
    return cont, town


def area_pip(vec, x, y):
    """CContinent::Point_In_Poly, all in LONG arithmetic"""
    counter = 0
    p1 = vec[0]
    n = len(vec)
    for i in range(1, n + 1):
        p2 = vec[i % n]
        if y > min(p1[1], p2[1]):
            if y <= max(p1[1], p2[1]):
                if x <= max(p1[0], p2[0]):
                    if p1[1] != p2[1]:
                        xin = cdiv((y - p1[1]) * (p2[0] - p1[0]), p2[1] - p1[1]) + p1[0]
                        if p1[0] == p2[0] or x <= xin:
                            counter += 1
        p1 = p2
    return counter % 2 == 1


def area_lookup(polys, x, z):
    """GetContinent( vPos ) / GetTown( vPos ): the first polygon by id (std::map order)"""
    px, pz = int(x), int(z)
    for cid in sorted(polys):
        if area_pip(polys[cid], px, pz):
            return cid
    return 0


def area_map_area(A, x, z):
    """CWndMapEx::GetMapArea"""
    D = A['D']
    loc = area_lookup(A['towns'], x, z)
    if loc == 0:
        loc = area_lookup(A['cont'], x, z)
    for t in ('TOWN_SAINCITY', 'TOWN_DARKEN', 'TOWN_FLARINENOSPLE', 'TOWN_ELIUN'):
        if loc == D[t]:
            loc = area_lookup(A['towns'], x, z)
    return loc


def area_mapnames(data, D, S):
    """LoadPropMapComboBoxData: the MCC_MAP_NAME entries in file order [ {id, loc, title} ]"""
    s = AScript(data, D, S)
    out = []
    did = s.number()
    while s.tok is not None:
        s.get()                                       # {
        cat, title, loc = D['MCC_MAP_CATEGORY'], '', 0
        nb = 1
        while nb > 0 and s.tok is not None:
            s.get()
            w = s.tok
            if w == '{':
                nb += 1
            elif w == '}':
                nb -= 1
            elif w == 'SetCategory':
                s.get(); cat = s.number(); s.get(); s.get()
            elif w == 'SetTitle':
                s.get(); title = s.lang()
            elif w in ('SetPictureFile', 'SetMonsterInformationFile'):
                s.get(); s.lang()
            elif w == 'SetRealPositionRect':
                s.get()
                for k in range(4):
                    s.number(); s.get()               # value, then , or )
                s.get()                               # ;
            elif w == 'SetLocationID':
                s.get(); loc = s.number() & 0xFF; s.get(); s.get()
            elif w == 'SetNPCPosition':
                s.get(); s.number(); s.get(); s.number(); s.get(); s.get()
            elif w == 'SetParentID':
                s.get(); s.number(); s.get(); s.get()
        if cat == D['MCC_MAP_NAME']:
            out.append({'id': did, 'loc': loc, 'title': title})
        did = s.number()
    return out


def area_regions(data, D, S):
    """CWorld::LoadRegion + ReadRegion: m_aRegion in file order"""
    s = AScript(data, D, S)
    skip = (D['RI_BEGIN'], D['RI_REVIVAL'], D['RI_STRUCTURE'])
    out = []
    s.get()
    while s.tok is not None:
        w = s.tok
        if w in ('region', 'region2', 'region3'):
            new, new3 = w in ('region2', 'region3'), w == 'region3'
            s.number()                                # dwType
            index = s.number() & 0xFFFFFFFF
            s.float(); s.float(); s.float()           # vPos
            attr = s.number() & 0xFFFFFFFF
            s.number(); s.number()                    # music, direct music
            s.get(); s.get()                          # script, sound
            s.number(); s.float(); s.float(); s.float()   # teleport world + position
            rect = [s.number(), s.number(), s.number(), s.number()]
            s.get(); s.number()                       # key, target key
            if new3:
                for k in range(11):
                    s.number()
            title = desc = ''
            if not new:
                if s.number() & 0xFF:                 # m_cDescSize is a char
                    s.get(); s.get()
                    desc = (s.tok or '').replace('\\n', '\r\n')
                    s.get()
            else:
                s.get()                               # "title"
                if s.number():
                    s.get(); s.get()
                    title = (s.tok or '').replace('\\n', '\r\n')
                    s.get()
                s.get()                               # "desc"
                if s.number():
                    s.get(); s.get()
                    desc = (s.tok or '').replace('\\n', '\r\n')
                    s.get()
            if index not in skip:
                out.append({'rect': rect, 'attr': attr, 'title': title, 'desc': desc})
        s.get()
    return out


def area_lines(text):
    """The caption loop's split: CRLF or NUL ends a line; after a CRLF the loop stops at the NUL.
    The buffer is zero-filled (ZeroMemory + strcpy), so reading past the NUL finds zeros."""
    b = text + '\0\0\0'
    out, cur, i = [], '', 0
    while True:
        if (b[i] == '\r' and b[i + 1] == '\n') or b[i] == '\0':
            out.append(cur)
            cur = ''
            i += 2
            if i >= len(b) or b[i] == '\0':
                break
        else:
            cur += b[i]
            i += 1
    return out


def area_frame(regs, inside, st, x, z):
    """One frame of the client's region loop. Returns the index of the region entered, or None."""
    px, pz = int(x), int(z)
    for i, r in enumerate(regs):
        l, t, rr, bb = r['rect']
        if l <= px < rr and t <= pz < bb:             # CRect::PtInRect
            if not inside[i]:
                if r['title'] == '':
                    st['nav'] = ''
                inside[i] = True
                for line in area_lines(r['desc']):
                    if line:
                        st['msgs'].append(line)
                for n, line in enumerate(area_lines(r['title'])):
                    if line:
                        if n == 0:
                            st['nav'] = line
                            st['caps'] = [[line, True]]        # AddAreaCaption( bNewArea ): old area names go
                        else:
                            st['caps'].append([line, False])
                return i                                       # __VER >= 9: one new region per frame
        else:
            inside[i] = False
    return None


def area_state():
    return {'nav': None, 'caps': [], 'msgs': []}


def area_stand(regs, x, z):
    """Arrive at (x, z) (all m_bInside FALSE) and stay until no new region is entered"""
    inside = [False] * len(regs)
    st = area_state()
    entered = []
    for f in range(len(regs) + 1):
        i = area_frame(regs, inside, st, x, z)
        if i is None:
            break
        entered.append(i)
    return {'entered': entered, 'nav': st['nav'], 'caps': st['caps'], 'msgs': st['msgs']}


def area_walk(regs, path, step):
    """Walk the path (int points) in frames of at most `step` units per axis; record every entry"""
    inside = [False] * len(regs)
    st = area_state()
    out = []
    pts = [tuple(path[0])]
    for a, b in zip(path, path[1:]):
        dx, dz = b[0] - a[0], b[1] - a[1]
        n = max(abs(dx), abs(dz)) // step + 1
        for k in range(1, n + 1):
            pts.append((a[0] + cdiv(dx * k, n), a[1] + cdiv(dz * k, n)))
    for f, (x, z) in enumerate(pts):
        m = len(st['msgs'])
        i = area_frame(regs, inside, st, x, z)
        if i is not None:
            out.append({'f': f, 'x': x, 'z': z, 'region': i, 'nav': st['nav'], 'caps': [list(c) for c in st['caps']], 'msgs': st['msgs'][m:]})
    return {'frames': len(pts), 'events': out}


def area_load(root):
    D = defines(root)
    idx = area_files(root)
    S = area_strings(idx)
    rd = lambda rel: open(idx[rel.lower()], 'rb').read() if rel.lower() in idx else None
    W = area_worlds(rd('World.inc'), D, S)
    cont, towns = area_continents(rd('World/WdMadrigal/WdMadrigal.wld.cnt') or b'', D, S)
    A = {'D': D, 'S': S, 'W': W, 'cont': cont, 'towns': towns,
         'maps': area_mapnames(rd('propMapComboBoxData.inc') or b'', D, S), 'regions': {}, 'placed': {}}
    for wid in sorted(W):
        name = W[wid]['file']
        if not name or name in A['regions']:
            continue
        rg = rd(f'World/{name}/{name}.rgn')
        A['regions'][name] = area_regions(rg, D, S) if rg is not None else []
        dy = rd(f'World/{name}/{name}.dyo')
        A['placed'][name] = area_dyo(dy) if dy is not None else []
    return A


def area_map_title(A, loc):
    for m in A['maps']:
        if m['loc'] == loc:
            return m['title']
    return None


def area_run(root):
    A = area_load(root)
    D, S = A['D'], A['S']
    first_id = {}
    for wid in sorted(A['W']):
        first_id.setdefault(A['W'][wid]['file'], wid)
    madrigal = A['W'].get(D['WI_WORLD_MADRIGAL'], {}).get('file')
    stands = []
    for name, pl in A['placed'].items():
        for key, x, y, z in pl:
            r = area_stand(A['regions'][name], x, z)
            loc = area_map_area(A, x, z) if name == madrigal else None
            r.update({'world': name, 'worldId': first_id[name], 'key': key, 'x': x, 'z': z,
                      'mapArea': loc, 'mapWindow': area_map_title(A, loc) if loc is not None else None})
            stands.append(r)

    # random walks between NPC spots of one map (the server's xRand, seeded per walk)
    g = [0]

    def xrand():
        g[0] = (g[0] * 1103515245 + 12345) & 0xFFFFFFFF
        return g[0]

    def xrandom(n):
        return xrand() % n

    names = [n for n in A['placed'] if len(A['placed'][n]) >= 2 and A['regions'][n]]
    walks = []
    for seed in range(1, 301):
        g[0] = seed
        name = names[xrandom(len(names))] if seed % 3 else madrigal
        pl = A['placed'][name]
        path = []
        for k in range(2 + xrandom(3)):
            key, x, y, z = pl[xrandom(len(pl))]
            path.append([int(x) + xrandom(161) - 80, int(z) + xrandom(161) - 80])
        step = 1 + xrandom(48)
        walks.append({'world': name, 'seed': seed, 'path': path, 'step': step, 'expect': area_walk(A['regions'][name], path, step)})

    # small polygons: vertices, edges, horizontal / vertical edges, negative values (C division)
    polys = [
        [(-10, -10), (7, -3), (3, 9), (-8, 5), (-10, -10)],
        [(0, 0), (10, 0), (10, 10), (0, 10), (0, 0)],
        [(0, 0), (12, 4), (0, 8), (6, 4), (0, 0)],
        [(-7, 3), (5, -9), (9, 9), (-3, -1), (8, -4), (-7, 3)],          # self-intersecting, like Flaris
    ]
    poly_cases = []
    for p in polys:
        pts = [(x, y) for x in range(-13, 14) for y in range(-13, 14)]
        poly_cases.append({'poly': [list(v) for v in p], 'hits': ''.join('1' if area_pip(p, x, y) else '0' for x, y in pts)})

    # small continent files: towns with real data, a duplicate id, an id over 255, a skipped block
    cnt_scripts = [
        'Continent BEGIN\nTOWN 0\nC_useRealData 1\nC_id 1\nVERTEX 0 0 0\nVERTEX 100.9 3 0\nVERTEX 100 3 100.7\nContinent END\n'
        'Continent BEGIN\nTOWN 1\nC_useRealData 1\nC_id 54\nVERTEX 10 0 10\nVERTEX 50 3 10\nVERTEX 50 3 50\nVERTEX 10 0 50\nContinent END\n'
        'Continent BEGIN\nTOWN 0\nC_useRealData 1\nC_id 1\nVERTEX 0 0 0\nVERTEX 9 0 0\nVERTEX 9 0 9\nContinent END\n'
        'Continent BEGIN\nTOWN 1\nC_useRealData 0\nC_id 52\nVERTEX 0 0 0\nVERTEX 900 0 0\nVERTEX 900 0 900\nContinent END\n'
        'Continent BEGIN\nTOWN 0\nC_useRealData 1\nC_id 258\nVERTEX -20 0 -20\nVERTEX -1 0 -20\nVERTEX -1 0 -1\nContinent END\n',
    ]
    cnt_scripts.append(                               # overlapping continents: the lower id wins
        'Continent BEGIN\nTOWN 0\nC_useRealData 1\nC_id 9\nVERTEX 0 0 0\nVERTEX 60 0 0\nVERTEX 60 0 60\nVERTEX 0 0 60\nContinent END\n'
        'Continent BEGIN\nTOWN 0\nC_useRealData 1\nC_id 7\nVERTEX 30 0 30\nVERTEX 90 0 30\nVERTEX 90 0 90\nVERTEX 30 0 90\nContinent END\n')
    cnt_cases = []
    for t in cnt_scripts:
        c, tw = area_continents(t.encode(), D, S)
        cnt_cases.append({'text': t, 'cont': {str(k): [list(v) for v in c[k]] for k in sorted(c)},
                          'towns': {str(k): [list(v) for v in tw[k]] for k in sorted(tw)},
                          'lookup': [[x, z, area_lookup(c, x, z)] for x in range(-25, 110, 9) for z in range(-25, 110, 9)]})

    # the real map window over the Flaris polygon (its stray vertex overlaps other continents)
    fx = [v[0] for v in A['cont'].get(D['CONT_FLARIS'], [(0, 0)])]
    fz = [v[1] for v in A['cont'].get(D['CONT_FLARIS'], [(0, 0)])]
    grid = [[x, z, area_map_area(A, x, z)] for x in range(min(fx), max(fx) + 1, 50) for z in range(min(fz), max(fz) + 1, 50)]

    # a small map-window file: two names for one location (the first one is shown), categories, a NPC entry
    mapinc = ('MCD_A\n{\n\tSetCategory( MCC_MAP_CATEGORY );\n\tSetTitle( IDS_M_CAT );\n}\n'
              'MCD_B\n{\n\tSetCategory( MCC_MAP_NAME );\n\tSetTitle( IDS_M_ONE );\n\tSetRealPositionRect( -1, 2, 3, 4 );\n\tSetLocationID( 300 );\n}\n'
              'MCD_C\n{\n\tSetCategory( MCC_MAP_NAME );\n\tSetTitle( IDS_M_TWO );\n\tSetLocationID( 44 );\n\tSetNPCPosition( 5, 6 );\n}\n'
              'MCD_D\n{\n\tSetCategory( MCC_NPC_NAME );\n\tSetTitle( IDS_M_NPC );\n\tSetLocationID( 44 );\n}\n'
              'MCD_E\n{\n\tSetCategory( MCC_MAP_NAME );\n\tSetTitle( );\n\tSetLocationID( 7 );\n}\n'
              'MCD_F\n{\n\tSetCategory( MCC_MAP_NAME );\n\tSetTitle( "" );\n\tSetLocationID( 8 );\n}\n')
    MS = {'IDS_M_CAT': 'Category', 'IDS_M_ONE': 'One', 'IDS_M_TWO': 'Two', 'IDS_M_NPC': 'Npc'}
    MS2 = dict(S)
    MS2.update(MS)
    mn = area_mapnames(mapinc.encode(), D, MS2)
    mapnames_case = {'text': mapinc, 'strings': MS, 'maps': mn,
                     'titles': [[loc, area_map_title({'maps': mn}, loc)] for loc in (0, 7, 8, 44, 300 & 0xFF, 99)]}

    # small region files: overlaps, no title, two-line title, trailing \n, desc lines, the old format,
    # excluded indexes, a title key that is not in the string table
    SS = {'IDS_T_A': 'Alpha\\nAlpha West', 'IDS_T_B': 'Beta', 'IDS_T_C': 'Gamma\\n', 'IDS_D_A': 'first line\\nsecond line',
          'IDS_T_E': '\\nOnly small'}
    S2 = dict(S)
    S2.update(SS)
    head = lambda idx, l, t, r, b, attr='0x0': f'region3 6 {idx} 0.0 0.0 0.0 {attr} 0 0 "" "" 0 0.0 0.0 0.0 {l} {t} {r} {b} "" 0 -1 -1 -1 -1 -1 -1 -1 -1 0 0 0\n'
    rgn_scripts = [
        head(10, 0, 0, 100, 100) + 'title 1\n{\nIDS_T_A\n}\ndesc 1\n{\nIDS_D_A\n}\n'
        + head(10, 50, 50, 150, 150) + 'title 0\ndesc 0\n'
        + head(10, 60, 60, 70, 70) + 'title 1\n{\nIDS_T_B\n}\ndesc 0\n'
        + head(D['RI_REVIVAL'], 0, 0, 500, 500) + 'title 1\n{\nIDS_T_B\n}\ndesc 0\n'
        + 'respawn7 5 20 1.0 2.0 3.0 1 30 1 1 2 3 4 5 6 7 8 9 10 11 12 0.0 -1 0 0\n'
        + head(10, 100, 0, 200, 100, '0x80') + 'title 1\n{\nIDS_T_C\n}\ndesc 0\n'
        + head(10, 120, 120, 180, 180) + 'title 1\n{\nIDS_T_E\n}\ndesc 0\n'
        + head(D['RI_STRUCTURE'], 0, 0, 500, 500) + 'title 1\n{\nIDS_T_A\n}\ndesc 0\n'
        + 'region 6 10 0.0 0.0 0.0 0x0 0 0 "" "" 0 0.0 0.0 0.0 150 150 300 300 "" 0 1\n{\nIDS_D_A\n}\n'
        + 'region2 6 10 0.0 0.0 0.0 0x0 0 0 "" "" 0 0.0 0.0 0.0 0 150 40 300 "" 0\ntitle 1\n{\nIDS_NOT_A_STRING\n}\ndesc 0\n'
        + 'region 6 10 0.0 0.0 0.0 0x0 0 0 "" "" 0 0.0 0.0 0.0 40 200 80 260 "" 0 256\n{\nIDS_D_A\n}\n',     # m_cDescSize = (char)256 = 0
    ]
    rgn_paths = [
        [[-10, -10], [65, 65], [65, 65], [130, 20], [175, 175], [260, 260], [20, 200], [-5, -5], [99, 99], [100, 100]],
        [[300, 300], [0, 0]],
        [[149, 149], [150, 150], [151, 151], [199, 99], [200, 100]],
    ]
    rgn_cases = []
    for t in rgn_scripts:
        regs = area_regions(t.encode(), D, S2)
        rgn_cases.append({'text': t, 'strings': SS, 'regions': regs,
                          'walks': [{'path': p, 'step': st, 'expect': area_walk(regs, p, st)} for p in rgn_paths for st in (1, 7, 40)],
                          'stands': [dict(area_stand(regs, x, z), x=x, z=z) for x in range(-5, 310, 15) for z in range(-5, 310, 15)]})

    return {'worlds': {str(k): v for k, v in A['W'].items()}, 'maps': A['maps'],
            'cont': {str(k): [list(v) for v in A['cont'][k]] for k in sorted(A['cont'])},
            'towns': {str(k): [list(v) for v in A['towns'][k]] for k in sorted(A['towns'])},
            'regionCounts': {n: len(r) for n, r in A['regions'].items()},
            'stands': stands, 'walks': walks, 'polys': poly_cases, 'cnt': cnt_cases, 'rgn': rgn_cases,
            'grid': grid, 'mapnames': mapnames_case}


if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'exchange'
    root = sys.argv[2] if len(sys.argv) > 2 else 'test-data/fixtures/Resource'
    if what == 'exchange':
        print(json.dumps(exchange_cases(root)))
    elif what == 'battlepass':
        print(json.dumps(bp_run(root)))
    elif what == 'area':
        print(json.dumps(area_run(root)))
