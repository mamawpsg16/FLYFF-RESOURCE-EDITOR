#!/bin/sh
# Copies the files the editor reads from ../FLYFF-V19-SOURCE (read-only) into a test folder.
#   tools/refresh-fixtures.sh                 -> test-data/fixtures  (automated tests only)
#   tools/refresh-fixtures.sh test-data       -> test-data           (your copy for testing in the browser)
set -e
cd "$(dirname "$0")/.."
SRC=../FLYFF-V19-SOURCE
DST=${1:-test-data/fixtures}
mkdir -p "$DST/Resource" "$DST/Client/Client" "$DST/Client/Theme"
cp -p $SRC/Server/Resource/Masquerade.prj $SRC/Server/Resource/character*.inc $SRC/Server/Resource/character*.txt.txt \
  $SRC/Server/Resource/Spec_Item.txt $SRC/Server/Resource/propItem.txt.txt $SRC/Server/Resource/propMover.txt \
  $SRC/Server/Resource/propMover.txt.txt $SRC/Server/Resource/propMoverEx.inc $SRC/Server/Resource/DonationShop.inc \
  $SRC/Server/Resource/BattlePass.inc $SRC/Server/Resource/Exchange_Script.txt $SRC/Server/Resource/textClient.inc \
  $SRC/Server/Resource/textClient.txt.txt $SRC/Server/Resource/define*.h $SRC/Server/Resource/ResData.h \
  $SRC/Server/Resource/WndStyle.h $SRC/Server/Resource/lang.h $SRC/Server/Resource/ContinentDef.h \
  $SRC/Server/Resource/World.inc $SRC/Server/Resource/world.txt.txt $SRC/Server/Resource/propMapComboBoxData.inc \
  $SRC/Server/Resource/propMapComboBoxData.txt.txt $SRC/Server/Resource/mdlDyna.inc $SRC/Server/Resource/etc.inc \
  $SRC/Server/Resource/etc.txt.txt "$DST/Resource/"
# Monster Drops: what the kill path also reads (loaders/drops.js), read-only
cp -p $SRC/Server/Resource/propDropEvent.inc $SRC/Server/Resource/except.txt $SRC/Server/Resource/PenyaTable.txt \
  $SRC/Server/Resource/expTable.inc $SRC/Server/Resource/Event.lua $SRC/Server/Resource/propItemEtc.inc "$DST/Resource/"
# Boxes: random boxes (server only) and sets (+ the game's LF copy below)
cp -p $SRC/Server/Resource/propGiftbox.inc $SRC/Server/Resource/propPackItem.inc "$DST/Resource/"
for d in $SRC/Server/Resource/World/*/; do
  n=$(basename "$d")
  # NPC placement (.dyo), area names (.rgn + the map's .txt.txt), continents (WdMadrigal.wld.cnt)
  for f in "$d"*.dyo "$d"*.rgn "$d"*.txt.txt "$d"*.wld.cnt; do [ -f "$f" ] && mkdir -p "$DST/Resource/World/$n" && cp -p "$f" "$DST/Resource/World/$n/"; done
done
for d in $SRC/Client/World/*/; do
  n=$(basename "$d")
  # the client's copy of each map's NPC placement (Add New NPC writes both copies)
  for f in "$d"*.dyo; do [ -f "$f" ] && mkdir -p "$DST/Client/World/$n" && cp -p "$f" "$DST/Client/World/$n/"; done
done
cp -p $SRC/Client/character.inc $SRC/Client/character.txt.txt $SRC/Client/DonationShop.inc $SRC/Client/BattlePass.inc $SRC/Client/Spec_Item.txt \
  $SRC/Client/Exchange_Script.txt $SRC/Client/defineNeuz.h $SRC/Client/etc.inc $SRC/Client/etc.txt.txt \
  $SRC/Client/defineText.h $SRC/Client/textClient.inc $SRC/Client/textClient.txt.txt $SRC/Client/propPackItem.inc "$DST/Client/"
cp -p $SRC/Client/Client/DonationShopTree.inc "$DST/Client/Client/"
# Client/Model: file names only (Add New NPC checks each model's .o3d / .ani files)
ls "$SRC/Client/Model" > "$DST/Client/Model.list"
# Client/Model/Texture names + each Mvr_*.o3d's textures (Add New NPC checks a model's textures)
ls "$SRC/Client/Model/Texture" > "$DST/Client/ModelTexture.list"
python3 "$(dirname "$0")/oracle_sim.py" modeltex "$SRC/Client/Model" > "$DST/Client/Model.textures"
# NPC portrait pictures (the new-NPC form shows them): all of them in a manual test copy, Juria's only for the tests
mkdir -p "$DST/Client/Char"
if [ "$DST" = "test-data/fixtures" ]; then cp -p "$SRC/Client/Char/char_Juria.tga" "$DST/Client/Char/"
else cp -p "$SRC"/Client/Char/char_*.tga "$SRC"/Client/Char/char_*.TGA "$DST/Client/Char/" 2>/dev/null || true; fi
cp -p $SRC/Client/Theme/BattlePass_*.tga "$DST/Client/Theme/"
# item icons (Boxes shows each box's icon): all of them in a manual test copy, one per picture format for the tests
mkdir -p "$DST/Client/Item"
if [ "$DST" = "test-data/fixtures" ]; then
  for f in Itm_SysSysScrBxLuck.dds itm_EveBalPbox.DDS Item_Barunasmeltbless01.dds Item_fCloDarkDragonCap.dds Item_sys_scr_VIP.dds \
    Itm_ArmShiSHIELD_NEXUS_D_01NEXUS.dds Itm_ArmShiShield_Dalaran_D_01Metal.dds Itm_ArmShiVerendus.dds Itm_ArmShieldTurtle.dds \
    Itm_SysSysQueAibatT.dds Itm_WeaAxeConstellation.dds Itm_WeaAxeIcedragon.dds Itm_WeaAxeSkel.dds; do cp -p "$SRC/Client/Item/$f" "$DST/Client/Item/"; done
else cp -p "$SRC"/Client/Item/* "$DST/Client/Item/"; fi
echo "refreshed $DST"
# the client's menu click switch (oracle_sim.py newmenu reads which menu ids open the exchange window)
if [ "$DST" = "test-data/fixtures" ]; then mkdir -p "$DST/src" && cp -p "$SRC/Source/Source/_Interface/WndWorld.cpp" "$DST/src/"; fi
