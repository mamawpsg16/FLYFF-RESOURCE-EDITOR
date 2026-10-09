// Upgrade Rates checks (task K). Each one cites the C++ it comes from (loaders/upgrade.js has the readers, loaders/upgrade-sim.js the tries).
(function (FRE) {
  'use strict';
  const LUA = 'ItemUpgrade.lua', ST = 's.txt', ULT = 'Ultimate_UltimateWeapon.txt', WR = 'WeaponRarity.inc';
  const pct = c => `${(Math.round(c * 1e6) / 1e4).toString()}%`;

  function upgradeChecks(model, opts) {
    const out = [], ws = opts.ws, U = FRE.upgrade;
    const push = (file, code, severity, sp, message, k) => out.push({ module: 'upgrade', file, code, severity, start: sp ? sp.start : 0, end: sp ? sp.end : 0, key: `${code}|${k}`, message });
    const L = model.lua;
    // ---- ItemUpgrade.lua runs (CItemUpgrade::LoadScript :59)
    if (!L.missing) {
      for (const e of L.errors) push(LUA, e.warn ? 'UP_LUA_VALUE' : 'UP_LUA_ERROR', e.warn ? 'WARN' : 'BLOCK', e,
        e.warn ? e.message : `${e.message}. The script stops: the server logs "ItemUpgrade.lua Run Failed", its upgrade tables stay empty, and every normal upgrade, element upgrade and piercing is refused ("max level reached").`, e.message);
      if (!L.failed) {
        for (const [n, what] of [['tGeneral', 'normal upgrade'], ['tSuitProb', 'armor piercing'], ['tWeaponProb', 'weapon piercing'], ['tAttribute', 'element upgrade']])
          if (!L.tables[n]) push(LUA, 'UP_TABLE_MISSING', 'BLOCK', null, `ItemUpgrade.lua has no "${n} = { … }": the server walks a table that is not there (LoadScript :66-108) and the ${what} has no chances.`, n);
        for (const n of ['nItemTransyLowLevel', 'nItemTransyHighLevel'])
          if (!L.numbers[n]) push(LUA, 'UP_TRANSY_MISSING', 'WARN', null, `ItemUpgrade.lua has no "${n} = …": the gender change (Transy) then costs 0 Penya (GetGlobalNumber of nothing = 0, :118).`, n);
      }
    }
    // ---- every ladder: rising chances, never-passing levels, values above 100 %
    for (const sys of ['general', 'attr', 'weapon', 'suit', 'acc', 'coll', 'ult']) {
      if ((sys === 'acc' || sys === 'coll') && model.s.missing) continue;
      if (sys === 'ult' && model.ult.missing) continue;
      if (['general', 'attr', 'weapon', 'suit'].includes(sys) && (L.missing || L.failed)) continue;
      const S = U.SYSTEMS[sys], lad = U.ladder(model, sys), file = sys === 'acc' || sys === 'coll' ? ST : sys === 'ult' ? ULT : LUA;
      const word = r => (sys === 'weapon' || sys === 'suit') ? `slot ${r.level + 1}` : `+${r.level} → +${r.level + 1}`;
      lad.forEach((r, i) => {
        if (r.count === 0) push(file, 'UP_ZERO', 'WARN', r.span, `${S.label} ${word(r)}: the chance is 0 (file ${r.value}): no try ever passes, so nothing gets past +${r.level}${sys === 'weapon' || sys === 'suit' ? ` slots` : ''}.`, `${sys}|${r.level}`);
        const prev = lad[i - 1];
        if (prev && r.count > prev.count) push(file, 'UP_RISE', 'WARN', r.span, `${S.label} ${word(r)} (${pct(r.chance)}) is easier than ${word(prev)} (${pct(prev.chance)}). Usually each step is harder; check the number.`, `${sys}|${r.level}`);
        const need = S.mode === 'le' ? S.n - 1 : S.n;
        if (r.eff > need) push(file, 'UP_CAPPED', 'INFO', r.span, `${S.label} ${word(r)}: ${r.value}${S.cut && r.level >= 3 ? ` (×0.9 = ${r.eff})` : ''} is more than 100% needs (${need}${S.cut && r.level >= 3 ? ' after the cut' : ''}): every try passes.`, `${sys}|${r.level}`);
      });
    }
    // element levels must be 1..n with no gap: GetAttributeEnchantProb finds level + 1, GetMaxAttributeEnchantSize = how many (:1913, ItemUpgrade.h:66)
    if (!L.failed) {
      const lv = model.t.attr.map(a => a.level);
      lv.forEach((v, i) => { if (v !== i + 1) push(LUA, 'UP_ATTR_GAP', 'WARN', model.t.attr[i].call.stmt, `AddAttribute levels must be 1, 2, 3, … with no gap: level ${v} sits where ${i + 1} should be. A missing level has chance 0 and the top level is never reached.`, v); });
      const seen = new Set();
      for (const a of L.attr) { const v = a.args[0] && a.args[0].value; if (seen.has(v)) push(LUA, 'UP_ATTR_DUP', 'WARN', a.stmt, `AddAttribute( ${v}, … ) is written twice: the later line wins (tAttribute[${v}] is replaced).`, v); seen.add(v); }
    }
    // ---- s.txt (LoadServerScript, Project.cpp:5684)
    if (!model.s.missing) {
      const acc = model.s.acc;
      if (!model.s.accBlock) push(ST, 'UP_ACC_ROWS', 'WARN', null, 's.txt has no Accessory_Probability block: every accessory upgrade has chance 0.', 'none');
      else if (acc.length > U.MAX_AAO) push(ST, 'UP_ACC_ROWS', 'BLOCK', acc[U.MAX_AAO], `Accessory_Probability has ${acc.length} rows; the server keeps 20 (+0 → +20, m_adwProbability[MAX_AAO]) and writes the rest past the end of its table (memory damage).`, 'over');
      else if (acc.length < U.MAX_AAO) push(ST, 'UP_ACC_ROWS', 'WARN', model.s.accBlock.open, `Accessory_Probability has ${acc.length} rows: +${acc.length} → +${acc.length + 1} and above have chance 0 (accessories go up to +20).`, 'few');
      if (!model.s.collBlock || !model.s.coll.length) push(ST, 'UP_COLL_EMPTY', 'WARN', null, 's.txt has no Collecting_Enchant rows: collectors cannot be upgraded (max level = the row count).', 'coll');
    }
    // ---- Ultimate_UltimateWeapon.txt (Load_UltimateWeapon, UltimateWeapon.cpp:116)
    if (!model.ult.missing) {
      for (const [k, what] of [['SET_GEM', 'putting a gem into an Ultimate weapon'], ['REMOVE_GEM', 'taking a gem out'], ['GENERAL2UNIQUE', 'General → Unique'], ['UNIQUE2ULTIMATE', 'Unique → Ultimate']])
        if (!model.ult.single[k]) push(ULT, 'UP_ULT_MISSING', 'WARN', null, `Ultimate_UltimateWeapon.txt has no ${k} line: ${what} always fails (chance 0).`, k);
      const dup = (rows, what) => { const s = new Set(); for (const r of rows) { if (s.has(r.level.value)) push(ULT, 'UP_ULT_DUP', 'WARN', r.level, `${what}: level ${r.level.value} is written twice; the server keeps the FIRST row (map::insert).`, `${what}|${r.level.value}`); s.add(r.level.value); } };
      dup(model.ult.enchant, 'ULTIMATE_ENCHANT'); dup(model.ult.makeGem, 'MAKE_GEM');
      const m = U.firstByLevel(model.ult.enchant);
      for (let l = 1; l <= 10; l++) if (!m.has(l)) push(ULT, 'UP_ULT_MISSING', 'WARN', model.ult.enchantBlock && model.ult.enchantBlock.open, `ULTIMATE_ENCHANT has no row ${l}: an Ultimate weapon at +${l - 1} cannot be upgraded (the window cancels, EnchantWeapon :729).`, `enchant|${l}`);
      // weapons whose own dwReferTarget2 replaces the transform chance (:591)
      if (ws) {
        const D = ws.defines.defines, gen = D.get('WEAPON_GENERAL'), uni = D.get('WEAPON_UNIQUE');
        let n = 0;
        for (const it of ws.items.items.values()) {
          const rs = FRE.specItem.get(it, 'dwReferStat1'), t2 = FRE.specItem.get(it, 'dwReferTarget2');
          if ((rs === gen || rs === uni) && t2 !== -1 && t2 !== 0xFFFFFFFF && t2 !== undefined) n++;
        }
        if (n) push(ULT, 'UP_TRANS_OWN', 'INFO', null, `${n} General / Unique weapon(s) have their own transform chance (dwReferTarget2 in Spec_Item.txt): for them GENERAL2UNIQUE / UNIQUE2ULTIMATE is not used.`, 'own');
      }
    }
    // ---- WeaponRarity.inc (LoadWeaponRarity, Project.cpp:494; SetRandomWeaponRarity, Item.cpp:724)
    const R = model.rarity;
    if (!R.missing) {
      const lv = new Set();
      for (const b of R.blocks) {
        const v = b.value.level;
        if (lv.has(v)) push(WR, 'UP_RARITY_DUP', 'WARN', b.spans.level || b.open, `Tier ${v} is written twice: the later block replaces the first (SetAtGrow).`, v);
        lv.add(v);
        const miss = ['level', 'name', 'color', 'pct', 'flat'].filter(k => !b.spans[k]);
        if (miss.length && R.blocks.indexOf(b) > 0) push(WR, 'UP_RARITY_INHERIT', 'INFO', b.open, `Tier ${v} has no ${miss.join(', ')} line: it keeps the value of the tier above (one record is reused, Project.cpp:503).`, v);
      }
      if (!R.dropBlock) push(WR, 'UP_RARITY_DROP', 'WARN', null, 'WeaponRarity.inc has no Drop block: every tier has chance 0, so the Weapon Rarity Scroll never changes a weapon (and is used up).', 'none');
      else {
        for (const e of R.dropErrors) push(WR, 'UP_RARITY_DROP', 'WARN', e, `Drop lists tier ${e.level}, which no Add_Weapon_Rarity block has (the server logs "rarity ${e.level} doesn't exist").`, `lvl|${e.level}`);
        if (R.dropBlock.closeTok.text !== '}') push(WR, 'UP_RARITY_DROP', 'BLOCK', R.dropBlock.closeTok, `Drop must have exactly ${R.blocks.length} "tier chance" pairs (one per Add_Weapon_Rarity block above it); the server reads that many and then expects "}".`, 'count');
        if (R.dropTotal !== 100) {
          const ch = FRE.upgrade.rarityChances(R);
          push(WR, 'UP_RARITY_SUM', 'WARN', R.dropBlock.open, `The Drop chances add up to ${R.dropTotal}, not 100 (the server logs an error). ${R.dropTotal < 100 ? `${Math.round(ch.nothing * 100)}% of scrolls change nothing.` : 'The tiers at the end get less than written (the roll is 0-99).'}`, 'sum');
        }
      }
    }
    // ---- UpgradeFees.lua (part 2: docs/patches/upgrade-fees.diff, _Common/UpgradeFees.h CUpgradeFees)
    const F = model.fees, FEE = 'UpgradeFees.lua';
    if (F && !F.empty) {
      for (const e of F.errors) push(FEE, 'UP_FEE_LUA', 'BLOCK', e, `${e.message.replace('ItemUpgrade.lua', FEE)}. The script stops: the server and the game log "UpgradeFees.lua Run Failed" and keep every old fee.`, e.message);
      if (!F.failed) for (const r of F.rows) {
        if (r.ignored) push(FEE, 'UP_FEE_BAD', 'WARN', r.span, `${r.label}: "${r.raw}" is not a whole number from 0 to 2,147,483,647, so it is ignored: players pay the old ${FRE.num.group(r.def)} Penya.`, r.key);
        else if (r.present && r.read !== Math.trunc(r.read)) push(FEE, 'UP_FEE_BAD', 'INFO', r.span, `${r.label}: ${r.raw} is cut to ${FRE.num.group(r.value)} (static_cast<int>).`, r.key + '|cut');
        if (r.count > 1) push(FEE, 'UP_FEE_DUP', 'INFO', r.stmt, `${r.key} is set ${r.count} times: the last line wins (${FRE.num.group(r.value)} Penya).`, r.key);
      }
    }
    // the remove-element text names its fee (TID_GAME_REMOVE_ATTRIBUTE, WndField.cpp:25596)
    if (F && model.feeText) {
      const n = FRE.upgradeFees.textNumber(model.feeText.text), fee = FRE.upgradeFees.feeOf(F, 'nRemoveAttributePenya');
      if (n && n.value !== fee) push('textClient.txt.txt', 'UP_FEE_TEXT', 'WARN', { start: model.feeText.start + n.start, end: model.feeText.start + n.end },
        `The remove-element window says "${FRE.num.group(n.value)} Penya", but the fee in UpgradeFees.lua is ${FRE.num.group(fee)}. Change the fee again in Upgrade fees (it rewrites the text), or edit IDS_TEXTCLIENT_INC_001814.`, 'remove-attr');
    }
    // ---- comments that still hold the old number (INFO): an edited line with a -- / // comment
    if (ws) for (const [key, file, re] of [['itemupgrade.lua', LUA, /--/], ['s.txt', ST, /\/\//], ['ultimate_ultimateweapon.txt', ULT, /\/\//]]) {
      const f = ws.files.get(key);
      if (!f || f.text === f.originalText) continue;
      const a = f.originalText.split(/\r?\n/), b = f.text.split(/\r?\n/);
      if (a.length !== b.length) continue;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && re.test(b[i])) {
        let at = 0;
        for (let j = 0; j < i; j++) at = f.text.indexOf('\n', at) + 1;
        push(file, 'UP_STALE_COMMENT', 'INFO', { start: at, end: at + b[i].length },`${file} line ${i + 1}: the number changed, but the comment on that line may still describe the old one.`, `${file}|${i}`);
      }
    }
    return out;
  }

  FRE.upgradeChecks = upgradeChecks;
})(globalThis.FRE = globalThis.FRE || {});
