#!/usr/bin/env python3
"""Builds m002_tests_pricing.sql: the Migration 002 price matrix, priced by an
independent model of the owner's rules and compared with quote_booking.
Rules (docs 02, 17, 23 and 24):
  * a bundle replaces its parts at the bundle price; the difference is the saving
  * mobile adds each line's percentage, rounded half up to the cent
    (2.5% Basic services, add-ons and condition fees; 7% Deluxe services and bundles)
  * Interior Deluxe includes steam (also inside the Full Detail Bundle)
  * steam needs an interior service and takes 30 minutes; the sealant (WetGloss)
    needs an exterior service, is priced by vehicle type and takes 30 minutes
  * condition fees need an interior service: pet hair $15, dirt / mud / sand $10,
    spills / light stains $10, heavy stains $30; Interior Deluxe and the Full
    Detail Bundle include the first three, never heavy stains; None and Other
    cost nothing; fees add no minutes
  * XL, or a sealant with no price for the vehicle: no total

The inputs are generated on the server in the same order as here (nested
unnest with ordinality), so only the expected results travel: one short string
per combination, "total|mobile|minutes|suggested saving" or the error code.
"""
import json
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

SVC = {
    'ext_basic': dict(kind='exterior', price=4999, dur=60, pct=Decimal('2.5')),
    'ext_deluxe': dict(kind='exterior', price=9499, dur=90, pct=Decimal('7')),
    'int_basic': dict(kind='interior', price=5999, dur=60, pct=Decimal('2.5')),
    'int_deluxe': dict(kind='interior', price=13499, dur=120, pct=Decimal('7')),
    'signature_combo': dict(kind='bundle', price=9999, dur=120, pct=Decimal('7'), parts=['ext_basic', 'int_basic']),
    'full_detail': dict(kind='bundle', price=20999, dur=210, pct=Decimal('7'), parts=['ext_deluxe', 'int_deluxe']),
    'perfect_finish_sealant': dict(kind='addon', price=None, dur=30, pct=Decimal('2.5'), needs='exterior', typed=True),
    'steam_cleaning': dict(kind='addon', price=4999, dur=30, pct=Decimal('2.5'), needs='interior'),
    'cond_pet_hair': dict(kind='addon', price=1500, dur=0, pct=Decimal('2.5'), needs='interior'),
    'cond_dirt_sand': dict(kind='addon', price=1000, dur=0, pct=Decimal('2.5'), needs='interior'),
    'cond_spills': dict(kind='addon', price=1000, dur=0, pct=Decimal('2.5'), needs='interior'),
    'cond_heavy_stains': dict(kind='addon', price=3000, dur=0, pct=Decimal('2.5'), needs='interior'),
}
FEE = {'pet_hair': 'cond_pet_hair', 'dirt_sand': 'cond_dirt_sand', 'spills': 'cond_spills', 'heavy_stains': 'cond_heavy_stains'}
INCLUDES = {'int_deluxe': {'steam_cleaning', 'cond_pet_hair', 'cond_dirt_sand', 'cond_spills'},
            'full_detail': {'steam_cleaning', 'cond_pet_hair', 'cond_dirt_sand', 'cond_spills'}}
BUNDLE_ORDER = ['signature_combo', 'full_detail']
SEALANT = {'sedan': 4499, 'coupe': 4499, 'crossover': 5499, 'suv': 5499, 'minivan': 5499,
           'truck': 6499, 'large_suv': 6499}

# The dimensions, in the order the SQL below unnests them.
LOCS = ['shop', 'mobile']
MAINS = [('signature_combo', None, None), ('full_detail', None, None),
         (None, 'ext_basic', None), (None, 'ext_deluxe', None),
         (None, None, 'int_basic'), (None, None, 'int_deluxe'),
         (None, 'ext_basic', 'int_basic'), (None, 'ext_basic', 'int_deluxe'),
         (None, 'ext_deluxe', 'int_basic'), (None, 'ext_deluxe', 'int_deluxe')]
ADDONS = [[], ['steam_cleaning'], ['perfect_finish_sealant'], ['steam_cleaning', 'perfect_finish_sealant']]
CONDS = [[], ['none'], ['other'], ['pet_hair'], ['heavy_stains'], ['pet_hair', 'dirt_sand', 'spills'],
         ['pet_hair', 'dirt_sand', 'spills', 'heavy_stains', 'other']]
TYPES = ['sedan', 'truck', 'van']
SIZES = ['standard', 'xl']


def mob(price, pct):
    return int((Decimal(price) * pct / Decimal(100)).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def quote(loc, bundle, ext, intr, addons, conds, vtype, size):
    mobile = loc == 'mobile'
    mains, kinds = [], []
    value = savings = mobile_total = minutes = 0
    if bundle:
        b = SVC[bundle]
        parts_value = sum(SVC[p]['price'] for p in b['parts'])
        mains = b['parts'] + [bundle]
        kinds = [SVC[p]['kind'] for p in b['parts']] + ['bundle']
        value += max(parts_value, b['price'])
        savings += max(parts_value - b['price'], 0)
        mobile_total += mob(b['price'], b['pct']) if mobile else 0
        minutes += b['dur']
    else:
        for code in (ext, intr):
            if code:
                s = SVC[code]
                mains.append(code)
                kinds.append(s['kind'])
                value += s['price']
                mobile_total += mob(s['price'], s['pct']) if mobile else 0
                minutes += s['dur']
    included = set()
    for m in mains:
        included |= INCLUDES.get(m, set())
    pending = set()
    for a in addons:
        if a in included:
            continue
        s = SVC[a]
        if s['needs'] not in kinds:
            return 'invalid_input'
        if s.get('typed'):
            price = SEALANT.get(vtype)
            if price is None:
                pending.add('vehicle_price')
        else:
            price = s['price']
        value += price or 0
        mobile_total += mob(price, s['pct']) if (mobile and price is not None) else 0
        minutes += s['dur']
    fees = [FEE[c] for c in conds if c in FEE]
    if fees and 'interior' not in kinds:
        return 'invalid_input'
    for f in fees:
        if f in included:
            continue
        s = SVC[f]
        value += s['price']
        mobile_total += mob(s['price'], s['pct']) if mobile else 0
    if size == 'xl':
        pending.add('xl')
    total = None if pending else value - savings + mobile_total
    saves = ''
    if not bundle and ext and intr:
        for code in BUNDLE_ORDER:
            if sorted(SVC[code]['parts']) == sorted([ext, intr]):
                other = quote(loc, code, None, None, addons, conds, vtype, size)
                if other != 'invalid_input':
                    here = value - savings + mobile_total
                    there = other['value'] - other['savings'] + other['mobile']
                    if there < here:
                        saves = str(here - there)
                break
    return {'value': value, 'savings': savings, 'mobile': mobile_total, 'total': total, 'minutes': minutes, 'saves': saves}


def fmt(r):
    if r == 'invalid_input':
        return r
    return f"{'' if r['total'] is None else r['total']}|{r['mobile']}|{r['minutes']}|{r['saves']}"


expected = []
for loc in LOCS:
    for bundle, ext, intr in MAINS:
        for addons in ADDONS:
            for conds in CONDS:
                for vtype in TYPES:
                    for size in SIZES:
                        expected.append(fmt(quote(loc, bundle, ext, intr, addons, conds, vtype, size)))

n = len(expected)
arr = '{' + ','.join('"' + e + '"' for e in expected) + '}'
sql = f"""-- Migration 002 price matrix: {n} combinations, generated by gen_pricing_matrix_m002.py
-- from an independent model of the owner's rules. The inputs are built here in
-- the generator's order; only the expected results are listed.
reset role;
create or replace function tst.quote_short(p jsonb) returns text
language plpgsql as $$
declare q jsonb; v_state text; v_msg text;
begin
  q := public.quote_booking(p);
  return coalesce(q ->> 'total_cents', '') || '|' || (q ->> 'mobile_cents') || '|' || (q ->> 'duration_min') || '|'
         || coalesce(q -> 'suggestion' ->> 'saves_cents', '');
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  return case when v_state = 'P0001' then v_msg else v_state end;
end $$;
grant execute on function tst.quote_short(jsonb) to anon;

create temp table m002_expected as
select ord, val from unnest('{arr}'::text[]) with ordinality as e(val, ord);

set role anon;
create temp table m002_matrix as
select row_number() over (order by l.i, m.j, a.k, c.m, t.n, z.o) as ord,
       jsonb_strip_nulls(jsonb_build_object(
         'location_type', l.loc, 'bundle', m.bundle, 'exterior', m.ext, 'interior', m.intr,
         'addons', a.addons, 'conditions', c.conds, 'vehicle_type', t.vtype, 'vehicle_size', z.size)) as input
from unnest(array['shop','mobile']) with ordinality as l(loc, i)
cross join (values
  (1, 'signature_combo', null, null), (2, 'full_detail', null, null),
  (3, null, 'ext_basic', null), (4, null, 'ext_deluxe', null),
  (5, null, null, 'int_basic'), (6, null, null, 'int_deluxe'),
  (7, null, 'ext_basic', 'int_basic'), (8, null, 'ext_basic', 'int_deluxe'),
  (9, null, 'ext_deluxe', 'int_basic'), (10, null, 'ext_deluxe', 'int_deluxe')) as m(j, bundle, ext, intr)
cross join (values
  (1, '[]'::jsonb), (2, '["steam_cleaning"]'), (3, '["perfect_finish_sealant"]'), (4, '["steam_cleaning","perfect_finish_sealant"]')) as a(k, addons)
cross join (values
  (1, '[]'::jsonb), (2, '["none"]'), (3, '["other"]'), (4, '["pet_hair"]'), (5, '["heavy_stains"]'),
  (6, '["pet_hair","dirt_sand","spills"]'), (7, '["pet_hair","dirt_sand","spills","heavy_stains","other"]')) as c(m, conds)
cross join unnest(array['sedan','truck','van']) with ordinality as t(vtype, n)
cross join unnest(array['standard','xl']) with ordinality as z(size, o);

create temp table m002_result as
select x.ord, x.input, e.val as expected, tst.quote_short(x.input) as got
from m002_matrix x join m002_expected e using (ord);
reset role;
select tst.eq((select count(*)::text from m002_result), '{n}', 'm002 pricing: every combination quoted');
select tst.eq((select count(*)::text from m002_result where got is distinct from expected), '0', 'm002 pricing: every combination matches the owner''s rules');
select tst.ok(false, 'm002 pricing mismatch', input::text || ' got ' || got || ' want ' || expected)
from m002_result where got is distinct from expected order by ord limit 20;
select tst.ok((select count(*) > 0 from m002_result where got = 'invalid_input'), 'm002 pricing: impossible combinations refused');
drop table m002_result; drop table m002_matrix; drop table m002_expected;
"""
Path(__file__).with_name('m002_tests_pricing.sql').write_text(sql)
print(n, 'quotes;', sum(1 for e in expected if e == 'invalid_input'), 'expected errors;', len(sql) // 1024, 'KB')
