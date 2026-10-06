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
  $SRC/Server/Resource/propMapComboBoxData.txt.txt "$DST/Resource/"
for d in $SRC/Server/Resource/World/*/; do
  n=$(basename "$d")
  # NPC placement (.dyo), area names (.rgn + the map's .txt.txt), continents (WdMadrigal.wld.cnt)
  for f in "$d"*.dyo "$d"*.rgn "$d"*.txt.txt "$d"*.wld.cnt; do [ -f "$f" ] && mkdir -p "$DST/Resource/World/$n" && cp -p "$f" "$DST/Resource/World/$n/"; done
done
cp -p $SRC/Client/character.inc $SRC/Client/DonationShop.inc $SRC/Client/BattlePass.inc $SRC/Client/Spec_Item.txt \
  $SRC/Client/Exchange_Script.txt "$DST/Client/"
cp -p $SRC/Client/Client/DonationShopTree.inc "$DST/Client/Client/"
cp -p $SRC/Client/Theme/BattlePass_*.tga "$DST/Client/Theme/"
echo "refreshed $DST"
