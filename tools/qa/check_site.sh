#!/usr/bin/env bash
# The site's checks, in one go: prints "ok ...", "FAIL ..." or "env ..." lines (env: refused by this sandbox, not
# the site's fault), then CHECK_DONE.
#   tools/qa/check_site.sh <out_dir> [wash]
# 1. node --check on every site/js file   2. tools/build_artifact.py   3. the booking walks (guest desktop, guest
# phone, guest phone light, text codes), the account, admin and team walks   4. smoke.py: every route at desk and
# at phone widths 360/390/440   5. with "wash": wash.py, every scenario in modes ios, chromium and desk, compared
# with tools/qa/wash_baseline.txt (wash_compare.py), and back_walk.py owner on phone and desk.
# Screens and raw output go to <out_dir>. The browsers never reach Supabase: the kit's Chromium wrapper sends
# *.supabase.co to a closed local port, so every page runs in preview mode.
set -u
QA=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$QA/../.." && pwd)
OUT=${1:?usage: check_site.sh <out_dir> [wash]}
WASH=${2:-}
mkdir -p "$OUT/walks" "$OUT/wash" "$OUT/back"
OUT=$(cd "$OUT" && pwd)
cd "$REPO"

# the Chromium every script here drives, wrapped so no request reaches Supabase
REAL=$(python3 -c "import sys; sys.path.insert(0, '$QA'); import qalib; print(qalib.chrome() or '')")
if [ -z "$REAL" ]; then echo "FAIL no Chromium found (set QA_CHROME)"; echo CHECK_DONE; exit 1; fi
cat > "$OUT/chrome" <<EOF
#!/bin/sh
exec "$REAL" --host-resolver-rules="MAP *.supabase.co 127.0.0.1:9" --proxy-bypass-list="*.supabase.co" "\$@"
EOF
chmod +x "$OUT/chrome"
export SHOOT_CHROME="$OUT/chrome" QA_CHROME="$OUT/chrome"

# 1. every script parses
for f in site/js/*.js; do
  if err=$(node --check "$f" 2>&1); then echo "ok node --check $f"; else echo "FAIL node --check $f: $(echo "$err" | head -3 | tr '\n' ' ')"; fi
done

# 2. the single-file preview builds
if b=$(python3 tools/build_artifact.py 2>&1); then echo "ok build_artifact: $b"; else echo "FAIL build_artifact: $(echo "$b" | tail -3 | tr '\n' ' ')"; fi

# 3. the walks (each prints its result line, then any page errors)
walk() {   # name, expected first word, command...
  local name=$1 want=$2; shift 2
  local log="$OUT/walks/$name.txt"
  "$@" > "$log" 2>&1
  local code=$?
  local extra
  extra=$(grep -v -E "^(\{|ok$|note: )" "$log" | grep -v '^$')
  if [ $code -eq 0 ] && grep -q -E "$want" "$log" && [ -z "$extra" ]; then
    echo "ok walk $name: $(grep -E "$want" "$log" | head -1 | cut -c1-160)"
  else
    echo "FAIL walk $name (exit $code): $(tail -4 "$log" | tr '\n' ' ' | cut -c1-300)"
  fi
}
walk booking-guest-desk '"mode": ?"preview".*"ref"' python3 tools/shoot_booking.py "$OUT/walks/guest-desk" 1440 900
walk booking-guest-phone '"mode": ?"preview".*"ref"' python3 tools/shoot_booking.py "$OUT/walks/guest-phone" 390 844
walk booking-guest-phone-light '"mode": ?"preview".*"ref"' env SHOOT_THEME=light python3 tools/shoot_booking.py "$OUT/walks/guest-phone-light" 390 844
walk booking-text-codes '"mode": ?"preview".*"ref"' env SHOOT_QUERY='&guest=0' python3 tools/shoot_booking.py "$OUT/walks/text-codes" 390 844
walk account '^ok$' python3 tools/shoot_account.py "$OUT/walks/account" 390 844
walk admin '^ok$' python3 tools/shoot_admin.py "$OUT/walks/admin" 1440 900
walk team '^ok$' python3 tools/shoot_team.py "$OUT/walks/team" 1440 900

# 4. every route, every width
python3 "$QA/smoke.py" site > "$OUT/smoke.txt" 2>&1
grep -E "^(ok|FAIL|env) " "$OUT/smoke.txt"
grep -q '^SMOKE_DONE' "$OUT/smoke.txt" || echo "FAIL smoke: did not finish ($(tail -2 "$OUT/smoke.txt" | tr '\n' ' ' | cut -c1-200))"

# 5. the wash and Back
if [ "$WASH" = "wash" ]; then
  # two lanes (four cores here): the phones one after the other, the computer beside them
  { python3 "$QA/wash.py" site ios all > "$OUT/wash/ios.txt" 2>&1; python3 "$QA/wash.py" site chromium all > "$OUT/wash/chromium.txt" 2>&1; } &
  python3 "$QA/wash.py" site desk all > "$OUT/wash/desk.txt" 2>&1
  wait
  python3 "$QA/wash_compare.py" "$QA/wash_baseline.txt" "$OUT/wash/ios.txt" "$OUT/wash/chromium.txt" "$OUT/wash/desk.txt"
  for s in ios chromium desk; do
    n=$(grep -c '^{' "$OUT/wash/$s.txt")
    [ "$n" -eq 11 ] || echo "FAIL wash $s: $n of 11 runs reported ($(grep -v '^{' "$OUT/wash/$s.txt" | tail -2 | tr '\n' ' ' | cut -c1-200))"
  done
  for size in phone desk; do
    python3 "$QA/back_walk.py" site "$size" dark owner "$OUT/back" > "$OUT/back/owner-$size.txt" 2>&1
    sed -n -E 's/^PASS /ok back /p; s/^FAIL /FAIL back /p' "$OUT/back/owner-$size.txt"
    grep -q '^BACK_DONE' "$OUT/back/owner-$size.txt" || echo "FAIL back owner $size: did not finish ($(tail -2 "$OUT/back/owner-$size.txt" | tr '\n' ' ' | cut -c1-200))"
  done
fi
echo CHECK_DONE
