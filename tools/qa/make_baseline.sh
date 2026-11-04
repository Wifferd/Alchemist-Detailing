#!/usr/bin/env bash
# Writes tools/qa/wash_baseline.txt: every wash.py scenario the live site has, run on the live site (main, 6dbb2c7,
# exported with git archive into a scratch folder) in modes ios, chromium and desk. The cut and Back scenarios
# (wash.py CUT_SCENARIOS: the live site has no cut through black and no Back) get the absolute pass: err 0, worst 0,
# undos 0, bad 0.
#   tools/qa/make_baseline.sh <scratch_dir> [commit]
set -u
QA=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$QA/../.." && pwd)
SCRATCH=${1:?usage: make_baseline.sh <scratch_dir> [commit]}
COMMIT=${2:-6dbb2c7}
mkdir -p "$SCRATCH/live"
rm -rf "$SCRATCH/live/site"
git -C "$REPO" archive "$COMMIT" site | tar -x -C "$SCRATCH/live"
ON=$(python3 -c "import sys; sys.path.insert(0, '$QA'); import wash; print(','.join(s for s in wash.SCENARIOS if s not in wash.CUT_SCENARIOS))")
CUT=$(python3 -c "import sys; sys.path.insert(0, '$QA'); import wash; print(' '.join(wash.CUT_SCENARIOS))")
{ python3 "$QA/wash.py" "$SCRATCH/live/site" ios "$ON" > "$SCRATCH/live/ios.txt" 2>&1; python3 "$QA/wash.py" "$SCRATCH/live/site" chromium "$ON" > "$SCRATCH/live/chromium.txt" 2>&1; } &
python3 "$QA/wash.py" "$SCRATCH/live/site" desk "$ON" > "$SCRATCH/live/desk.txt" 2>&1
wait
{
  echo "# wash.py on the live site ($COMMIT, $(git -C "$REPO" log -1 --format=%cs "$COMMIT")), written by make_baseline.sh on $(date -u +%F)."
  echo "# The cut and Back scenarios ($CUT) do not exist there: their lines are the absolute pass."
  for m in ios chromium desk; do
    grep '^{' "$SCRATCH/live/$m.txt"
    for s in $CUT; do
      echo "{\"mode\": \"$m\", \"scenario\": \"$s\", \"err\": 0, \"worst\": 0, \"undos\": 0, \"jumps\": 0, \"bad\": 0, \"wash\": null, \"land\": null, \"absolute\": true}"
    done
  done
} > "$QA/wash_baseline.txt"
grep -c '^{' "$QA/wash_baseline.txt"
grep '^{' "$QA/wash_baseline.txt" | python3 -c "import json, sys
for l in sys.stdin:
    d = json.loads(l); print(d['mode'], d['scenario'], 'err', d['err'], 'worst', d['worst'], 'undos', d['undos'], 'bad', d.get('bad'), d.get('why', ''), d.get('fail', ''))"
