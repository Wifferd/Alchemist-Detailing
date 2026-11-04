#!/usr/bin/env python3
"""Compares wash.py lines with the baseline, line by line (by mode and scenario).

    wash_compare.py <baseline.txt> <results.txt>...

A line is ok when its err, worst and bad are each 0 or no more than the baseline's (the live site's, or the
absolute pass for the cut scenarios); FAIL otherwise, or when the run stopped (err -1) or has no baseline."""
import json, sys


def lines(path):
    out = {}
    for l in open(path):
        l = l.strip()
        if l.startswith('{'):
            d = json.loads(l)
            out[(d['mode'], d['scenario'])] = d
    return out


def main():
    base = lines(sys.argv[1])
    bad = 0
    for path in sys.argv[2:]:
        for key, d in lines(path).items():
            b = base.get(key)
            tag = f"wash {key[0]} {key[1]}: err {d['err']} worst {d['worst']} undos {d['undos']} bad {d.get('bad', 0)} land {d['land']} wash {d['wash']}"
            if d['err'] == -1:
                print(f"FAIL {tag} (stopped: {d.get('fail')})")
                bad += 1
                continue
            if b is None:
                print(f'FAIL {tag} (no baseline line)')
                bad += 1
                continue
            worse = [k for k in ('err', 'worst', 'bad') if d.get(k, 0) != 0 and d.get(k, 0) > b.get(k, 0)]
            ref = f"(baseline err {b['err']} worst {b['worst']} bad {b.get('bad', 0)})"
            if worse:
                why = '; '.join(d.get('why', [])) or json.dumps(d.get('jump') or d.get('under') or '')
                print(f"FAIL {tag} {ref} worse: {','.join(worse)} {why}")
                bad += 1
            else:
                print(f'ok {tag} {ref}')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
