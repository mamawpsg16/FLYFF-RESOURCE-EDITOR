#!/usr/bin/env python3
"""Second, independent copy of the in-game simulators (differential testing).

Written straight from the C++, without looking at the JS simulators, so a slip in
one copy shows up as a disagreement in tests/run-tests.js. It makes its own test
cases (bags, seeds, small scripts), runs them, and prints both as JSON; the JS
test runs the same cases through src/loaders/exchange-sim.js and compares.

Usage: python3 tools/oracle_sim.py exchange|battlepass|area|newnpc|newmenu|npcedit <Resource folder>   -> JSON

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


# ---------------------------------------------------------------------------------------------- newnpc
# Add New NPC (docs/HANDOFF-ADD-NPC.md), written from the C++ and the handoff:
#   CProject::LoadCharacter (Project.cpp:3257), CScript::LoadString, CProject::LoadText (textClient),
#   ReadObj (CreateObj.cpp:761) + CObj::Read (Obj.cpp:474, x and z * OLD_MPU) + CMover::Read (Mover.cpp:3365),
#   CMover::ProcessRegenItem / GenerateVendorItem (Mover.cpp:1630, 5414), the client's menu label TID 7000 + id,
#   CProject::LoadEtc "structure" (Project.cpp:1262) + CMover::RenderName's "[%s]" tag (MoverRender.cpp:1717);
#   a new tag is written the way b4b9a465 did it (defineNeuz.h + etc.inc + etc.txt.txt).
# It builds its own bytes for each form (handoff §5.1-§5.3), checks its own rules (§6) and loads the result.
NN_STRING_FILES = ['character.txt.txt', 'character-etc.txt.txt', 'character-school.txt.txt', 'etc.txt.txt',
                   'propItem.txt.txt', 'propMover.txt.txt', 'textClient.txt.txt']
NN_TAG_FILES = ['defineNeuz.h', 'etc.inc']
NN_CHAR_FILES = ['character.inc', 'character-etc.inc', 'character-school.inc']
NN_CP1252_EXTRA = set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')
NN_BLOCKED = {'wdguildwar1to1', 'wdvolcaneyellow'}
U32 = lambda v: v & 0xFFFFFFFF


def nn_text16(b):
    return b[2:].decode('utf-16-le', 'surrogatepass') if b[:2] == b'\xff\xfe' else b.decode('latin-1')


def nn_strings_add(S, text):
    """CScript::LoadString on one file's text: IDS key, then the rest of the line up to CR, trimmed; first wins"""
    for line in re.split(r'\r\n|\r|\n', text):
        m = re.match(r'[\x01- ]*(IDS\S*)[ \t]*(.*?)[\x01- ]*$', line)
        if m and m.group(1) not in S:
            S[m.group(1)] = m.group(2)


def nn_npcs(text, D, S):
    """LoadCharacter over the CScanner tokens: [ {key, menus, name, slots, shop:[(kind, slot, a...)], output} ]"""
    ts = [t.decode('utf-8', 'replace') for t in tokens(text.encode('utf-8', 'replace'))]
    def val(i):                                   # GetNumber at token i -> (value, tokens used)
        t = ts[i] if i < len(ts) else ''
        if t in ('-', '+'):
            v, n = val(i + 1)
            return (-v if t == '-' else v), n + 1
        if t == '=':
            return -1, 1
        if t in D:
            return D[t], 1
        if t.lower().startswith('0x'):
            return s32(int(t[2:] or '0', 16)), 1
        return atoi(t), 1
    out, i = [], 0
    while i < len(ts):
        npc = dict(key=ts[i], menus=[], name=None, slots={}, shop=[], vtype=0, output=True, langs=[], structure=-1)
        i += 2
        depth = 1
        while depth and i < len(ts):
            t = ts[i]; i += 1
            if t == '{': depth += 1; continue
            if t == '}': depth -= 1; continue
            if t == 'AddMenu':
                v, n = val(i + 1); npc['menus'].append(v); i += 1 + n + 1
            elif t == 'AddMenuLang':
                lang, n1 = val(i + 1); v, n2 = val(i + 2 + n1)
                if lang == 1: npc['menus'].append(v)
                i += 1 + n1 + 1 + n2 + 1
            elif t == 'SetName':
                k = ts[i + 1]; npc['name'] = S.get(k, k); i += 4
            elif t in ('AddVendorSlot',):
                slot, n = val(i + 1); k = ts[i + 2 + n]; npc['slots'][slot] = S.get(k, k); i += 1 + n + 1 + 1 + 2
            elif t in ('AddVendorItem', 'AddVenderItem'):
                a, j = [], i + 1
                for _ in range(6):
                    v, n = val(j); a.append(v); j += n + 1
                npc['shop'].append(('gen',) + tuple(a)); i = j
            elif t == 'AddShopItem':
                slot, n1 = val(i + 1); it, n2 = val(i + 2 + n1); j = i + 2 + n1 + n2
                cost = None
                if ts[j] == ',':
                    cost, n3 = val(j + 1); j += 1 + n3
                npc['shop'].append(('fixed', slot, it, cost)); i = j + 1
            elif t in ('AddVendorItem2', 'AddVenderItem2'):
                slot, n1 = val(i + 1); it, n2 = val(i + 2 + n1)
                npc['shop'].append(('chip', slot, it)); i += 1 + n1 + 1 + n2 + 1
            elif t == 'SetOutput':                     # only FALSE (any case) hides the NPC
                if ts[i + 1].upper() == 'FALSE': npc['output'] = False
                i += 3
            elif t == 'SetLang':                       # __NO_SUB_LANG: the sub language is always 0
                lang, n = val(i + 1); npc['langs'].append(lang); i += 1 + n
                i += 2 if ts[i] == ',' else 2
            elif t == 'SetVenderType':
                v, n = val(i + 1); npc['vtype'] = v; i += 1 + n + 1
            elif t == 'm_nStructure':                  # m_nStructure = <number> ;
                v, n = val(i + 1); npc['structure'] = v; i += 1 + n + 1
        out.append(npc)
    return out


def nn_structs(text, D, S, mx):
    """LoadEtc: after the token "structure": skip {, id = GetNumber, until a token starting with } : name = GetToken (an IDS key
    becomes its text), id = GetNumber. szName[32] in a table of MAX_STRUCTURE rows -> (names {id: text}, bad [(id, text, why)])"""
    ts = [t.decode('utf-8', 'replace') for t in tokens(text.encode('utf-8', 'replace'))]
    def num(i):
        t = ts[i] if i < len(ts) else ''
        if t in ('-', '+'):
            v = num(i + 1)[0]
            return (-v if t == '-' else v), 2
        if t == '=': return -1, 1
        if t in D: return D[t], 1
        return atoi(t), 1
    names, bad = {}, []
    if 'structure' not in ts:
        return names, bad
    i = ts.index('structure') + 2
    sid, n = num(i); i += n
    while i < len(ts) and not ts[i - 1].startswith('}'):
        name = S.get(ts[i], ts[i]); i += 1
        if 0 <= sid < mx:
            names[sid] = name
            if len(name) > 31: bad.append(dict(id=sid, text=name, why='long'))
        else:
            bad.append(dict(id=sid, text=name, why='id'))
        sid, n = num(i); i += n
    return names, bad


def nn_tag_text(raw):
    t = (raw or '').strip()
    if t.startswith('['): t = t[1:].lstrip()
    if t.endswith(']'): t = t[:-1].rstrip()
    return t


def nn_tag_define(text, sid):
    n = re.sub(r'[^A-Z0-9]+', '_', text.upper()).strip('_')
    return 'SRT_' + (n or 'TAG_%d' % sid)


def nn_free_rows(A):
    mx = A.D.get('MAX_STRUCTURE', 20)
    names = nn_structs(A.etc, A.D, A.S, mx)[0]
    taken = {v for k, v in A.D.items() if k.startswith('SRT_')} | set(names)
    return [r for r in range(1, mx) if r not in taken]


def nn_o3d_textures(d):
    """texture names in an .o3d (the loader is not in the source tree): a uint32 L, then L bytes = printable name + NUL,
    the name ending in .dds / .tga / .bmp. Checked forward from every candidate length position."""
    out = set()
    for m in re.finditer(rb'\.(?:dds|tga|bmp)\x00', d, re.I):
        nul = m.end() - 1
        best = None
        k = m.start() - 1
        while k >= 4 and 0x20 <= d[k] <= 0x7e:
            if struct.unpack_from('<I', d, k - 4)[0] == nul - k + 1:
                best = k
                break
            k -= 1
        if best is not None:
            out.add(d[best:nul].decode('latin-1').lower())
    return sorted(out)


def nn_items(root, D):
    """Spec_Item.txt by its header columns (rows of version <= 19): id -> prop"""
    lines = open(os.path.join(root, 'Spec_Item.txt'), 'rb').read().decode('latin-1').split('\r\n')
    col = {h.lstrip('/'): i for i, h in enumerate(lines[1].split('\t'))}
    def v(x):
        x = x.strip().strip('"')
        if x == '=': return -1
        if x in D: return D[x]
        return atoi(x)
    props, amp = {}, 60000
    for l in lines:
        if not l.strip() or l.lstrip().startswith('//'):
            continue
        c = l.split('\t')
        if v(c[0]) > 19:
            continue
        p = dict(id=U32(v(c[col['dwID']])), ik1=U32(v(c[col['dwItemKind1']])), ik3=U32(v(c[col['dwItemKind3']])),
                 job=U32(v(c[col['dwItemJob']])), rare=U32(v(c[col['dwItemRare']])), shop=U32(v(c[col['dwShopAble']])),
                 chip=v(c[col['dwReferValue1']]))
        props[p['id']] = p
        if p['ik3'] == D.get('IK3_EXP_RATE'):          # the server clones these (nMaxDuplication)
            for _ in range(v(c[col['nMaxDuplication']]) - 1):
                props[amp] = dict(p, id=amp); amp += 1
    kinds = {}
    for i in sorted(props):
        p = props[i]
        if p['ik3'] != 0xFFFFFFFF and p['ik3'] < 300:
            kinds.setdefault(p['ik3'], []).append(p)
    mm = {}
    for k, a in kinds.items():
        for j in range(len(a) - 1):                    # the server's swap sort by rarity
            for m in range(j + 1, len(a)):
                if a[m]['rare'] < a[j]['rare']:
                    a[j], a[m] = a[m], a[j]
        for j, p in enumerate(a):
            if p['rare'] != 0xFFFFFFFF:
                mm.setdefault((k, p['rare']), [j, j])[1] = j
    return props, kinds, mm


def nn_rule_items(I, ik3, job, lo, hi):
    """GenerateVendorItem: every item of kind ik3 between the first and last index of rarity lo..hi"""
    props, kinds, mm = I
    idx = lambda r, w: -1 if U32(r) >= 400 else mm.get((U32(ik3), U32(r)), [-1, -1])[w]
    mn = next((x for x in (idx(j, 0) for j in range(lo, hi + 1)) if x != -1), -1)
    mx = next((x for x in (idx(j, 1) for j in range(hi, lo - 1, -1)) if x != -1), -1)
    if mn < 0:
        return []
    return [p for p in kinds.get(U32(ik3), [])[mn:mx + 1] if p['shop'] != 0xFFFFFFFF and (job == -1 or p['job'] == U32(job))]


def nn_fill(I, npc):
    """ProcessRegenItem: per tab, generated items (<= 100, sorted by ik1 then rarity), then AddShopItem ones"""
    props = I[0]
    tabs = []
    for tab in range(4):
        ent, dropped = [], 0
        if npc['vtype'] in (1, 2):
            for s in npc['shop']:
                if s[0] == 'chip' and s[1] == tab:
                    p = props.get(U32(s[2]))
                    if p and p['chip'] >= 1 and len(ent) < 100: ent.append(p)
                    else: dropped += 1
        else:
            gen = []
            for s in npc['shop']:
                if s[0] != 'gen' or s[1] != tab or len(gen) >= 100:
                    continue
                for p in nn_rule_items(I, s[2], s[3], s[4], s[5]):
                    if len(gen) < 100:
                        gen.append(p)
            for j in range(len(gen) - 1):
                for m in range(j + 1, len(gen)):
                    a, b = gen[j], gen[m]
                    if b['ik1'] < a['ik1'] or (b['ik1'] == a['ik1'] and b['rare'] < a['rare']):
                        gen[j], gen[m] = gen[m], gen[j]
            ent += gen
        full = len(ent) >= 100
        for s in npc['shop']:
            if s[0] == 'fixed' and s[1] == tab:
                p = props.get(U32(s[2]))
                if not p: dropped += 1; continue
                if full or len(ent) >= 100: full = True; dropped += 1; continue
                ent.append(p)
        tabs.append(([p['id'] for p in ent], dropped))
    return tabs


def nn_dyo(b):
    """ReadObj loop: (movers [(key, x, y, z, angle, model)], end offset of the 0xFFFFFFFF marker or None)"""
    out, i, n = [], 0, len(b)
    while i + 4 <= n:
        t = struct.unpack_from('<I', b, i)[0]
        if t in (OT_OBJ, OT_ITEM, OT_SHIP):
            i += 64
        elif t == OT_MOVER:
            if i + 200 > n:
                return out, None
            angle = struct.unpack_from('<f', b, i + 4)[0]
            x, y, z = struct.unpack_from('<3f', b, i + 20)
            model = struct.unpack_from('<I', b, i + 48)[0]
            key = b[i + 160:i + 192].split(b'\0')[0].decode('latin-1')
            if key:
                out.append((key, x * OLD_MPU, y, z * OLD_MPU, angle, model))
            i += 200
        elif t == OT_CTRL:
            v = struct.unpack_from('<I', b, i + 64)[0]
            i += 68 + (CTRL_ELEM if v == 0x80000000 else (88 + CTRL_ELEM - 152 if v == 0x90000000 else CTRL_ELEM - 40))
        else:
            return out, (i if t == 0xFFFFFFFF and i + 4 == n else None)
    return out, None


def nn_record(form, model):
    """handoff §3.1: one OT_MOVER record, 200 bytes; x and z are stored / OLD_MPU"""
    r = bytearray(200)
    struct.pack_into('<If', r, 0, 5, form['angle'])
    struct.pack_into('<3f', r, 20, form['x'] / OLD_MPU, form['y'], form['z'] / OLD_MPU)
    struct.pack_into('<3f', r, 32, 1.0, 1.0, 1.0)
    struct.pack_into('<5I', r, 44, 5, U32(model), 0xFFFFFFFF, 0, 2)
    r[160:160 + len(form['key'])] = form['key'].encode('latin-1')
    struct.pack_into('<2I', r, 192, 1, 0)
    return bytes(r)


def nn_text_problem(s):
    if not isinstance(s, str) or not s: return 'empty'
    if s != s.strip(): return 'space'
    if len(s) > 63: return 'long'
    if any(c in s for c in '"\r\n'): return 'quote'
    for c in s:
        o = ord(c)
        if not ((0x20 <= o < 0x7f) or (0xa0 <= o <= 0xff) or c in NN_CP1252_EXTRA): return 'charset'
    return None


class NNData:
    def __init__(self, root):
        self.root = root
        self.idx = area_files(root)
        self.D = defines(root)
        self.raw = {n: open(self.idx[n.lower()], 'rb').read() for n in NN_CHAR_FILES + NN_STRING_FILES + NN_TAG_FILES if n.lower() in self.idx}
        self.etc = nn_text16(self.raw['etc.inc']) if 'etc.inc' in self.raw else ''
        self.S = {}
        for n in NN_STRING_FILES:
            if n in self.raw: nn_strings_add(self.S, nn_text16(self.raw[n]))
        self.npcs = []
        for n in NN_CHAR_FILES:
            if n in self.raw: self.npcs += nn_npcs(nn_text16(self.raw[n]), self.D, self.S)
        self.keys = {x['key'].lower() for x in self.npcs}
        self.used = {m for x in self.npcs for m in x['menus']}
        self.prices = {}
        for x in self.npcs:
            for s in x['shop']:
                if s[0] == 'fixed' and s[3] is not None:
                    self.prices.setdefault(U32(s[2]), []).append((x['key'], s[3]))
        self.I = nn_items(root, self.D)
        # CWorld::IsUsableDYO2: no SetLang -> SetOutput decides; the server language (LANG_USA = 1) listed ->
        # SetOutput decides; otherwise the opposite. Last block with a key wins.
        last = {}
        for x in self.npcs: last[x['key'].lower()] = x
        shown = lambda x: x['output'] if not x['langs'] or 1 in x['langs'] else not x['output']
        # mdlDyna.inc: "file" MI_X MODELTYPE_... (first one wins)
        self.mdl = None
        self.mdl_files = {}           # MI_ name -> the files the client needs (Model/Mvr_<name>.o3d + one .ani per motion)
        if 'mdldyna.inc' in self.idx:
            self.mdl = set()
            text = nn_text16(open(self.idx['mdldyna.inc'], 'rb').read())
            for m in re.finditer(r'"([^"\r\n]*)"[ \t]+(MI_\w+)[ \t]+MODELTYPE_\w+[^\r\n]*', text):
                if m.group(2) in self.mdl:
                    continue
                self.mdl.add(m.group(2))
                body = re.match(r'\s*\{([^}]*)\}', text[m.end():])
                motions = []
                for a in re.findall(r'"([^"\r\n]+)"\s+MTI_\w+', body.group(1) if body else ''):
                    if a not in motions: motions.append(a)
                self.mdl_files[m.group(2)] = ['Mvr_%s.o3d' % m.group(1)] + ['Mvr_%s_%s.ani' % (m.group(1), a) for a in motions]
        # Client/Model file names (fixtures: Client/Model.list next to Resource); None = unknown
        lst = os.path.join(os.path.dirname(os.path.abspath(root)), 'Client', 'Model.list')
        self.client_models = {l.strip().lower() for l in open(lst, encoding='latin-1') if l.strip()} if os.path.exists(lst) else None
        cdir = os.path.join(os.path.dirname(os.path.abspath(root)), 'Client')
        tl, ti = os.path.join(cdir, 'ModelTexture.list'), os.path.join(cdir, 'Model.textures')
        self.client_tex = {l.strip().lower() for l in open(tl, encoding='latin-1') if l.strip()} if os.path.exists(tl) else None
        self.model_tex = {}
        if os.path.exists(ti):
            for l in open(ti, encoding='latin-1'):
                f = [x for x in l.rstrip('\r\n').split('\t') if x]
                if f: self.model_tex[f[0].lower()] = [x.lower() for x in f[1:]]
        self.movers = set()
        for l in open(self.idx['propmover.txt'], 'rb').read().decode('latin-1').splitlines():
            f = l.split('\t')[0].strip() if not l.lstrip().startswith('//') else ''
            if f and self.D.get(f, atoi(f)): self.movers.add(self.D.get(f, atoi(f)))
        self.labels = {}
        ts = [t.decode('latin-1') for t in tokens(nn_text16(open(self.idx['textclient.inc'], 'rb').read()).encode('utf-8', 'replace'))]
        for k in range(len(ts) - 4):
            if ts[k + 2] == '{' and ts[k] in self.D:
                self.labels.setdefault(U32(self.D[ts[k]]), None)
                self.labels[U32(self.D[ts[k]])] = self.S.get(ts[k + 3], ts[k + 3]).replace('"', '')
        self.maps = []
        wi = nn_text16(open(self.idx['world.inc'], 'rb').read())
        for m in re.finditer(r'^\s*WI_\w+\s+"([^"]*)"', wi, re.M):
            if m.group(1) not in self.maps: self.maps.append(m.group(1))
        self.dyo = {}
        for m in self.maps:
            p = self.idx.get(f'world/{m}/{m}.dyo'.lower())
            if p: self.dyo[m] = open(p, 'rb').read()
        # models used by an NPC players can see (placed on a World.inc map and shown)
        self.proven = {mv[5] for b in self.dyo.values() for mv in nn_dyo(b)[0] if mv[0].lower() in last and shown(last[mv[0].lower()])}
        # b6abf414 hid MaFl_Shain and MaFl_COUPONPANG (SetOutput false) and MaFl_ANGEL2011 (its SetLang(LANG_KOR) had shown it
        # everywhere but Korea): players saw them before, so their models are proven too
        self.seen_before = {mv[5] for b in self.dyo.values() for mv in nn_dyo(b)[0] if mv[0].lower() in ('mafl_shain', 'mafl_couponpang', 'mafl_angel2011')}
        self.proven |= self.seen_before

    def last_id(self):
        n = 0
        for f in NN_CHAR_FILES + ['character.txt.txt']:
            if f in self.raw:
                for m in re.finditer(r'IDS_CHARACTER_INC_(\d+)', nn_text16(self.raw[f])): n = max(n, int(m.group(1)))
        for k in self.S:
            if k.startswith('IDS_CHARACTER_INC_'):
                n = max(n, atoi(k[len('IDS_CHARACTER_INC_'):]))
        return n


def nn_tabs(form):
    return sorted(form.get('tabs') or [], key=lambda t: t['slot']) if 'MMI_TRADE' in (form.get('menus') or []) else []


def nn_check(A, form):
    """handoff §6 -> sorted ['CODE|field', ...]"""
    out = set()
    add = lambda c, f: out.add(f'{c}|{f}')
    D, key = A.D, str(form.get('key') or '')
    if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,30}', key): add('NN_KEY', 'key')
    if key.lower() in A.keys: add('NN_KEY_DUP', 'key')
    if key in D or key in A.S: add('NN_KEY_NAME', 'key')
    if nn_text_problem(form.get('name')): add('NN_TEXT', 'name')
    n = A.last_id()
    for k in range(1 + len(nn_tabs(form))):
        if 'IDS_CHARACTER_INC_%06d' % (n + 1 + k) in A.S: add('NN_IDS_TAKEN', 'name')
    menus = form.get('menus') or []
    for m in menus:
        v = D.get(m)
        if v is None or not m.startswith('MMI_'): add('NN_MENU', 'menus')
        elif v < 0 or v >= 350: add('NN_MENU', 'menus')
        elif v not in A.used: add('NN_MENU_NEW', 'menus')
    if len(set(menus)) != len(menus): add('NN_MENU_TWICE', 'menus')
    if not menus: add('NN_NO_MENU', 'menus')
    if 'MMI_DIALOG' in menus: add('NN_DIALOG', 'menus')
    model = D.get(form.get('model'))
    if model is None or not str(form.get('model')).startswith('MI_') or model not in A.movers or (A.mdl is not None and form['model'] not in A.mdl):
        add('NN_MODEL', 'model')
    elif A.client_models is not None and form['model'] in A.mdl_files and (any(f.lower() not in A.client_models for f in A.mdl_files[form['model']]) or
            (A.client_tex is not None and any(t not in A.client_tex for t in A.model_tex.get(A.mdl_files[form['model']][0].lower(), [])))):
        add('NN_MODEL_FILES', 'model')
    elif model not in A.proven: add('NN_MODEL_UNPROVEN', 'model')
    if form.get('image') and form['image'] not in A.S: add('NN_IMAGE', 'image')
    if form.get('structure') and form['structure'] not in D: add('NN_STRUCTURE', 'structure')
    if form.get('newTag') is not None:
        text, free = nn_tag_text(form['newTag']), nn_free_rows(A)
        if not all(f in A.raw for f in ('defineNeuz.h', 'etc.inc', 'etc.txt.txt')): add('NN_TAG_FILES', 'structure')
        elif not free: add('NN_TAG_FULL', 'structure')
        prob = nn_text_problem(text)
        known = {v.lower() for v in nn_structs(A.etc, D, A.S, D.get('MAX_STRUCTURE', 20))[0].values()}
        if prob and prob != 'long': add('NN_TAG_CHARS', 'structure')
        elif len(text) >= 32: add('NN_TAG_LONG', 'structure')
        elif nn_tag_define(text, free[0] if free else 0) in D or text.lower() in known: add('NN_TAG_DUP', 'structure')
        elif free: add('NN_TAG_ICON', 'structure')
    trade = 'MMI_TRADE' in menus
    tabs = form.get('tabs') or []
    has = lambda t: bool(t.get('items') or t.get('rules'))
    if not trade and any(has(t) for t in tabs): add('NN_SHOP_NO_TRADE', 'tabs')
    if trade and not any(has(t) for t in tabs): add('NN_SHOP_EMPTY', 'tabs')
    slots = set()
    for t in (tabs if trade else []):
        f = f"tab {t['slot']}"
        if not (isinstance(t['slot'], int) and 0 <= t['slot'] <= 3) or t['slot'] in slots: add('NN_TAB', f)
        slots.add(t['slot'])
        if nn_text_problem(t.get('title')): add('NN_TEXT', f)
        seen, count = set(), 0
        for r in t.get('rules') or []:
            ik3 = D.get(r['ik3'])
            ints = all(isinstance(r[k], int) and not isinstance(r[k], bool) for k in ('min', 'max', 'job'))
            if ik3 is None or not r['ik3'].startswith('IK3_') or not ints or r['min'] < 0 or r['max'] < r['min'] or r['job'] < -1:
                add('NN_RULE', f); continue
            got = nn_rule_items(A.I, ik3, r['job'], r['min'], r['max'])
            if not got: add('NN_RULE_EMPTY', f)
            seen.update(p['id'] for p in got[:100])
            count += len(got)
        for it in t.get('items') or []:
            iid = D.get(it['define'])
            if iid is None or U32(iid) not in A.I[0]: add('NN_ITEM', f); continue
            iid = U32(iid)
            if iid in seen: add('NN_ITEM_TWICE', f)
            seen.add(iid); count += 1
            c = it.get('cost')
            if c is not None and c != '':
                if not (isinstance(c, int) and 1 <= c <= 2147483647): add('NN_PRICE', f)
                else:
                    add('NN_PRICE_GLOBAL', f)
                    if any(pc != c for _, pc in A.prices.get(iid, [])): add('NN_PRICE_CONFLICT', f)
        if count > 100: add('NN_TAB_FULL', f)
    m = form.get('map')
    b = A.dyo.get(m)
    if b is None or str(m).lower() in NN_BLOCKED or nn_dyo(b)[1] is None: add('NN_MAP', 'map')
    num = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool) and v == v and abs(v) != float('inf')
    bad = [k for k in ('x', 'y', 'z', 'angle') if not num(form.get(k))]
    if bad: add('NN_POS', 'position')
    elif not (0 <= form['angle'] < 360): add('NN_POS', 'position')
    if b is not None and not bad:
        ms = nn_dyo(b)[0]
        if any(((p[1] - form['x']) ** 2 + (p[3] - form['z']) ** 2) ** 0.5 < OLD_MPU for p in ms): add('NN_OVERLAP', 'position')
        best = None
        for p in ms:
            d = ((p[1] - form['x']) ** 2 + (p[3] - form['z']) ** 2) ** 0.5
            if best is None or d < best[0]: best = (d, p)
        if best and abs(best[1][2] - form['y']) > 30: add('NN_HEIGHT', 'position')
    return sorted(out)


def nn_build(A, form):
    """handoff §5: the appended character.inc block, the character.txt.txt lines and the .dyo insert"""
    n = A.last_id()
    ids = ['IDS_CHARACTER_INC_%06d' % (n + 1 + k) for k in range(1 + len(nn_tabs(form)))]
    tag, files = None, {}
    if form.get('newTag') is not None:
        sid = nn_free_rows(A)[0]
        text = nn_tag_text(form['newTag'])
        define = nn_tag_define(text, sid)
        hi = 0
        for f in ('etc.inc', 'etc.txt.txt'):
            hi = max([hi] + [int(x) for x in re.findall(r'IDS_ETC_INC_(\d+)', nn_text16(A.raw[f]))])
        hi = max([hi] + [atoi(k[12:]) for k in A.S if k.startswith('IDS_ETC_INC_')])
        key = 'IDS_ETC_INC_%06d' % (hi + 1)
        h = A.raw['defineNeuz.h'].decode('latin-1')
        last = list(re.finditer(r'^#define[ \t]+SRT_\w+[^\r\n]*(\r?\n)', h, re.M))[-1]
        def_line = '#define %-24s %d%s' % (define, sid, last.group(1))
        etc = nn_text16(A.raw['etc.inc'])
        close = etc.index('}', re.search(r'\bstructure\s*\{', etc).end())
        inc_at = etc.rindex('\n', 0, close) + 1
        inc_line = '\t%s\t\t%s\r\n' % (define, key)
        et = nn_text16(A.raw['etc.txt.txt'])
        txt_tail = ('' if et.endswith(('\r', '\n')) else '\r\n') + '%s\t%s\r\n' % (key, text)
        tag = dict(id=sid, define=define, defLine=def_line, defAt=last.end(), incLine=inc_line, incAt=inc_at, txtTail=txt_tail)
        files = dict(defLine=def_line, header=h[:last.end()] + def_line + h[last.end():], etc=etc[:inc_at] + inc_line + etc[inc_at:], etctxt=et + txt_tail)
        form = dict(form, structure=define)
    L = [form['key'], '{', '\tsetting', '\t{'] + [f'\t\tAddMenu( {m} );' for m in form.get('menus') or []]
    for t in nn_tabs(form):
        L += [f"\t\tAddVendorItem( {t['slot']}, {r['ik3']}, {r['job']}, {r['min']}, {r['max']}, 100 );" for r in t.get('rules') or []]
        L += [f"\t\tAddShopItem( {t['slot']}, {it['define']}{', ' + str(it['cost']) if it.get('cost') else ''} );" for it in t.get('items') or []]
    if form.get('structure'): L.append(f"\t\tm_nStructure= {form['structure']};")
    if form.get('image'): L += ['\t\tSetImage', '\t\t(', '\t\t' + form['image'], '\t\t);']
    L += ['\t}', '\tSetName', '\t(', '\t' + ids[0], '\t);']
    L += [f"\tAddVendorSlot( {t['slot']}, {ids[1 + k]} );" for k, t in enumerate(nn_tabs(form))]
    L.append('}')
    inc_old = nn_text16(A.raw['character.inc'])
    inc_tail = ('' if inc_old.endswith(('\r', '\n')) else '\r\n') + '\r\n' + '\r\n'.join(L) + '\r\n'
    txt_old = nn_text16(A.raw['character.txt.txt'])
    texts = [form['name']] + [t['title'] for t in nn_tabs(form)]
    txt_tail = ('' if txt_old.endswith(('\r', '\n')) else '\r\n') + ''.join(f'{k}\t{v}\r\n' for k, v in zip(ids, texts))
    b = A.dyo[form['map']]
    at = nn_dyo(b)[1]
    rec = nn_record(form, A.D[form['model']])
    return dict(incTail=inc_tail, txtTail=txt_tail, insertAt=at, record=rec.hex(), dyoLen=len(b) + 200, tag=tag), \
        inc_old + inc_tail, txt_old + txt_tail, b[:at] + rec + b[at:], files


def nn_game(A, form, inc, txt, dyo, files=None):
    """Load the written files like the game: the NPC (last block with the key wins), its texts, tabs, map spots, tag"""
    files = files or {}
    S = {}
    for n in NN_STRING_FILES:
        if n == 'character.txt.txt': nn_strings_add(S, txt)
        elif n == 'etc.txt.txt' and 'etctxt' in files: nn_strings_add(S, files['etctxt'])
        elif n in A.raw: nn_strings_add(S, nn_text16(A.raw[n]))
    D = dict(A.D)
    m = re.match(r'#define[ \t]+(\w+)[ \t]+(\d+)', files.get('defLine', ''))
    if m: D[m.group(1)] = int(m.group(2))               # the new #define (the rules made sure the name is new)
    npcs = nn_npcs(inc, D, S)
    for n in NN_CHAR_FILES[1:]:
        if n in A.raw: npcs += nn_npcs(nn_text16(A.raw[n]), D, S)
    mine = [x for x in npcs if x['key'].lower() == form['key'].lower()]
    if not mine:
        return None
    npc = mine[-1]
    tabs = []
    for slot, (ids, dropped) in enumerate(nn_fill(A.I, npc)):
        title = npc['slots'].get(slot)
        if title is not None or ids:
            tabs.append(dict(slot=slot, title=title, items=ids, dropped=dropped))
    placed = []
    for m in A.maps:
        b = dyo if m == form['map'] else A.dyo.get(m)
        if b is None: continue
        for k, x, y, z, ang, model in nn_dyo(b)[0]:
            if k.lower() == form['key'].lower():
                placed.append(dict(map=m, x=x, y=y, z=z, angle=ang, model=model))
    # the client's popup (WndWorld.cpp:7229): one entry per flagged id, ids ascending, a few special labels
    mx = D.get('MAX_STRUCTURE', 20)
    tag = None
    if npc['structure'] != -1:
        names, bad = nn_structs(files.get('etc', A.etc), D, S, mx)
        sid = npc['structure']
        tag = dict(id=sid, text='[%s]' % names.get(sid, ''), overflow=not (0 <= sid < mx) or any(b['id'] == sid and b['why'] == 'long' for b in bad))
    flags = sorted({m for m in npc['menus'] if 0 <= m < 350})
    menus, labels, when = [], [], []
    for m in flags:
        if m == D['MMI_GUILDCOMBAT_RANKING_WEEKLY']:
            continue
        lab, w = A.labels.get(7000 + m), None
        if m == D['MMI_GUILDCOMBAT_RANKING']:
            lab = 'Overall Rankings'
        elif m == D['MMI_COLLECTOR_DETAILS']:
            lab = 'Collection Details'
        elif m == D['MMI_GUILDBANKING']:
            w = 'guild member, guild warehouse on'
        elif m == D['MMI_ARENA_ENTER']:
            w = 'after the first job change'
        menus.append(m); labels.append(lab); when.append(w)
        if m == D['MMI_GUILDCOMBAT_RANKING'] and D['MMI_GUILDCOMBAT_RANKING_WEEKLY'] in flags:
            menus.append(D['MMI_GUILDCOMBAT_RANKING_WEEKLY']); labels.append('Weekly Rankings'); when.append(None)
    return dict(name=npc['name'], tag=tag, menus=menus, labels=labels, when=when, tabs=tabs, placed=placed)


NN_EXAMPLE = dict(key='MaFl_Lumi', name='Lumi', model='MI_MAFL_JURIA', image='IDS_CHARACTER_INC_000056', structure='SRT_GENERAL',
                  map='WdMadrigal', x=6966, y=100, z=3220, angle=180, menus=['MMI_TRADE', 'MMI_BANKING'],
                  tabs=[dict(slot=0, title='General Goods', rules=[], items=[dict(define='II_SYS_SYS_SCR_BLESSEDNESS')]),
                        dict(slot=1, title='Scrolls', rules=[dict(ik3='IK3_SCROLL', job=-1, min=1, max=150)], items=[])])


def nn_cases(A):
    """forms: the §5 example, the same NPC on every map, and inputs that must (or must not) trip each rule"""
    import copy
    C = []
    def case(label, game=False, defs=None, hideTex=None, **ch):
        f = copy.deepcopy(NN_EXAMPLE)
        for k, v in ch.items():
            f[k] = v
        C.append(dict(name=label, form=f, game=game, defs=defs or {}, hideTex=hideTex or []))
    case('example', game=True)
    for m in A.maps:
        ms = nn_dyo(A.dyo[m])[0] if m in A.dyo else []
        if ms:
            k, x, y, z, ang, _ = ms[0]
            case('map ' + m, game=len(C) < 12, map=m, x=round(x + 10, 2), y=round(y, 2), z=round(z + 10, 2), angle=round(ang, 1), key='MaFl_Test_' + m[:20])
        else:
            case('map ' + m, map=m, x=400, y=100, z=400, key='MaFl_Test_' + m[:20])
    # the NPC files' own facts the rules are checked against
    unused = next(k for k, v in sorted(A.D.items(), key=lambda kv: kv[1]) if k.startswith('MMI_') and 0 <= v < 350 and v not in A.used)
    priced = next((iid, ps[0][1]) for iid, ps in sorted(A.prices.items()) if iid in A.I[0])
    pdef = next(k for k, v in A.D.items() if k.startswith('II_') and U32(v) == priced[0])
    bigk = next(k for k, v in sorted(A.D.items()) if k.startswith('IK3_') and len(nn_rule_items(A.I, v, -1, 0, 399)) > 100)
    jur = next(p for p in nn_dyo(A.dyo['WdMadrigal'])[0] if p[0] == 'MaFl_Juria')
    tab0 = lambda **t: [dict(dict(slot=0, title='Goods', rules=[], items=[dict(define='II_SYS_SYS_SCR_BLESSEDNESS')]), **t)]
    case('key bad start', key='1Lumi'); case('key 32 long', key='M' * 32); case('key 31 long', key='M' * 31)
    case('key dup', key='MaFl_Juria'); case('key dup other case', key='mafl_juria'); case('key is a define', key='II_SYS_SYS_SCR_BLESSEDNESS')
    case('key is a text key', key='IDS_CHARACTER_INC_000056')
    case('name korean', name='루미'); case('name quote', name='Lu"mi'); case('name space', name='Lumi '); case('name empty', name='')
    case('name 63', name='L' * 63); case('name 64', name='L' * 64); case('name cp1252', name='Lümi €')
    case('menu not real', menus=['MMI_TRADE', 'MMI_NOT_REAL']); case('menu dialog', menus=['MMI_DIALOG', 'MMI_TRADE'])
    case('menu unused', menus=['MMI_TRADE', unused]); case('menu twice', menus=['MMI_TRADE', 'MMI_TRADE'])
    # no real menu id reaches MAX_MOVER_MENU: two made-up #defines added for these cases only
    case('menu 349', menus=['MMI_TRADE', 'MMI_TEST_349'], defs={'MMI_TEST_349': 349})
    case('menu 350', menus=['MMI_TRADE', 'MMI_TEST_350'], defs={'MMI_TEST_350': 350})
    case('menu no trade, no tabs', menus=['MMI_BANKING'], tabs=[])
    no_mdl = next(k for k, v in sorted(A.D.items()) if k.startswith('MI_') and v in A.movers and k not in A.mdl)
    unproven = next(k for k in sorted(A.mdl) if k in A.D and A.D[k] in A.movers and A.D[k] not in A.proven)
    case('model without mdlDyna entry', model=no_mdl)
    # unused models: complete (only a warning), one animation missing, the .o3d missing (both block)
    inv = {}
    for k, v in A.D.items(): inv.setdefault(v, k)
    cand = [k for k in sorted(A.mdl) if k in A.D and inv.get(A.D[k]) == k and A.D[k] in A.movers and A.D[k] not in A.proven]
    has = lambda f: f.lower() in A.client_models
    complete = next(k for k in cand if all(has(f) for f in A.mdl_files[k]))
    no_ani = next(k for k in cand if has(A.mdl_files[k][0]) and not all(has(f) for f in A.mdl_files[k][1:]))
    no_o3d = next(k for k in cand if not has(A.mdl_files[k][0]))
    # a model of an NPC b6abf414 hid: proven (no warning), and one whose texture is missing from the Model/Texture list
    sb = next(k for k in sorted(A.mdl) if k in A.D and A.D[k] in A.seen_before and inv.get(A.D[k]) == k)
    case('model seen before b6abf414', game=True, model=sb)
    jt = A.model_tex.get('mvr_mafljuria.o3d', [])
    case('model texture missing', hideTex=jt[:1]); case('model textures all there', game=True)
    case('model unproven', model=unproven); case('unused model, files complete', game=True, model=complete)
    case('unused model, an animation missing', model=no_ani); case('unused model, no .o3d', model=no_o3d)
    case('no menu at all', menus=[], tabs=[])
    case('model bad', model='MI_NOT_REAL'); case('model not MI', model='II_SYS_SYS_SCR_BLESSEDNESS')
    case('image unknown', image='IDS_NOPE_000001'); case('no image', image=None); case('structure bad', structure='SRT_NOPE'); case('no structure', structure=None)
    case('items without trade', menus=['MMI_BANKING']); case('trade empty', tabs=[dict(slot=0, title='Empty', rules=[], items=[])])
    case('tab 4', tabs=tab0(slot=4)); case('tab twice', tabs=tab0() + tab0()); case('tab 3', game=True, tabs=tab0(slot=3))
    case('tab title bad', tabs=tab0(title='가'))
    case('item not real', tabs=tab0(items=[dict(define='II_NOT_REAL')]))
    case('item twice', tabs=tab0(items=[dict(define='II_SYS_SYS_SCR_BLESSEDNESS'), dict(define='II_SYS_SYS_SCR_BLESSEDNESS')]))
    case('rule kind bad', tabs=tab0(rules=[dict(ik3='IK3_NOPE', job=-1, min=1, max=10)]))
    case('rule min > max', tabs=tab0(rules=[dict(ik3='IK3_SCROLL', job=-1, min=10, max=1)]))
    case('rule negative', tabs=tab0(rules=[dict(ik3='IK3_SCROLL', job=-1, min=-1, max=1)]))
    case('rule job -2', tabs=tab0(rules=[dict(ik3='IK3_SCROLL', job=-2, min=1, max=10)]))
    case('rule empty', tabs=tab0(rules=[dict(ik3='IK3_SCROLL', job=-1, min=398, max=399)]))
    case('rule one job', game=True, tabs=tab0(rules=[dict(ik3='IK3_SWD', job=A.D['JOB_MERCENARY'], min=0, max=399)]))
    case('rule big', game=True, tabs=tab0(rules=[dict(ik3=bigk, job=-1, min=0, max=399)]))
    case('rule + same item', tabs=tab0(rules=[dict(ik3='IK3_SCROLL', job=-1, min=0, max=399)],
                                       items=[dict(define=next(k for k, v in A.D.items() if k.startswith('II_') and U32(v) == nn_rule_items(A.I, A.D['IK3_SCROLL'], -1, 0, 399)[0]['id']))]))
    case('price', tabs=tab0(items=[dict(define='II_SYS_SYS_SCR_BLESSEDNESS', cost=5000)]))
    case('price 0', tabs=tab0(items=[dict(define='II_SYS_SYS_SCR_BLESSEDNESS', cost=0)]))
    case('price too big', tabs=tab0(items=[dict(define='II_SYS_SYS_SCR_BLESSEDNESS', cost=2147483648)]))
    case('price conflict', tabs=tab0(items=[dict(define=pdef, cost=priced[1] + 1)]))
    case('price same as other npc', game=True, tabs=tab0(items=[dict(define=pdef, cost=priced[1])]))
    case('map blocked', map='WdVolcaneYellow'); case('map unknown', map='WdNope')
    case('y missing', y=None); case('angle 360', angle=360); case('angle 359.9', angle=359.9); case('angle -1', angle=-1)
    case('overlap Juria', x=round(jur[1] + 1, 3), z=round(jur[3] + 1, 3), y=round(jur[2], 3))
    # boundaries next to the only NPC of a small map: 4 units apart (1 in the file) and 30 units of height
    lone = next(m for m in A.maps if m in A.dyo and len(nn_dyo(A.dyo[m])[0]) == 1 and nn_dyo(A.dyo[m])[1] is not None)
    k1, x1, y1, z1, _, _ = nn_dyo(A.dyo[lone])[0][0]
    at = lambda dx, dy=0: dict(map=lone, x=x1 + dx, y=y1 + dy, z=z1, key='MaFl_Test_Lone')
    case('3.9 from the lone NPC', **at(3.9)); case('4.1 from the lone NPC', **at(4.1)); case('4 from the lone NPC', **at(4.0))
    case('30 above', **at(10, 30)); case('30.5 above', **at(10, 30.5)); case('29.5 above', **at(10, 29.5)); case('30.5 below', **at(10, -30.5))
    case('floating', y=200)
    case('one tab', game=True, menus=['MMI_TRADE'], tabs=tab0(title='Only tab'))
    case('no shop', game=True, menus=['MMI_BANKING', 'MMI_GUILDBANKING'], tabs=[])
    # the popup lists menus by id, once each, whatever the AddMenu order; special labels and conditions
    case('menus out of order', game=True, menus=['MMI_GUILDBANKING', 'MMI_TRADE', 'MMI_BANKING', 'MMI_ARENA_ENTER'])
    case('rankings', game=True, menus=['MMI_GUILDCOMBAT_RANKING_WEEKLY', 'MMI_COLLECTOR_DETAILS', 'MMI_GUILDCOMBAT_RANKING'], tabs=[])
    case('weekly alone', game=True, menus=['MMI_GUILDCOMBAT_RANKING_WEEKLY', 'MMI_BANKING'], tabs=[])
    # building tags: a new one (b4b9a465 way), the 31/32 character edge, the MAX_STRUCTURE edge, rows taken
    tag = lambda t, **k: dict(structure=None, newTag=t, **k)
    case('new tag', game=True, **tag('Dungeon Pieces'))
    case('new tag typed with brackets', game=True, **tag(' [Dungeon Pieces] '))
    case('new tag 31', game=True, **tag('T' * 31)); case('new tag 32', **tag('T' * 32)); case('new tag 70', **tag('T' * 70))
    case('new tag empty', **tag('')); case('new tag only brackets', **tag('[]')); case('new tag korean', **tag('던전'))
    case('new tag spaces inside the brackets', game=True, **tag('[  Dungeon Pieces  ]'))
    case('new tag symbols only', game=True, **tag('***'))
    case('new tag same text as [General]', **tag('general'))
    case('new tag define exists', **tag('Lodestar!'))
    case('new tag same text, other define', **tag('Public Office'))
    case('new tag, row 18 taken', game=True, defs={'SRT_TEST_18': 18}, **tag('Dungeon Pieces'))
    case('new tag, rows 18 and 19 taken', defs={'SRT_TEST_18': 18, 'SRT_TEST_19': 19}, **tag('Dungeon Pieces'))
    case('new tag, MAX_STRUCTURE 19', game=True, defs={'MAX_STRUCTURE': 19}, **tag('Dungeon Pieces'))
    case('new tag, MAX_STRUCTURE 18', defs={'MAX_STRUCTURE': 18}, **tag('Dungeon Pieces'))
    case('existing tag', game=True, structure='SRT_REDCHIPMERCHANT')
    case('four tabs', game=True, tabs=[dict(slot=s, title=f'Tab {s}', rules=[], items=[dict(define='II_SYS_SYS_SCR_BLESSEDNESS')]) for s in (3, 1, 0, 2)])
    return C


def nn_run(root):
    A = NNData(root)
    out = []
    for c in nn_cases(A):
        saved = A.D
        A.D = dict(A.D, **c['defs'])                    # made-up #defines hold for the whole case
        tex_saved = A.client_tex
        if c['hideTex'] and A.client_tex is not None: A.client_tex = A.client_tex - set(c['hideTex'])
        codes = nn_check(A, c['form'])
        r = dict(name=c['name'], form=c['form'], game=c['game'], defs=c['defs'], hideTex=c['hideTex'], codes=codes, build=None, inGame=None)
        if not any(x.split('|')[0] in NN_BLOCKING for x in codes):
            build, inc, txt, dyo, files = nn_build(A, c['form'])
            r['build'] = build
            if c['game']:
                r['inGame'] = nn_game(A, c['form'], inc, txt, dyo, files)
        A.D = saved
        A.client_tex = tex_saved
        out.append(r)
    return dict(cases=out, lastId=A.last_id(), structs=nn_struct_cases(A))


def nn_struct_cases(A):
    """small etc.inc files through LoadEtc's structure loop: (text, strings, MAX_STRUCTURE) -> names, bad"""
    S = {'IDS_A': 'Alpha', 'IDS_B': 'Beta Shop', 'IDS_31': 'L' * 31, 'IDS_32': 'L' * 32, 'IDS_E': ''}
    D = {'SRT_A': 1, 'SRT_B': 2, 'SRT_MAX': 5, 'SRT_OVER': 6}
    texts = [
        'job\n{\n\t1 IDS_A 0 0\n}\nstructure\n{\n\tSRT_A IDS_A\n\tSRT_B IDS_B\n}\nGuild\n{\n\t3 IDS_A\n}\n',
        'structure\n{\n\t0 IDS_B\n\t4 IDS_A\n\tSRT_MAX IDS_B\n\tSRT_OVER IDS_A\n\t-1 IDS_A\n}\n',
        'structure\n{\n\t1 IDS_31\n\t2 IDS_32\n\t3 IDS_E\n}\nGuild\n{\n}\n',
        'structure\n{\n\t1 IDS_A\n\t1 IDS_B\n\t2 Plain\n\t= IDS_A\n}\n',
        'job\n{\n}\n',
        'structure { SRT_A IDS_A SRT_B IDS_B } next { 9 IDS_A }',
    ]
    out = []
    for t in texts:
        for mx in (5, 6):
            names, bad = nn_structs(t, D, S, mx)
            out.append(dict(text=t, strings=S, defines=D, max=mx, names={str(k): v for k, v in names.items()}, bad=bad))
    return out


NN_BLOCKING = {'NN_KEY', 'NN_KEY_DUP', 'NN_KEY_NAME', 'NN_TEXT', 'NN_IDS_TAKEN', 'NN_MENU', 'NN_MODEL', 'NN_MODEL_FILES', 'NN_STRUCTURE',
               'NN_TAG_FILES', 'NN_TAG_FULL', 'NN_TAG_CHARS', 'NN_TAG_LONG', 'NN_TAG_DUP',
               'NN_SHOP_NO_TRADE', 'NN_SHOP_EMPTY', 'NN_TAB', 'NN_RULE', 'NN_ITEM', 'NN_PRICE', 'NN_PRICE_CONFLICT', 'NN_MAP', 'NN_POS'}


# ---------------------------------------------------------------------------------------------- newmenu
# New NPC exchange menus, written from the C++ and the line formats of the commits that add each piece
# (MMI 280/281: cda3af21, 15091d5f; TIDs + textClient: f58e56ba; exchange blocks: MMI_COLLECT01):
#   CProject::LoadDefines / AddMenu (Project.cpp:3410, m_abMoverMenu[id], MAX_MOVER_MENU 350),
#   the right-click label prj.GetText( TID_MMI_DIALOG + i ) (WndWorld.cpp:7283),
#   CWndWorld::OnCommand: an id with no `case` there goes to `default:` = the exchange window (WndWorld.cpp:6470),
#   CExchange::Load_Script / ResultExchange (load_script / exchange_once above).
# It builds its own lines from the spec, loads them and presses OK on every new exchange.
NM_FILES = {'defineNeuz.h': 'b', 'defineText.h': 'b', 'textClient.inc': 'w', 'textClient.txt.txt': 'w', 'Exchange_Script.txt': 'b', 'character.inc': 'w'}


def nm_case_ids(cpp_path):
    """every `case MMI_x:` of CWndWorld::OnCommand's switch, read from the C++ file"""
    t = open(cpp_path, 'rb').read().decode('latin-1')
    a = t.index('BOOL CWndWorld::OnCommand(')
    b = re.compile(r'^}', re.M).search(t, a).start()
    return sorted(set(re.findall(r'case\s+(MMI_\w+)\s*:', t[a:b])))


def nm_text(raw, kind):
    return raw[2:].decode('utf-16-le') if kind == 'w' else raw.decode('latin-1')


def nm_eol(t):
    crlf = t.count('\r\n')
    return '\r\n' if crlf >= t.count('\n') - crlf else '\n'


def nm_append(t, body):
    """(offset, insert) adding body at the end, after a line break if the text lacks one"""
    return len(t), ('' if not t or t[-1] in '\r\n' else nm_eol(t)) + body


class NMData:
    def __init__(self, root):
        self.root = root
        self.idx = area_files(root)
        self.D = defines(root)
        self.raw = {n: open(self.idx[n.lower()], 'rb').read() for n in NM_FILES}
        self.txt = {n: nm_text(self.raw[n], k) for n, k in NM_FILES.items()}
        self.S = {}
        for n in NN_STRING_FILES:
            if n.lower() in self.idx: nn_strings_add(self.S, nn_text16(open(self.idx[n.lower()], 'rb').read()))
        self.npcs = nn_npcs(self.txt['character.inc'], self.D, self.S)
        self.cases = nm_case_ids(os.path.join(os.path.dirname(os.path.abspath(root)), 'src', 'WndWorld.cpp'))
        self.props = spec_props(root, self.D)


def nm_free(A):
    mmi = {v for k, v in A.D.items() if k.startswith('MMI_')}
    tid = {v for k, v in A.D.items() if k.startswith('TID_')}
    return [i for i in range(282, 350) if i not in mmi and 7000 + i not in tid]


def nm_text_problem(s):
    if isinstance(s, str) and len(s) > 255: return 'long'
    p = nn_text_problem(s)
    return None if p == 'long' else p


def nm_check(A, spec):
    out = set()
    add = lambda c, f: out.add(f'{c}|{f}')
    D = A.D
    npc = [x for x in A.npcs if x['key'].lower() == str(spec.get('npcKey', '')).lower()]
    if not npc: add('NM_NPC', 'npc')
    menus = spec.get('menus') or []
    if not menus: add('NM_NONE', 'menus')
    if len(nm_free(A)) < len(menus): add('NM_ID_FULL', 'menus')
    seen = set()
    for i, m in enumerate(menus):
        f = f'menu {i + 1}'
        if not re.fullmatch(r'MMI_[A-Z0-9_]{1,40}', m.get('name') or ''): add('NM_NAME', f)
        elif m['name'] in D or 'TID_' + m['name'] in D or m['name'] in seen: add('NM_NAME', f)
        seen.add(m.get('name'))
        if nm_text_problem(m.get('label')): add('NM_TEXT', f)
        sets = m.get('sets') or []
        if not sets: add('NM_EMPTY', f)
        if len(sets) > 30: add('NM_SET_CAP', f)
        for k, st in enumerate(sets):
            g = f'{f} exchange {k + 1}'
            if not st.get('cond'): add('NM_RECIPE', g)
            if not st.get('pay'): add('NM_RECIPE', g)
            for d, n in st.get('cond') or []:
                if d != 'PENYA' and d not in D: add('NM_ITEM', g)
                if not (isinstance(n, int) and n >= 1): add('NM_QTY', g)
            tot = 0
            for d, n, pr in st.get('pay') or []:
                if d not in D or (D[d] & 0xFFFFFFFF) not in A.props: add('NM_ITEM', g)
                if not (isinstance(n, int) and n >= 1): add('NM_QTY', g)
                tot += pr
            if st.get('pay') and tot != 1000000: add('NM_CHANCE', g)
            # PAY n: GetPayItemList hands out n different lines; more than the lines logs an error (Load_Script)
            pn = st.get('payNum', 1)
            if st.get('pay') and not (isinstance(pn, int) and 1 <= pn <= len(st['pay'])): add('NM_PAYNUM', g)
    r = spec.get('results') or {}
    if r.get('add') is not None:
        if len(r['add']) != 2: add('NM_RESULT', 'results')
        for x in r['add']:
            if not re.fullmatch(r'TID_[A-Z0-9_]{1,60}', x.get('name') or '') or x['name'] in D: add('NM_RESULT', 'results')
            if nm_text_problem(x.get('text')): add('NM_TEXT', 'results')
    elif not r.get('tids') or len(r['tids']) != 2 or any(t not in D for t in r['tids']): add('NM_RESULT', 'results')
    return sorted(out)


def nm_build(A, spec):
    """-> {file: [(offset, insert), ...]}, ids, the written texts"""
    T = A.txt
    ids = nm_free(A)[:len(spec['menus'])]
    news = (spec.get('results') or {}).get('add') or []
    results = [x['name'] for x in news] if news else spec['results']['tids']
    ins = {}
    # defineNeuz.h: after the line with the highest MMI_ value under 350 (the first such line)
    rows = [(int(m.group(2)), m.end()) for m in re.finditer(r'^#define[ \t]+(MMI_\w*)[ \t]+(\d+)[^\r\n]*(?:\r?\n|$)', T['defineNeuz.h'], re.M) if int(m.group(2)) < 350]
    best = max(rows, key=lambda r: r[0])
    at = next(e for v, e in rows if v == best[0])
    e = nm_eol(T['defineNeuz.h'])
    ins['defineNeuz.h'] = [(at, ''.join(f"#define {m['name']}\t{i}\t// {spec['npcKey']} exchange menu{e}" for m, i in zip(spec['menus'], ids)))]
    # defineText.h: after the highest TID_MMI_ in 7000..7349; result TIDs at the end after the highest TID_
    dt = T['defineText.h']
    rows = [(int(m.group(2)), m.end()) for m in re.finditer(r'^#define[ \t]+(TID_MMI_\w*)[ \t]+(\d+)[^\r\n]*(?:\r?\n|$)', dt, re.M) if 7000 <= int(m.group(2)) < 7350]
    hi = max(v for v, _ in rows)
    at = next(e2 for v, e2 in rows if v == hi)
    e = nm_eol(dt)
    lab = ''.join(f"#define\tTID_{m['name']}\t\t\t{7000 + i}{e}" for m, i in zip(spec['menus'], ids))
    ins['defineText.h'] = [(at, lab)]
    if news:
        nxt = max(int(m.group(1)) for m in re.finditer(r'^#define[ \t]+TID_\w*[ \t]+(-?\d+)', dt, re.M)) + 1
        body = f"// {spec['npcKey']} exchange menus - result messages{e}" + ''.join(f"#define\t{x['name']}\t\t\t\t\t{nxt + k}{e}" for k, x in enumerate(news))
        ins['defineText.h'].append(nm_append(dt, body))
    # textClient: one block + one line per new TID (labels, then results); keys continue after the highest
    texts = [('TID_' + m['name'], m['label']) for m in spec['menus']] + [(x['name'], x['text']) for x in news]
    top = max([int(k[19:]) for k in A.S if k.startswith('IDS_TEXTCLIENT_INC_')] + [int(x) for x in re.findall(r'IDS_TEXTCLIENT_INC_(\d+)', T['textClient.txt.txt'])])
    keys = ['IDS_TEXTCLIENT_INC_%06d' % (top + 1 + k) for k in range(len(texts))]
    e = nm_eol(T['textClient.inc'])
    ins['textClient.inc'] = [nm_append(T['textClient.inc'], f"{e}// {spec['npcKey']} exchange menus{e}{e}" + ''.join(f"{t}\t\t\t\t0xffffffff{e}{{{e}\t{k}{e}}}{e}{e}" for (t, _), k in zip(texts, keys)))]
    e = nm_eol(T['textClient.txt.txt'])
    ins['textClient.txt.txt'] = [nm_append(T['textClient.txt.txt'], ''.join(f'{k}\t{x}{e}' for (_, x), k in zip(texts, keys)))]
    # Exchange_Script.txt: the menu blocks, MMI_COLLECT01's layout, REMOVE = CONDITION
    e = nm_eol(T['Exchange_Script.txt'])
    blocks = []
    for m in spec['menus']:
        tid = 'TID_' + m['name']
        L = [m['name'], '{', '\tDESCRIPTION', '\t{', '\t\t' + tid, '\t}', '']
        b = e.join(L) + e
        for st in m.get('sets') or []:
            S = ['\tSET\t' + tid, '\t{', '\t\tRESULTMSG', '\t\t{'] + ['\t\t\t' + r for r in results] + ['\t\t}']
            for kw in ('CONDITION', 'REMOVE'):
                S += ['\t\t' + kw, '\t\t{'] + [f'\t\t\t{d}\t{n}' for d, n in st['cond']] + ['\t\t}']
            S += ['\t\tPAY\t%d' % st.get('payNum', 1), '\t\t{'] + ['\t\t\t' + '\t'.join(str(v) for v in p) for p in st['pay']] + ['\t\t}', '\t}']
            b += e.join(S) + e
        blocks.append(b + '}' + e)
    ins['Exchange_Script.txt'] = [nm_append(T['Exchange_Script.txt'], e + e.join(blocks))]
    # character.inc: after the line of the NPC's last AddMenu, same indent
    ci = T['character.inc']
    st = re.search(r'^' + re.escape(spec['npcKey']) + r'\b[^\r\n]*\r?\n\s*\{', ci, re.M | re.I)   # the key line may carry a // comment
    end = ci.index('\n}', st.end())
    last = list(re.finditer(r'^([ \t]*)AddMenu[ \t]*\([^)]*\)[ \t]*;[^\r\n]*(\r?\n)', ci[st.start():end], re.M))[-1]
    ins['character.inc'] = [(st.start() + last.end(), ''.join(f"{last.group(1)}AddMenu( {m['name']} );{last.group(2)}" for m in spec['menus']))]
    return ins, ids, results


def nm_apply(t, ins):
    for at, x in sorted(ins, key=lambda r: -r[0]):
        t = t[:at] + x + t[at:]
    return t


def nm_game(A, spec, ins, ids):
    """load the written files: the NPC's right-click list (label, exchange window + its SET count)"""
    T = {n: nm_apply(A.txt[n], ins[n]) for n in NM_FILES}
    D = dict(A.D)
    for n in ('defineNeuz.h', 'defineText.h'):
        for m in re.finditer(r'^[ \t]*#define[ \t]+(\w+)[ \t]+(\d+)[ \t]*(?://.*)?\r?$', T[n], re.M):
            D.setdefault(m.group(1), int(m.group(2)))
    S = {}
    for n in NN_STRING_FILES:
        if n == 'textClient.txt.txt': nn_strings_add(S, T[n])
        elif n.lower() in A.idx: nn_strings_add(S, nn_text16(open(A.idx[n.lower()], 'rb').read()))
    labels = {}
    ts = [t.decode('latin-1') for t in tokens(T['textClient.inc'].encode('utf-8', 'replace'))]
    for k in range(len(ts) - 4):
        if ts[k + 2] == '{' and ts[k] in D:
            labels[D[ts[k]] & 0xFFFFFFFF] = S.get(ts[k + 3], ts[k + 3]).replace('"', '')
    table = load_script(T['Exchange_Script.txt'].encode('latin-1'), D)
    npc = [x for x in nn_npcs(T['character.inc'], D, S) if x['key'].lower() == spec['npcKey'].lower()][-1]
    own = {D[n] for n in A.cases if n in D}
    menus = []
    for i in sorted({m for m in npc['menus'] if 0 <= m < 350}):
        menus.append([i, labels.get(7000 + i), None if i in own else min(len(table.get(i, [])), 30)])
    return menus, table, D


def nm_cases_for(A, table, ids, D, rates=False):
    """press OK: exact ingredients + 1 free slot, one short, a full bag; rates: 1,500 presses on a fresh bag each"""
    gold = D['II_GOLD_SEED1']
    out = []
    for mmi in ids:
        for k, st in enumerate(table.get(mmi, [])):
            exact = stock_bag(st, 1, 1, A.props, gold)
            short = json.loads(json.dumps(exact))
            for v in short['slots'].values():
                v[1] -= 1
                break
            for name, bag in (('exact', exact), ('one short', short), ('full bag', stock_bag(st, 1, 0, A.props, gold))):
                c = {'script': None, 'newmenu': True, 'mmi': mmi, 'set': k, 'name': name, 'bag': bag, 'tries': 1, 'seed': 1, 'mode': 'same'}
                c['expect'] = run_case(c, table, A.props, gold)
                out.append(c)
            if rates:
                c = {'script': None, 'newmenu': True, 'mmi': mmi, 'set': k, 'name': 'rates', 'bag': stock_bag(st, 1, 4, A.props, gold), 'tries': 1500, 'seed': 7, 'mode': 'same'}
                c['expect'] = run_case(c, table, A.props, gold)
                out.append(c)
    return out


def nm_specs(A):
    """Jeff's spec (tools/jeff-menus.json) and small specs that trip each rule"""
    import copy
    jeff = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'jeff-menus.json')))
    one = lambda **k: dict({'npcKey': 'MaFl_Jeff', 'results': {'tids': ['TID_GAME_COLLECT_COND01_SUCCESS', 'TID_GAME_COLLECT_COND01_FAIL']},
                            'menus': [{'name': 'MMI_TEST_ONE', 'label': 'Test', 'sets': [{'cond': [['II_SYS_SYS_SCR_SCRAPTOPAZ', 5]], 'pay': [['II_SYS_SYS_SCR_HOLY', 1, 1000000]]}]}]}, **k)
    menu = lambda **k: [dict({'name': 'MMI_TEST_ONE', 'label': 'Test', 'sets': [{'cond': [['II_SYS_SYS_SCR_SCRAPTOPAZ', 5]], 'pay': [['II_SYS_SYS_SCR_HOLY', 1, 1000000]]}]}, **k)]
    rec = lambda cond=None, pay=None: {'cond': cond if cond is not None else [['II_SYS_SYS_SCR_SCRAPTOPAZ', 5]], 'pay': pay if pay is not None else [['II_SYS_SYS_SCR_HOLY', 1, 1000000]]}
    S = [('jeff', jeff, True, {}),
         ('one menu, existing texts', one(), True, {}),
         ('penya ingredient', one(menus=menu(sets=[rec(cond=[['PENYA', 1000], ['II_SYS_SYS_SCR_SCRAPTOPAZ', 1]])])), True, {}),
         ('two rewards by chance', one(menus=menu(sets=[rec(pay=[['II_SYS_SYS_SCR_HOLY', 1, 400000], ['II_SYS_SYS_SCR_AMPESS', 1, 600000]])])), True, {}),
         ('random 50/50', one(menus=menu(sets=[dict(rec(pay=[['II_SYS_SYS_SCR_HOLY', 1, 500000], ['II_SYS_SYS_SCR_AMPESS', 2, 500000]]), payNum=1)])), True, {}),
         ('random gives 2 of 3', one(menus=menu(sets=[dict(rec(pay=[['II_SYS_SYS_SCR_HOLY', 1, 333334], ['II_SYS_SYS_SCR_AMPESS', 1, 333333], ['II_SYS_SYS_SCR_BLESSEDNESS', 1, 333333]]), payNum=2)])), True, {}),
         ('random gives 3 of 3, 70/20/10', one(menus=menu(sets=[dict(rec(pay=[['II_SYS_SYS_SCR_HOLY', 1, 700000], ['II_SYS_SYS_SCR_AMPESS', 1, 200000], ['II_SYS_SYS_SCR_BLESSEDNESS', 1, 100000]]), payNum=3)])), True, {}),
         ('random gives 0', one(menus=menu(sets=[dict(rec(pay=[['II_SYS_SYS_SCR_HOLY', 1, 500000], ['II_SYS_SYS_SCR_AMPESS', 1, 500000]]), payNum=0)])), False, {}),
         ('random gives 3 of 2', one(menus=menu(sets=[dict(rec(pay=[['II_SYS_SYS_SCR_HOLY', 1, 500000], ['II_SYS_SYS_SCR_AMPESS', 1, 500000]]), payNum=3)])), False, {}),
         ('npc unknown', one(npcKey='MaFl_Nobody'), False, {}),
         ('npc in character-etc', one(npcKey=next(x['key'] for x in nn_npcs(nn_text16(open(A.idx['character-etc.inc'], 'rb').read()), A.D, A.S))), False, {}),
         ('no menu', one(menus=[]), False, {}),
         ('name lower case', one(menus=menu(name='MMI_test')), False, {}),
         ('name taken', one(menus=menu(name='MMI_TRADE')), False, {}),
         ('name twice', one(menus=menu() + menu()), False, {}),
         ('label empty', one(menus=menu(label='')), False, {}),
         ('label korean', one(menus=menu(label='무기')), False, {}),
         ('label 255', one(menus=menu(label='L' * 255)), False, {}),
         ('label 256', one(menus=menu(label='L' * 256)), False, {}),
         ('no exchange', one(menus=menu(sets=[])), True, {}),
         ('30 exchanges', one(menus=menu(sets=[rec()] * 30)), True, {}),
         ('npc with several menus (Peach)', one(npcKey='MaFl_Peach'), True, {}),
         ('31 exchanges', one(menus=menu(sets=[rec()] * 31)), False, {}),
         ('no ingredient', one(menus=menu(sets=[rec(cond=[])])), False, {}),
         ('no reward', one(menus=menu(sets=[rec(pay=[])])), False, {}),
         ('unknown ingredient', one(menus=menu(sets=[rec(cond=[['II_NOPE', 1]])])), False, {}),
         ('unknown reward', one(menus=menu(sets=[rec(pay=[['II_NOPE', 1, 1000000]])])), False, {}),
         ('quantity 0', one(menus=menu(sets=[rec(cond=[['II_SYS_SYS_SCR_SCRAPTOPAZ', 0]])])), False, {}),
         ('chances 999999', one(menus=menu(sets=[rec(pay=[['II_SYS_SYS_SCR_HOLY', 1, 999999]])])), False, {}),
         ('result texts unknown', one(results={'tids': ['TID_NOPE', 'TID_NOPE2']}), False, {}),
         ('one new result text', one(results={'add': [{'name': 'TID_GAME_TEST_OK', 'text': 'OK'}]}), False, {}),
         ('new result name taken', one(results={'add': [{'name': 'TID_GAME_COLLECT_COND01_SUCCESS', 'text': 'a'}, {'name': 'TID_GAME_TEST_NO', 'text': 'b'}]}), False, {}),
         ('ids 282-348 taken', one(), True, {'MMI_FAKE_%d' % i: i for i in range(282, 349)}),
         ('ids 282-349 taken', one(), False, {'MMI_FAKE_%d' % i: i for i in range(282, 350)}),
         ('label slot 7282 taken', one(), True, {'TID_FAKE_7282': 7282})]
    return [dict(name=n, spec=copy.deepcopy(sp), game=g, defs=d) for n, sp, g, d in S]


NM_BLOCKING = {'NM_FILES', 'NM_NPC', 'NM_NONE', 'NM_ID_FULL', 'NM_NAME', 'NM_TEXT', 'NM_SET_CAP', 'NM_RECIPE', 'NM_ITEM', 'NM_QTY', 'NM_RESULT', 'NM_PAYNUM'}


def nm_run(root):
    A = NMData(root)
    out, xcases = [], []
    for c in nm_specs(A):
        saved = A.D
        A.D = dict(A.D, **c['defs'])
        codes = nm_check(A, c['spec'])
        r = dict(name=c['name'], spec=c['spec'], defs=c['defs'], codes=codes, build=None, inGame=None)
        if not any(x.split('|')[0] in NM_BLOCKING for x in codes):
            ins, ids, results = nm_build(A, c['spec'])
            r['build'] = {k: [[at, x] for at, x in v] for k, v in ins.items()}
            r['ids'] = ids
            if c['game']:
                menus, table, D = nm_game(A, c['spec'], ins, ids)
                r['inGame'] = menus
                if c['name'] == 'jeff' or c['name'].startswith(('one menu', 'penya', 'two rewards', 'random')):
                    A2 = A
                    for x in nm_cases_for(A2, table, ids, D, rates=c['name'].startswith(('random', 'two rewards'))):
                        x['spec'] = c['name']
                        xcases.append(x)
        A.D = saved
        out.append(r)
    return dict(cases=out, exchanges=xcases, caseIds=A.cases)


# ---------------------------------------------------------------- npcedit (task S: edits of an existing NPC)
# Written from the client C++ and the proven commits, without reading src/edit/npcedit-ops.js or
# src/loaders/shop-window.js.
#   shop window: CWndShop::OnInitialUpdate (WndShop.cpp:815-833), CWndTabCtrl ctor (m_nCurSelect 0),
#                InsertItem (WndControl.cpp:5744: m_aTab.resize(i+1), m_aTab[i] = tab), OnLButtonDown (5632:
#                NULL entries skipped), SetCurSel (5674: only a tab with a window is selected; it hides
#                m_aTab[old]->pWndBase first)
#   edits:       f58e56ba (renames), ba92f67f (tab text), d11123ac (new tab: text line + AddVendorSlot after
#                SetName), AddMenu lines

def ne_window(titles, counts):
    """titles: {slot: text}, counts: [n per slot] -> dict(tabs, shown, clicks)"""
    aTab = []
    for i in range(4):
        t = titles.get(i)
        if t is None or t == '':
            continue
        if len(aTab) < i + 1:
            aTab += [None] * (i + 1 - len(aTab))
        aTab[i] = dict(slot=i, title=t, list=True, items=counts[i] if i < len(counts) else 0)
    i = len(aTab)
    while i < 3:
        aTab.append(dict(slot=None, title='', list=False, items=0))
        i += 1
    cur = 0

    def click(n):
        if not aTab or n >= len(aTab) or aTab[n] is None:
            return 'nothing'
        if not aTab[n]['list']:
            return 'nothing'
        old = aTab[cur]
        if old is None or not old['list']:
            return 'crash'
        return 'select'
    shown = aTab[cur]['slot'] if aTab[cur] is not None and aTab[cur]['list'] else None
    return dict(tabs=aTab, shown=shown, clicks=[click(n) for n in range(len(aTab))])


def ne_unquote(t):
    return t[1:-1] if len(t) >= 2 and t[0] == '"' and t[-1] == '"' else t


def ne_mask(text):
    """comments blanked (same length) so regexes skip commented statements"""
    out, i, n = list(text), 0, len(text)
    while i < n:
        if text.startswith('//', i):
            j = i
            while j < n and text[j] not in '\r\n':
                out[j] = ' '; j += 1
            i = j
        elif text.startswith('/*', i):
            j = text.find('*/', i + 2)
            j = n if j < 0 else j + 2
            for k in range(i, j):
                if text[k] not in '\r\n': out[k] = ' '
            i = j
        elif text[i] == '"':
            j = text.find('"', i + 1)
            i = n if j < 0 else j + 1
        else:
            i += 1
    return ''.join(out)


def ne_block(text, key):
    """(start, end) of the NPC block `key` in character.inc: the key at a line start, then braces to depth 0"""
    m = ne_mask(text)
    k = re.search(r'(?m)^[ \t]*' + re.escape(key) + r'\b', m)
    b = m.index('{', k.end())
    d, i = 0, b
    while True:
        if m[i] == '{': d += 1
        elif m[i] == '}':
            d -= 1
            if d == 0: return k.start(), i + 1
        i += 1


def ne_stmts(text, key):
    """statements of the block, from the masked text: [(cmd, start, end_incl_semicolon, args...)]"""
    s0, s1 = ne_block(text, key)
    m = ne_mask(text)
    out = []
    for r in re.finditer(r'\bSetName\s*\(\s*(\S+?)\s*\)\s*;?', m[s0:s1]):
        out.append(('SetName', s0 + r.start(), s0 + r.end(), None, (s0 + r.start(1), s0 + r.end(1))))
    for r in re.finditer(r'\bAddVendorSlot\s*\(\s*(\d+)\s*,\s*("[^"]*"|[^\s)]+)\s*\)\s*;?', m[s0:s1]):
        out.append(('AddVendorSlot', s0 + r.start(), s0 + r.end(), int(r.group(1)), (s0 + r.start(2), s0 + r.end(2))))
    for r in re.finditer(r'\bAddMenu\s*\(\s*(\w+)\s*\)\s*;?', m[s0:s1]):
        out.append(('AddMenu', s0 + r.start(), s0 + r.end(), r.group(1), None))
    return sorted(out, key=lambda x: x[1])


def ne_line_bounds(text, a, b):
    """start of a's line, end of b's line including its line break, b's line break"""
    ls = text.rfind('\n', 0, a) + 1
    le = b
    while le < len(text) and text[le] not in '\r\n': le += 1
    eol = '\r\n' if text.startswith('\r\n', le) else ('\n' if text.startswith('\n', le) else '')
    return ls, le + len(eol), eol


def ne_indent(text, a):
    ls = text.rfind('\n', 0, a) + 1
    return re.match(r'[ \t]*', text[ls:]).group(0)


def ne_insert_after(text, stmt_end, anchor_start, row):
    _, le, eol = ne_line_bounds(text, stmt_end, stmt_end)
    if not eol:
        return text + '\r\n' + ne_indent(text, anchor_start) + row
    return text[:le] + ne_indent(text, anchor_start) + row + eol + text[le:]


class NEState:
    def __init__(self, A):
        self.inc = nn_text16(A.raw['character.inc'])
        self.txt = nn_text16(A.raw['character.txt.txt'])
        self.others = [nn_text16(A.raw[n]) for n in NN_CHAR_FILES[1:] + NN_STRING_FILES[1:] if n in A.raw]
        self.A = A

    def strings(self):
        S = {}
        nn_strings_add(S, self.txt)
        for n in NN_STRING_FILES[1:]:
            if n in self.A.raw: nn_strings_add(S, nn_text16(self.A.raw[n]))
        return S

    def last_id(self):
        mx = 0
        for t in [self.inc, self.txt] + self.others:
            for m in re.finditer(r'IDS_CHARACTER_INC_(\d+)', t): mx = max(mx, int(m.group(1)))
        return mx

    def key_count(self, key):
        """statements in the three NPC files that show `key` (comments skipped)"""
        n = 0
        for t in [self.inc] + [nn_text16(self.A.raw[f]) for f in NN_CHAR_FILES[1:] if f in self.A.raw]:
            n += len(re.findall(r'\b(?:SetName|AddVendorSlot|AddVenderSlot|SetImage|m_szChar)\b[^;{}]*?\b' + re.escape(key) + r'\b', ne_mask(t)))
        return n

    def append_key(self, text):
        key = 'IDS_CHARACTER_INC_%06d' % (self.last_id() + 1)
        eol = '\r\n' if self.txt.count('\r\n') >= self.txt.count('\n') - self.txt.count('\r\n') else '\n'
        if self.txt and self.txt[-1] not in '\r\n': self.txt += eol
        self.txt += key + '\t' + text + eol
        return key

    def set_text(self, key, text):
        m = re.search(r'(?m)^[ \t]*' + re.escape(key) + r'(?=[ \t\r\n])([ \t]*)([^\r\n]*?)[ \t]*(?=\r?$)', self.txt)
        a, b = m.start(2), m.end(2)
        glue = '' if m.group(1) else '\t'
        self.txt = self.txt[:a] + glue + text + self.txt[b:]

    def retitle(self, span, text, everywhere):
        tok = self.inc[span[0]:span[1]]
        if tok.startswith('"'):
            self.inc = self.inc[:span[0]] + '"' + text + '"' + self.inc[span[1]:]
            return 'inline'
        if self.key_count(tok) == 1 or everywhere:
            self.set_text(tok, text)
            return 'everywhere' if self.key_count(tok) > 1 else 'text'
        key = self.append_key(text)
        self.inc = self.inc[:span[0]] + key + self.inc[span[1]:]
        return 'own key'

    def do(self, e):
        st = ne_stmts(self.inc, e['npc'])
        if e['op'] == 'rename':
            name = [x for x in st if x[0] == 'SetName'][-1]
            return self.retitle(name[4], e['text'], e.get('all', False))
        if e['op'] == 'tab':
            slot = [x for x in st if x[0] == 'AddVendorSlot' and x[3] == e['slot']][-1]
            return self.retitle(slot[4], e['text'], e.get('all', False))
        if e['op'] == 'addtab':
            S = self.strings()
            titles = {x[3]: ne_unquote(S.get(self.inc[x[4][0]:x[4][1]], self.inc[x[4][0]:x[4][1]])) for x in st if x[0] == 'AddVendorSlot'}
            new = next(i for i in range(4) if titles.get(i, '') == '')
            key = self.append_key(e['text'])
            lower = [x for x in st if x[0] == 'AddVendorSlot' and x[3] < new]
            names = [x for x in st if x[0] == 'SetName']
            slots = [x for x in st if x[0] == 'AddVendorSlot']
            anchor = (lower or names or slots)[-1]
            self.inc = ne_insert_after(self.inc, anchor[2], anchor[1], 'AddVendorSlot( %d, %s );' % (new, key))
            return new
        if e['op'] == 'rmtab':
            for x in sorted([x for x in st if x[0] == 'AddVendorSlot' and x[3] == e['slot']], key=lambda x: -x[1]):
                ls, le, _ = ne_line_bounds(self.inc, x[1], x[2])
                self.inc = self.inc[:ls] + self.inc[le:]
            return e['slot']
        if e['op'] == 'addmenu':
            pad = re.search(r'AddMenu\s*\(( ?)', self.inc)
            pad = pad.group(1) if pad else ' '
            last = [x for x in st if x[0] == 'AddMenu'][-1]
            self.inc = ne_insert_after(self.inc, last[2], last[1], 'AddMenu(%s%s%s);' % (pad, e['menu'], pad))
            return e['menu']
        if e['op'] == 'rmmenu':
            for x in sorted([x for x in st if x[0] == 'AddMenu' and x[3] == e['menu']], key=lambda x: -x[1]):
                ls, le, _ = ne_line_bounds(self.inc, x[1], x[2])
                self.inc = self.inc[:ls] + self.inc[le:]
            return e['menu']


def ne_summary(A, ns, key, counts):
    S = ns.strings()
    npc = [x for x in nn_npcs(ns.inc, A.D, S) if x['key'] == key][-1]
    titles = {k: ne_unquote(v) for k, v in npc['slots'].items()}
    w = ne_window(titles, counts)
    return dict(name=npc['name'], titles={str(k): v for k, v in titles.items()}, menus=npc['menus'], window=w)


NE_EDITS = [
    ('rename Peach', [dict(op='rename', npc='MaFl_Peach', text='Gem Lady Peach')]),
    ('Peach tab 2 (shared n/a) own key', [dict(op='tab', npc='MaFl_Peach', slot=1, text='Event')]),
    ('Peach tab 2 everywhere', [dict(op='tab', npc='MaFl_Peach', slot=1, text='Empty', all=True)]),
    ('Peach tab 1 (shared) own key', [dict(op='tab', npc='MaFl_Peach', slot=0, text='Protection')]),
    ('Isruel inline tab', [dict(op='tab', npc='MaFl_Isruel', slot=0, text='Men')]),
    ('Waforu + tab', [dict(op='addtab', npc='MaFl_Waforu', text='Extra')]),
    ('Peach remove tab 4 then + tab', [dict(op='rmtab', npc='MaFl_Peach', slot=3), dict(op='addtab', npc='MaFl_Peach', text='Pets')]),
    ('Peach menus', [dict(op='addmenu', npc='MaFl_Peach', menu='MMI_BANKING'), dict(op='rmmenu', npc='MaFl_Peach', menu='MMI_SMELT_JEWEL')]),
    ('Pet Tamer rename + tab 1', [dict(op='rename', npc='MaFl_PetTamer', text='Pet Tamer Mia'), dict(op='tab', npc='MaFl_PetTamer', slot=0, text='3 days')]),
    ('Peach rename twice', [dict(op='rename', npc='MaFl_Peach', text='Peach A'), dict(op='rename', npc='MaFl_Peach', text='Peach B')]),
]


def ne_run(root):
    import hashlib
    from oracle import vendor_sim
    A = NNData(root)
    shops, _ = vendor_sim(root)
    trade = A.D.get('MMI_TRADE')
    windows = []
    for f in NN_CHAR_FILES:
        if f not in A.raw: continue
        for x in nn_npcs(nn_text16(A.raw[f]), A.D, A.S):
            if trade not in x['menus']: continue
            counts = [len(t) for t in shops.get(f + '|' + x['key'], [[], [], [], []])]
            titles = {k: ne_unquote(v) for k, v in x['slots'].items()}
            windows.append(dict(file=f, key=x['key'], titles={str(k): v for k, v in titles.items()}, counts=counts, window=ne_window(titles, counts)))
    small = []
    for mask in range(16):
        for blank in (None, 0, 2):
            titles = {i: ('T%d' % i) for i in range(4) if mask >> i & 1}
            if blank is not None and blank in titles: titles[blank] = ''
            counts = [i + 1 if mask >> i & 1 else (2 if i == 3 else 0) for i in range(4)]
            small.append(dict(titles={str(k): v for k, v in titles.items()}, counts=counts, window=ne_window(titles, counts)))
    edits = []
    for name, steps in NE_EDITS:
        ns = NEState(A)
        hows = [ns.do(e) for e in steps]
        key = steps[-1]['npc']
        f = 'character.inc'
        counts = [len(t) for t in shops.get(f + '|' + key, [[], [], [], []])]
        sha = lambda t: hashlib.sha1(t.encode('utf-8')).hexdigest()
        edits.append(dict(name=name, steps=steps, hows=hows, inc=sha(ns.inc), txt=sha(ns.txt), lastId=ns.last_id(),
                          after=ne_summary(A, ns, key, counts)))
    return dict(windows=windows, small=small, edits=edits)


if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'exchange'
    root = sys.argv[2] if len(sys.argv) > 2 else 'test-data/fixtures/Resource'
    if what == 'exchange':
        print(json.dumps(exchange_cases(root)))
    elif what == 'battlepass':
        print(json.dumps(bp_run(root)))
    elif what == 'area':
        print(json.dumps(area_run(root)))
    elif what == 'newnpc':
        print(json.dumps(nn_run(root)))
    elif what == 'newmenu':
        print(json.dumps(nm_run(root)))
    elif what == 'npcedit':
        print(json.dumps(ne_run(root)))
    elif what == 'modeltex':                    # index for a test copy: Mvr_X.o3d<TAB>texture<TAB>... per NPC model
        for f in sorted(os.listdir(root)):
            if f.lower().startswith('mvr_') and f.lower().endswith('.o3d'):
                print('\t'.join([f] + nn_o3d_textures(open(os.path.join(root, f), 'rb').read())))
    elif what == 'o3d':                         # texture names of single .o3d files -> JSON
        print(json.dumps({os.path.basename(f): nn_o3d_textures(open(f, 'rb').read()) for f in sys.argv[2:]}))
