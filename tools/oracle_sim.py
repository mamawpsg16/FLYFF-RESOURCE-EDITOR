#!/usr/bin/env python3
"""Second, independent copy of the in-game simulators (differential testing).

Written straight from the C++, without looking at the JS simulators, so a slip in
one copy shows up as a disagreement in tests/run-tests.js. It makes its own test
cases (bags, seeds, small scripts), runs them, and prints both as JSON; the JS
test runs the same cases through src/loaders/exchange-sim.js and compares.

Usage: python3 tools/oracle_sim.py exchange|battlepass <Resource folder>   -> JSON

exchange: CExchange::Load_Script / CheckCondition / GetPayItemList / IsFull /
ResultExchange (_Common/Exchange.cpp), CMover::GetItemNum / RemoveItemA /
RemoveAllItem (MoverParam.cpp:3922, 3964), CMover::CreateItem (Mover.cpp:2757),
CItemContainer::GetEmptyCount / IsFull / Add (Item.h:470, 694, 726),
xRand / xRandom. __NEW_EXCHANGE_V19 on.
Same simplification as the JS copy: equipped items sit after the 336 bag slots
(in the server they keep the object id they had in the bag).
"""
import json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from oracle import tokens  # the CScanner token split (shared with tools/oracle.py)

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


if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'exchange'
    root = sys.argv[2] if len(sys.argv) > 2 else 'test-data/fixtures/Resource'
    if what == 'exchange':
        print(json.dumps(exchange_cases(root)))
    elif what == 'battlepass':
        print(json.dumps(bp_run(root)))
