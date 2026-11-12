#!/bin/bash
# A pretend iPhone walks every path of the wallet function (plan 4.2, 4.8): run it after EVERY deploy of "wallet".
# It makes one card through the card page's own calls (wallet_new_card, wallet_link: the visitor's publishable key),
# downloads the pass, reads its serial and token from pass.json, then checks Apple's web service with right and wrong
# tokens: register 201/200/401/400/404, "which passes changed?" 200/204, the pass 200/304/401, log 200, unregister
# 200/401, wrong methods 405, and that the gateway's JWT check is off (a 401 from the gateway would stop every update).
# With --cap it also registers 11 iPhones: the 11th is answered 200 and stored nowhere (10 per card).
#
# Needs: the wallet flag for Apple on, and a Pass Type ID certificate installed (wallet-sync/apple-cert), on that project.
# Usage:
#   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<publishable key> \
#     tools/wallet/apple_service_walk.sh [--ca <ca.pem>] [--out <folder>] [--cap] [--keep]
#   --ca    also run check_pkpass.sh on the downloaded pass (Apple's WWDR G4 + root, or the Phase A test CA)
#   --out   where to keep walk.pkpass (default: a temporary folder, removed at the end). It holds the card's tokens:
#           keep it outside every repository.
#   --keep  leave the first test iPhone registered (so a stamp shows "would push to 1"); default: unregister all
#   WALLET_WS_URL (optional): the webServiceURL the pass must carry, when the function is reached at another address
#           than its hosted one (a local copy); default: <SUPABASE_URL>/functions/v1/wallet/apple
# Prints PASS/FAIL lines and the card's code (not a secret); never prints a token. Exits 0 only when all pass.
set -u
ca=""; out=""; cap=0; keep=0
while [ $# -gt 0 ]; do
  case "$1" in
    --ca) ca="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    --cap) cap=1; shift ;;
    --keep) keep=1; shift ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
: "${SUPABASE_URL:?set SUPABASE_URL}"; : "${SUPABASE_ANON_KEY:?set SUPABASE_ANON_KEY}"
here="$(cd "$(dirname "$0")" && pwd)"
base="${SUPABASE_URL%/}/functions/v1/wallet"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
[ -n "$out" ] || out="$tmp"
mkdir -p "$out"
fails=0; n=0
pass() { n=$((n + 1)); echo "PASS $*"; }
fail() { n=$((n + 1)); fails=$((fails + 1)); echo "FAIL $*"; }
expect() { # expect <want> <got> <label>
  if [ "$1" = "$2" ]; then pass "$3 -> $2"; else fail "$3 -> $2 (want $1)"; fi
}
# req <method> <url> [curl args...]: sets $code, body in $tmp/body, headers in $tmp/head
req() {
  local m="$1" u="$2"; shift 2
  code=$(curl -sS -X "$m" -o "$tmp/body" -D "$tmp/head" -w '%{http_code}' --max-time 60 "$@" "$u") || code="curl-error"
}
rpc() { # rpc <function> <json args>
  req POST "${SUPABASE_URL%/}/rest/v1/rpc/$1" -H "apikey: $SUPABASE_ANON_KEY" -H "content-type: application/json" --data "$2"
}
rnd() { python3 -I -c "import secrets,sys;print(secrets.token_hex(int(sys.argv[1])))" "$1"; }
field() { python3 -I -c "import json,sys;print(json.load(open(sys.argv[1])).get(sys.argv[2],''))" "$@"; }

# ---------------------------------------------------------------- the gateway leaves the function's own checks alone
req GET "$base/apple/v1/devices/walk$(rnd 8)/registrations/pass.unknown"
expect 404 "$code" "verify_jwt off: an unauthenticated GET reaches the function (the gateway would answer 401)"
req POST "${SUPABASE_URL%/}/functions/v1/wallet-sync/sweep" -H "x-wallet-secret: wrong" -H "content-type: application/json" --data '{}'
if [ "$code" = 401 ] && grep -q '"not_allowed"' "$tmp/body"; then pass "wallet-sync refuses a wrong secret itself -> 401 not_allowed"
else fail "wallet-sync with a wrong secret -> $code $(head -c 80 "$tmp/body")"; fi
req GET "${SUPABASE_URL%/}/functions/v1/wallet-sync/sweep"
expect 405 "$code" "wallet-sync answers only POST"

# ---------------------------------------------------------------- a card, as the card page makes one
rpc wallet_new_card "{\"p\": {\"request_id\": \"$(python3 -I -c 'import uuid;print(uuid.uuid4())')\", \"website\": \"\"}}"
if [ "$code" != 200 ]; then fail "wallet_new_card -> $code $(head -c 200 "$tmp/body")"; echo "RESULT: stopped"; exit 1; fi
token=$(field "$tmp/body" token); card=$(field "$tmp/body" code)
pass "wallet_new_card made card $card"
rpc wallet_link "{\"p\": {\"token\": \"$token\", \"platform\": \"apple\"}}"
path=$(field "$tmp/body" path)
if [ "$code" = 200 ] && [[ "$path" == /wallet/apple/d/* ]]; then pass "wallet_link gave a download path"; else fail "wallet_link -> $code"; fi
dl="${path##*/}"

req GET "$base/apple/d/$dl"
ctype=$(grep -i '^content-type:' "$tmp/head" | tr -d '\r' | cut -d' ' -f2)
if [ "$code" = 200 ] && [ "$ctype" = "application/vnd.apple.pkpass" ]; then
  cp "$tmp/body" "$out/walk.pkpass"; pass "download -> 200 $ctype ($(wc -c <"$out/walk.pkpass") bytes)"
else
  fail "download -> $code $ctype $(head -c 200 "$tmp/body")"; echo "RESULT: stopped (no pass)"; exit 1
fi
req GET "$base/apple/d/$(python3 -I -c 'import secrets;print("".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(26)))')"
loc=$(grep -i '^location:' "$tmp/head" | tr -d '\r' | cut -d' ' -f2)
if [ "$code" = 302 ] && [[ "$loc" == *"#card" ]]; then pass "an unknown download token -> 302 to the card page"; else fail "unknown download token -> $code $loc"; fi
req GET "$base/apple/d/not-a-token"
expect 302 "$code" "a malformed download token"
req POST "$base/apple/d/$dl"
expect 405 "$code" "POST on the download route"

if [ -n "$ca" ]; then
  if "$here/check_pkpass.sh" "$out/walk.pkpass" "$ca" --tamper-test >"$tmp/check.txt" 2>&1; then
    pass "check_pkpass.sh on the downloaded pass ($(grep -c '^PASS' "$tmp/check.txt") checks, tamper test included)"
  else
    fail "check_pkpass.sh: $(grep '^FAIL' "$tmp/check.txt" | head -3 | tr '\n' ' ')"
  fi
fi

mkdir -p "$tmp/p" && unzip -q -o "$out/walk.pkpass" pass.json -d "$tmp/p"
serial=$(field "$tmp/p/pass.json" serialNumber); auth=$(field "$tmp/p/pass.json" authenticationToken)
ptid=$(field "$tmp/p/pass.json" passTypeIdentifier); ws=$(field "$tmp/p/pass.json" webServiceURL)
expect "$card" "$serial" "the pass's serial is the card code"
expect "${WALLET_WS_URL:-$base/apple}" "$ws" "webServiceURL"
wrong="$(python3 -I -c 'import secrets;print("".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(32)))')"
dev="walk$(rnd 16)"; push="$(rnd 32)"
reg="$base/apple/v1/devices/$dev/registrations/$ptid/$serial"

# ---------------------------------------------------------------- register
req POST "$reg" -H "Authorization: ApplePass $wrong" -H "content-type: application/json" --data "{\"pushToken\":\"$push\"}"
expect 401 "$code" "register with a wrong token"
req POST "$reg" -H "content-type: application/json" --data "{\"pushToken\":\"$push\"}"
expect 401 "$code" "register with no token"
req POST "$base/apple/v1/devices/$dev/registrations/pass.other.type/$serial" -H "Authorization: ApplePass $auth" --data "{\"pushToken\":\"$push\"}"
expect 404 "$code" "register for another pass type"
req POST "$reg" -H "Authorization: ApplePass $auth" -H "content-type: application/json" --data '{"pushToken":"not-hex"}'
expect 400 "$code" "register with a malformed push code"
req POST "$reg" -H "Authorization: ApplePass $auth" -H "content-type: application/json" --data "{\"pushToken\":\"$push\"}"
expect 201 "$code" "register (first time)"
req POST "$reg" -H "Authorization: ApplePass $auth" -H "content-type: application/json" --data "{\"pushToken\":\"$push\"}"
expect 200 "$code" "register again (already there)"
req PUT "$reg" -H "Authorization: ApplePass $auth"
expect 405 "$code" "PUT on a registration"

# ---------------------------------------------------------------- which passes changed?
list="$base/apple/v1/devices/$dev/registrations/$ptid"
req GET "$list"
tag=$(field "$tmp/body" lastUpdated 2>/dev/null)
if [ "$code" = 200 ] && grep -q "\"$serial\"" "$tmp/body" && [ -n "$tag" ]; then pass "changed passes, no tag -> 200 with $serial"; else fail "changed passes -> $code"; fi
req GET "$list?passesUpdatedSince=$tag"
expect 200 "$code" "changed passes since its own tag (the 10-second overlap: a late commit is never missed)"
req GET "$list?passesUpdatedSince=$((tag + 11000))"
expect 204 "$code" "changed passes since 11 s after the tag"
req GET "$base/apple/v1/devices/walk$(rnd 16)/registrations/$ptid"
expect 204 "$code" "changed passes for an unknown iPhone"
req POST "$list"
expect 405 "$code" "POST on the changed-passes list"

# ---------------------------------------------------------------- the latest pass
pp="$base/apple/v1/passes/$ptid/$serial"
req GET "$pp" -H "Authorization: ApplePass $auth"
lm=$(grep -i '^last-modified:' "$tmp/head" | tr -d '\r' | cut -d' ' -f2-)
if [ "$code" = 200 ] && [ -n "$lm" ]; then pass "the latest pass -> 200 (Last-Modified $lm)"; else fail "the latest pass -> $code"; fi
req GET "$pp" -H "Authorization: ApplePass $auth" -H "If-Modified-Since: $lm"
expect 304 "$code" "the latest pass, If-Modified-Since its Last-Modified"
req GET "$pp" -H "Authorization: ApplePass $auth" -H "If-Modified-Since: $(python3 -I -c 'import sys,email.utils as e,datetime as d;print(e.format_datetime(e.parsedate_to_datetime(sys.argv[1])-d.timedelta(days=1),usegmt=True))' "$lm")"
expect 200 "$code" "the latest pass, If-Modified-Since a day earlier"
req GET "$pp" -H "Authorization: ApplePass $wrong"
expect 401 "$code" "the latest pass with a wrong token"
req GET "$pp"
expect 401 "$code" "the latest pass with no token"
req GET "$base/apple/v1/passes/$ptid/ZZZZ2222" -H "Authorization: ApplePass $auth"
expect 401 "$code" "another card's serial with this token"
req GET "$base/apple/v1/passes/pass.other.type/$serial" -H "Authorization: ApplePass $auth"
expect 404 "$code" "another pass type"

# ---------------------------------------------------------------- log
req POST "$base/apple/v1/log" -H "content-type: application/json" --data '{"logs":["apple_service_walk: a test line, nothing personal"]}'
expect 200 "$code" "log"
req GET "$base/apple/v1/log"
expect 405 "$code" "GET on log"
req GET "$base/nothing/here"
expect 404 "$code" "an unknown path"

# ---------------------------------------------------------------- 10 iPhones per card
devs=()
if [ "$cap" = 1 ]; then
  for i in $(seq 2 11); do
    d="walk$(rnd 16)"; devs+=("$d")
    req POST "$base/apple/v1/devices/$d/registrations/$ptid/$serial" -H "Authorization: ApplePass $auth" \
      -H "content-type: application/json" --data "{\"pushToken\":\"$(rnd 32)\"}"
    if [ "$i" -le 10 ]; then [ "$code" = 201 ] || fail "iPhone $i -> $code (want 201)"
    else expect 200 "$code" "the 11th iPhone (answered 200, stored nowhere)"; fi
  done
  req GET "$base/apple/v1/devices/${devs[9]}/registrations/$ptid"
  expect 204 "$code" "the 11th iPhone has no card"
fi

# ---------------------------------------------------------------- unregister
req DELETE "$reg" -H "Authorization: ApplePass $wrong"
expect 401 "$code" "unregister with a wrong token"
req DELETE "$reg" -H "Authorization: ApplePass $auth"
expect 200 "$code" "unregister"
req GET "$list"
expect 204 "$code" "changed passes after unregistering"
req POST "$reg" -H "Authorization: ApplePass $auth" -H "content-type: application/json" --data "{\"pushToken\":\"$push\"}"
expect 201 "$code" "register again after unregistering"
for d in "${devs[@]}"; do
  curl -sS -o /dev/null -X DELETE -H "Authorization: ApplePass $auth" "$base/apple/v1/devices/$d/registrations/$ptid/$serial"
done
if [ "$keep" = 0 ]; then
  req DELETE "$reg" -H "Authorization: ApplePass $auth"
  expect 200 "$code" "unregister at the end (cleanup)"
fi

echo "CARD: $card"
if [ "$fails" -eq 0 ]; then echo "RESULT: all $n checks passed"; exit 0; fi
echo "RESULT: $fails of $n checks failed"; exit 1
