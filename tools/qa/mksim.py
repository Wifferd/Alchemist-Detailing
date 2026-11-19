"""(QA kit, doc 55) Copy site/ and rewrite viewport units as iOS Safari resolves them: vh and lvh = LVH px, svh = SVH px; dvh left to the
browser (it follows the emulated viewport, as dvh follows the toolbar). Usage: mksim.py <site> <out> <LVH> <SVH>
iPhone 13 in Safari: 750 664 (toolbar.py then opens it 664 tall with the toolbar shown, 750 once collapsed). For
wash.py's 390x844 phone: 844 758 (its screen is the toolbar-collapsed one) or 930 844 (the toolbar-shown one).
<out> is replaced only if it is an earlier copy (it holds css/alchemist.css)."""
import re, shutil, sys, pathlib
site, out, L, S = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
if pathlib.Path(out).exists():
    if not (pathlib.Path(out) / 'css/alchemist.css').is_file():
        sys.exit(f'{out} exists and is not a site copy: not replacing it')
    shutil.rmtree(out)
shutil.copytree(site, out)
p = pathlib.Path(out) / 'css/alchemist.css'
t = p.read_text()
def rep(m):
    n, u = float(m.group(1)), m.group(2)
    px = n * (L if u in ('vh', 'lvh') else S) / 100
    return f'{px:.3f}px'
t2, k = re.subn(r'(?<![\w.-])(\d+(?:\.\d+)?)(lvh|svh|vh)\b', rep, t)
p.write_text(t2)
print('replaced', k)
