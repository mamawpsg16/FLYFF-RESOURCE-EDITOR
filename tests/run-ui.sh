#!/bin/sh
# Headless UI check: builds the harness (fixtures embedded), takes
# Firefox screenshots of four stages. Output: test-data/ui-*.png
set -e
cd "$(dirname "$0")/.."
python3 build.py --harness >/dev/null
PROFILE=$(mktemp -d)
for stage in ${STAGES:-start loaded shoptype review newnpcform newnpc newmenu mfcards mftry npcedit shoprules rulesmenu nnmenus npcmove pospaste dsbuy dstree drops dropskill dropsgen boxes boxesopen newbox boxsettings where bpexpired bpseason bpladder bpmonsters bphistory exchange exsim exrecipe end}; do
  firefox --headless --profile "$PROFILE" --window-size 1600,1000 \
    --screenshot "$PWD/test-data/ui-$stage.png" "file://$PWD/test-data/harness.html?stop=$stage" >/dev/null 2>&1 || true
  echo "screenshot: test-data/ui-$stage.png"
done
rm -rf "$PROFILE"
