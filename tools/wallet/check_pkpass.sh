#!/bin/bash
# Checks an Apple Wallet pass (.pkpass) the way Wallet would, as far as can be done without an iPhone (plan 4.3, 9):
#   1. the zip holds pass.json, manifest.json, signature and icon.png;
#   2. manifest.json lists every other file with its SHA-1, and nothing else;
#   3. "signature" is a detached CMS signature of manifest.json that openssl verifies against the CA you give
#      (Apple's WWDR G4 and root for a real pass; the Phase A test CA for a test pass), with the contentType,
#      messageDigest and signingTime attributes, SHA-256, and the signer certificate plus its issuer inside;
#   4. the signer certificate's UID is the pass's passTypeIdentifier and its OU the teamIdentifier;
#   5. pass.json: the keys Apple requires, one style (storeCard), web service URL and token together, barcodes,
#      unique field keys, change messages with %@, rgb() colours, and the house rules (no reward, perk, discount or
#      "free", no price, nothing saying the number takes texts, the only phone number is (945) 361-7551);
#   6. picture sizes: icon 38 pt, logo at most 160 x 50 pt, strip 375 x 144 pt, at @1x, @2x and @3x.
# An iPhone will still refuse a pass signed by the test CA: this proves the structure, not that Apple accepts it.
#
# Usage: tools/wallet/check_pkpass.sh <file.pkpass> <ca.pem> [--pass-type <id>] [--tamper-test]
#   --tamper-test also re-checks two tampered copies (pass.json changed; then manifest.json changed to match) and
#   passes only if both are refused.
# Prints PASS/FAIL lines; exits 0 only when every check passes. Prints nothing secret (a pass holds no private key).
set -u
pkpass="${1:-}"; ca="${2:-}"; shift 2 2>/dev/null || true
want_type=""; tamper=0
while [ $# -gt 0 ]; do
  case "$1" in
    --pass-type) want_type="$2"; shift 2 ;;
    --tamper-test) tamper=1; shift ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
if [ ! -f "$pkpass" ] || [ ! -f "$ca" ]; then
  echo "usage: $0 <file.pkpass> <ca.pem> [--pass-type <id>] [--tamper-test]" >&2; exit 2
fi
pkpass="$(cd "$(dirname "$pkpass")" && pwd)/$(basename "$pkpass")"
ca="$(cd "$(dirname "$ca")" && pwd)/$(basename "$ca")"
self="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
fails=0
pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; fails=$((fails + 1)); }

mkdir "$work/x"
if ! unzip -q "$pkpass" -d "$work/x" 2>"$work/unzip.err"; then
  fail "unzip: $(head -c 200 "$work/unzip.err")"; echo "RESULT: $fails failed"; exit 1
fi
cd "$work/x" || exit 2
for f in pass.json manifest.json signature icon.png; do
  [ -f "$f" ] && pass "has $f" || fail "missing $f"
done

# 2 and 5 and 6: manifest, pass.json and pictures, in Python (standard library only, isolated mode)
python3 -I - "$want_type" <<'PY' || fails=$((fails + 1))
import hashlib, json, os, re, struct, sys
want_type = sys.argv[1]
bad = 0
def ok(m): print("PASS " + m)
def no(m):
    global bad; bad += 1; print("FAIL " + m)

files = sorted(os.path.relpath(os.path.join(d, f), ".") for d, _, fs in os.walk(".") for f in fs)
try:
    manifest = json.load(open("manifest.json"))
except Exception as e:
    no("manifest.json is not JSON: %s" % e); manifest = {}
listed = set(manifest)
others = set(files) - {"manifest.json", "signature"}
if listed == others: ok("manifest lists exactly the %d other files" % len(others))
else: no("manifest/files differ: unlisted %s, missing %s" % (sorted(others - listed), sorted(listed - others)))
mism = [f for f in sorted(listed & others) if hashlib.sha1(open(f, "rb").read()).hexdigest() != manifest[f]]
if not mism: ok("every SHA-1 in the manifest matches")
else: no("SHA-1 mismatch: %s" % mism)

try:
    p = json.load(open("pass.json"))
except Exception as e:
    no("pass.json is not JSON: %s" % e); p = {}
for k in ["formatVersion", "passTypeIdentifier", "serialNumber", "teamIdentifier", "organizationName", "description"]:
    if k not in p: no("pass.json lacks %s" % k)
if p.get("formatVersion") == 1: ok("formatVersion 1")
else: no("formatVersion must be 1")
styles = [s for s in ["boardingPass", "coupon", "eventTicket", "generic", "storeCard", "posterGeneric"] if s in p]
if styles == ["storeCard"]: ok("one style: storeCard")
else: no("styles present: %s (want storeCard only)" % styles)
if want_type and p.get("passTypeIdentifier") != want_type: no("passTypeIdentifier %r, want %r" % (p.get("passTypeIdentifier"), want_type))
elif want_type: ok("passTypeIdentifier is %s" % want_type)
if re.fullmatch(r"[A-Za-z0-9]{10}", str(p.get("teamIdentifier", ""))): ok("teamIdentifier has 10 letters/digits")
else: no("teamIdentifier should be 10 letters/digits")
ws, tok = p.get("webServiceURL"), p.get("authenticationToken")
if (ws is None) != (tok is None): no("webServiceURL and authenticationToken must come together")
elif ws is not None:
    if str(ws).startswith("https://") and len(str(tok)) >= 16: ok("web service: https and a token of %d characters" % len(str(tok)))
    else: no("web service URL must be https and the token at least 16 characters")
if "barcode" in p: no("uses the deprecated single 'barcode' key")
bcs = p.get("barcodes", [])
if bcs and all(b.get("format") in ("PKBarcodeFormatQR", "PKBarcodeFormatPDF417", "PKBarcodeFormatAztec", "PKBarcodeFormatCode128")
               and b.get("message") and b.get("messageEncoding") for b in bcs):
    ok("barcodes: %s" % ", ".join(b["format"] for b in bcs))
else: no("barcodes missing or incomplete")
for c in ["backgroundColor", "foregroundColor", "labelColor"]:
    v = p.get(c)
    if v is not None and not re.fullmatch(r"rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)", v): no("%s is not rgb(r, g, b): %r" % (c, v))
style = p.get("storeCard", {})
keys, fields = [], []
for group in ["headerFields", "primaryFields", "secondaryFields", "auxiliaryFields", "backFields"]:
    for f in style.get(group, []):
        fields.append(f); keys.append(f.get("key"))
        if "key" not in f or "value" not in f: no("%s field without key or value" % group)
        if "changeMessage" in f and "%@" not in f["changeMessage"]: no("changeMessage of %s lacks %%@" % f.get("key"))
        if "attributedValue" in f and re.search(r"<(?!a\s|/a>)", f["attributedValue"]): no("attributedValue of %s has a tag other than <a>" % f.get("key"))
if len(keys) == len(set(keys)): ok("%d fields, keys unique" % len(keys))
else: no("duplicate field keys: %s" % keys)
front = sum(len(style.get(g, [])) for g in ["secondaryFields", "auxiliaryFields"])
if front <= 4: ok("secondary + auxiliary fields: %d (at most 4)" % front)
else: no("too many secondary + auxiliary fields: %d" % front)
# house rules on every string in pass.json
strings = []
def walk(x):
    if isinstance(x, dict): [walk(v) for v in x.values()]
    elif isinstance(x, list): [walk(v) for v in x]
    elif isinstance(x, str): strings.append(x)
walk(p)
text = "\n".join(strings)
banned = [w for w in [r"\bfree\b", r"\brewards?\b", r"\bperks?\b", r"\bdiscounts?\b", r"% ?off\b", r"\$\s?\d", r"\btext (us|me)\b", r"\bor text\b", r"\bsms\b"]
          if re.search(w, text, re.I)]
if not banned: ok("no reward, perk, discount, free, price or 'text us' wording")
else: no("banned wording: %s" % banned)
phones = set(re.findall(r"\(?\b\d{3}\)?[ .-]?\d{3}[ .-]\d{4}\b", text))
if phones <= {"(945) 361-7551"}: ok("phone numbers: %s" % (sorted(phones) or "none"))
else: no("unexpected phone numbers: %s" % sorted(phones))

def png_size(path):
    with open(path, "rb") as fh:
        head = fh.read(24)
    if head[:8] != b"\x89PNG\r\n\x1a\n": return None
    return struct.unpack(">II", head[16:24])
limits = {"icon": (38, 38, True), "logo": (160, 50, False), "strip": (375, 144, True)}
for name, (w, h, exact) in limits.items():
    for scale, sfx in [(1, ""), (2, "@2x"), (3, "@3x")]:
        f = "%s%s.png" % (name, sfx)
        if not os.path.exists(f):
            if name == "icon" and scale == 1: no("icon.png missing")
            continue
        s = png_size(f)
        if s is None: no("%s is not a PNG" % f); continue
        if exact and s != (w * scale, h * scale): no("%s is %dx%d, want %dx%d" % (f, s[0], s[1], w * scale, h * scale))
        elif not exact and (s[0] > w * scale or s[1] > h * scale): no("%s is %dx%d, over %dx%d" % (f, s[0], s[1], w * scale, h * scale))
        else: ok("%s %dx%d" % (f, s[0], s[1]))
sys.exit(1 if bad else 0)
PY

# 3: the signature
if openssl cms -verify -binary -inform DER -in signature -content manifest.json -CAfile "$ca" -purpose any \
     -out /dev/null 2>"$work/cms.err"; then
  pass "openssl cms -verify: the signature over manifest.json verifies against $(basename "$ca")"
else
  fail "openssl cms -verify: $(tr '\n' ' ' <"$work/cms.err" | head -c 300)"
fi
openssl cms -cmsout -print -inform DER -in signature >"$work/cms.txt" 2>/dev/null
for a in contentType messageDigest signingTime; do
  grep -q "object: $a" "$work/cms.txt" && pass "signed attribute $a" || fail "signed attribute $a missing"
done
grep -q "algorithm: sha256" "$work/cms.txt" && pass "digest SHA-256" || fail "digest is not SHA-256"
grep -q "eContent: <ABSENT>" "$work/cms.txt" && pass "detached (no content inside)" || fail "not a detached signature"
openssl pkcs7 -inform DER -in signature -print_certs >"$work/certs.pem" 2>/dev/null
ncert=$(grep -c "BEGIN CERTIFICATE" "$work/certs.pem")
[ "$ncert" -ge 2 ] && pass "signature carries $ncert certificates (signer + issuer)" || fail "signature carries $ncert certificate(s), want the signer and its issuer"

# 4: the signer certificate matches pass.json
openssl cms -verify -binary -inform DER -in signature -content manifest.json -CAfile "$ca" -purpose any -out /dev/null \
  -signer "$work/signer.pem" 2>/dev/null
if [ -s "$work/signer.pem" ]; then
  subj=$(openssl x509 -in "$work/signer.pem" -noout -subject -nameopt sep_multiline,lname 2>/dev/null)
  uid=$(printf '%s\n' "$subj" | sed -n 's/^ *userId=//p'); ou=$(printf '%s\n' "$subj" | sed -n 's/^ *organizationalUnitName=//p')
  ptype=$(python3 -I -c 'import json;print(json.load(open("pass.json")).get("passTypeIdentifier",""))')
  team=$(python3 -I -c 'import json;print(json.load(open("pass.json")).get("teamIdentifier",""))')
  [ -n "$uid" ] && [ "$uid" = "$ptype" ] && pass "signer certificate UID = passTypeIdentifier ($uid)" || fail "signer UID '$uid' is not passTypeIdentifier '$ptype'"
  [ -n "$ou" ] && [ "$ou" = "$team" ] && pass "signer certificate OU = teamIdentifier ($ou)" || fail "signer OU '$ou' is not teamIdentifier '$team'"
  exp=$(openssl x509 -in "$work/signer.pem" -noout -enddate | cut -d= -f2)
  openssl x509 -in "$work/signer.pem" -noout -checkend 0 >/dev/null && pass "signer certificate valid until $exp" || fail "signer certificate expired ($exp)"
else
  fail "could not read the signer certificate"
fi

if [ "$tamper" = 1 ]; then
  cd "$work" || exit 2
  # a) pass.json changed, manifest left alone
  cp -r x t1 && python3 -I -c 'import json;p=json.load(open("t1/pass.json"));p["organizationName"]="Someone else";json.dump(p,open("t1/pass.json","w"))'
  (cd t1 && zip -q -r ../t1.pkpass .)
  # b) pass.json changed and manifest.json updated to match (the signature no longer covers it)
  cp -r t1 t2 && python3 -I -c 'import hashlib,json;m=json.load(open("t2/manifest.json"));m["pass.json"]=hashlib.sha1(open("t2/pass.json","rb").read()).hexdigest();json.dump(m,open("t2/manifest.json","w"))'
  (cd t2 && zip -q -r ../t2.pkpass .)
  for t in t1 t2; do
    if "$self" "$work/$t.pkpass" "$ca" >"$work/$t.out" 2>&1; then
      fail "tampered copy ($t) was accepted"
    else
      pass "tampered copy ($t) refused: $(grep '^FAIL' "$work/$t.out" | head -1 | cut -c6-90)"
    fi
  done
fi

if [ "$fails" -eq 0 ]; then echo "RESULT: all checks passed"; exit 0; fi
echo "RESULT: $fails check group(s) failed"; exit 1
