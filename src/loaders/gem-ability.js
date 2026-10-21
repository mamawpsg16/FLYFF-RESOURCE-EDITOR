// Ultimate jewels: Ultimate_GemAbility.txt, read like CUltimateWeapon::Load_GemAbility (UltimateWeapon.cpp:46):
//   ABILITY <DST_> { <gem> <ability item> v1 v2 v3 v4 v5 ... }   one block per stat; vN = the stat for N of that jewel (GetDST)
//   LEVEL_GEM { ... }                                             the gem making table (not needed here)
// A jewel in a weapon is the ability item (SetGem stores GetGemAbilityKindRandom's dwAbilityItemId), e.g. II_GEN_MAT_DIAMOND02.
// -> { abilities: [{ dst, gems: [{ gem, item, values }] }], byItem: Map(ability item id -> { dst, gem, item, values }) }
(function (FRE) {
  'use strict';

  function load(file, defines) {
    if (!file) return null;
    const s = new FRE.lexer.Script(file.text, { file: file.name, defines, diags: [] });
    const num = t => (t.define ? t.defineValue : FRE.lexer.atoi(t.text).value);
    const res = { abilities: [], byItem: new Map() };
    s.getToken();
    while (!s.eof) {
      if (s.token.text === 'ABILITY') {
        const ab = { dst: num(s.getToken()), gems: [] };
        s.getToken();                                   // {
        s.getToken();
        while (!s.eof && s.token.text[0] !== '}') {
          const g = { gem: num(s.token) >>> 0, item: num(s.getToken()) >>> 0, values: [] };
          for (let i = 0; i < 5; i++) g.values.push(num(s.getToken()));
          ab.gems.push(g);
          if (!res.byItem.has(g.item)) res.byItem.set(g.item, Object.assign({ dst: ab.dst }, g));
          s.getToken();
        }
        res.abilities.push(ab);
      } else if (s.token.text === 'LEVEL_GEM') {
        s.getToken();
        while (!s.eof && s.token.text[0] !== '}') s.getToken();
      }
      s.getToken();
    }
    return res;
  }

  FRE.gemAbility = { load };
})(globalThis.FRE = globalThis.FRE || {});
