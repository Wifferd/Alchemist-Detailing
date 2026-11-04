#!/usr/bin/env bash
# Shows that wash.py catches the real bug of doc 35: runs fling, back_rest and decay in mode ios on the site as it
# was just before the fix (the parent of the commit "The wash no longer jumps the page on iPhone", found in the
# history) and on HEAD. The old site must show undos or a jump over 400 px; HEAD must show none.
#   tools/qa/selftest.sh <scratch_dir>
set -u
QA=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$QA/../.." && pwd)
SCRATCH=${1:?usage: selftest.sh <scratch_dir>}
FIX=$(git -C "$REPO" log --format=%h -i --grep "no longer jumps the page on iPhone" | tail -1)
if [ -z "$FIX" ]; then git -C "$REPO" fetch --depth=200 origin main >/dev/null 2>&1; FIX=$(git -C "$REPO" log --all --format=%h -i --grep "no longer jumps the page on iPhone" | tail -1); fi
[ -n "$FIX" ] || { echo "FAIL selftest: the doc 35 fix commit is not in the history"; exit 1; }
OLD=$(git -C "$REPO" rev-parse --short "$FIX^")
echo "the fix: $(git -C "$REPO" log -1 --format='%h %s' "$FIX"); before it: $OLD"
mkdir -p "$SCRATCH/prefix"
rm -rf "$SCRATCH/prefix/site"
git -C "$REPO" archive "$OLD" site | tar -x -C "$SCRATCH/prefix"
python3 "$QA/wash.py" "$SCRATCH/prefix/site" ios fling,back_rest,decay > "$SCRATCH/prefix/ios.txt" 2>&1 &
python3 "$QA/wash.py" "$REPO/site" ios fling,back_rest,decay > "$SCRATCH/prefix/head.txt" 2>&1
wait
python3 - "$SCRATCH/prefix/ios.txt" "$SCRATCH/prefix/head.txt" "$OLD" <<'EOF'
import json, sys
old = [json.loads(l) for l in open(sys.argv[1]) if l.startswith('{')]
head = [json.loads(l) for l in open(sys.argv[2]) if l.startswith('{')]
ok = len(old) == 3 and len(head) == 3
for d in old:
    caught = d['undos'] > 0 or d['worst'] > 400
    ok = ok and caught
    print(f"{'caught' if caught else 'MISSED'} {sys.argv[3]} {d['scenario']}: undos {d['undos']} worst {d['worst']} err {d['err']}")
for d in head:
    clean = d['err'] == 0 and d['undos'] == 0 and d['worst'] == 0
    ok = ok and clean
    print(f"{'clean' if clean else 'NOT CLEAN'} HEAD {d['scenario']}: undos {d['undos']} worst {d['worst']} err {d['err']}")
print('SELFTEST', 'ok' if ok else 'FAIL')
sys.exit(0 if ok else 1)
EOF
