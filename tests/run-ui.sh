#!/bin/sh
# Headless UI check: builds the harness (fixtures embedded), takes
# headless screenshots of the stages. Output: test-data/ui-*.png
# Firefox when it is installed (Linux); otherwise Brave (Windows, Git Bash or WSL): BRAVE=<path to brave.exe> overrides the search.
set -e
cd "$(dirname "$0")/.."
PY=python3; command -v python3 >/dev/null 2>&1 && python3 -c 1 2>/dev/null || PY=python
$PY build.py --harness >/dev/null
BROWSER=firefox
if ! command -v firefox >/dev/null 2>&1; then
  BROWSER=brave
  if [ -z "$BRAVE" ]; then
    for p in "$LOCALAPPDATA/BraveSoftware/Brave-Browser/Application/brave.exe" \
      "/c/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe" \
      "/mnt/c/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe" \
      /mnt/c/Users/*/AppData/Local/BraveSoftware/Brave-Browser/Application/brave.exe; do
      [ -f "$p" ] && BRAVE=$p && break
    done
  fi
  [ -n "$BRAVE" ] || { echo "no firefox and no brave.exe found (set BRAVE=...)"; exit 1; }
  if command -v cygpath >/dev/null 2>&1; then WIN=$(cygpath -m "$PWD"); else WIN=$(wslpath -m "$PWD"); fi
fi
ALL="start loaded shoptype review newnpcform newnpc newmenu mfcards mftry npcedit shoprules rulesmenu nnmenus npcmove pospaste dsbuy dstree drops dropskill dropsgen boxes boxesopen newbox boxsettings where wheregifts rates ratescalc levelgifts rebirth bpexpired bpseason bpladder bpmonsters bphistory exchange exsim exrecipe end"
if [ "$BROWSER" = brave ]; then
  # one browser for every stage, driven over DevTools: each shot is taken when the harness has finished (tests/ui-shot.mjs)
  BRAVE="$BRAVE" exec node tests/ui-shot.mjs ${STAGES:-$ALL}
fi
PROFILE=$(mktemp -d)
for stage in ${STAGES:-start loaded shoptype review newnpcform newnpc newmenu mfcards mftry npcedit shoprules rulesmenu nnmenus npcmove pospaste dsbuy dstree drops dropskill dropsgen boxes boxesopen newbox boxsettings where wheregifts rates ratescalc levelgifts rebirth bpexpired bpseason bpladder bpmonsters bphistory exchange exsim exrecipe end}; do
  if [ "$BROWSER" = firefox ]; then
    firefox --headless --profile "$PROFILE" --window-size 1600,1000 \
      --screenshot "$PWD/test-data/ui-$stage.png" "file://$PWD/test-data/harness.html?stop=$stage" >/dev/null 2>&1 || true
  else
    # Brave/Chromium: a throwaway profile PER STAGE (with a shared one, a stage still running makes the next launch hand its
    # URL over and return at once, without a screenshot), and at most 5 minutes a stage
    rm -f "$PWD/test-data/ui-$stage.png"
    timeout 300 "$BRAVE" --headless=new --disable-gpu --user-data-dir="$WIN/test-data/.brave-$stage" --window-size=1600,1000 \
      --virtual-time-budget=20000 --screenshot="$WIN/test-data/ui-$stage.png" "file:///$WIN/test-data/harness.html?stop=$stage" >/dev/null 2>&1 || true
    rm -rf "$PWD/test-data/.brave-$stage" 2>/dev/null || true
  fi
  [ -f "$PWD/test-data/ui-$stage.png" ] && echo "screenshot: test-data/ui-$stage.png" || echo "NO screenshot for $stage"
done
rm -rf "$PROFILE"
