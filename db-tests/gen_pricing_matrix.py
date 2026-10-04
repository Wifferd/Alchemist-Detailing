#!/usr/bin/env python3
"""Builds tests/m001_tests_pricing.sql: every menu combination, mobile and not,
priced by an independent model of the owner's rules, compared with
quote_booking. Rules (decided Oct 3, 2026):
  * a bundle replaces its parts at the bundle price; the difference is the saving
  * mobile adds each line's percentage, rounded half up to the cent
    (2.5% Basic services and add-ons, 7% Deluxe services and both bundles)
  * Interior Deluxe includes steam (also inside the Full Detail Bundle)
  * the sealant needs an exterior service and is priced by vehicle type
  * XL, heavy stains, or a sealant with no price for the vehicle: no total
For the test only, Steam gets 30 minutes and the Sealant 45 (they have none yet).
"""
import itertools
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
    'perfect_finish_sealant': dict(kind='addon', price=None, dur=45, pct=Decimal('2.5'), needs='exterior', typed=True),
    'steam_cleaning': dict(kind='addon', price=4999, dur=30, pct=Decimal('2.5'), needs='any_main'),
}
INCLUDES = {'int_deluxe': {'steam_cleaning'}}
BUNDLE_ORDER = ['signature_combo', 'full_detail']
SEALANT = {'sedan': 4499, 'coupe': 4499, 'crossover': 5499, 'suv': 5499, 'minivan': 5499,
           'truck': 6499, 'large_suv': 6499}
TYPES = ['sedan', 'coupe', 'convertible', 'crossover', 'suv', 'minivan', 'truck', 'large_suv', 'van', 'other']


def mob(price, pct):
    return int((Decimal(price) * pct / Decimal(100)).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def quote(loc, bundle, ext, intr, addons, vtype, size, not_sure, stains):
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
    if not mains:
        return {'error': 'invalid_input'}
    included = set()
    for m in mains:
        included |= INCLUDES.get(m, set())
    pending = set()
    for a in sorted(set(addons)):
        if a in included:
            continue
        s = SVC[a]
        if s['needs'] in ('exterior', 'interior') and s['needs'] not in kinds:
            return {'error': 'invalid_input'}
        if s.get('typed'):
            price = None if (not_sure or vtype is None) else SEALANT.get(vtype)
            if price is None:
                pending.add('vehicle_price')
        else:
            price = s['price']
        value += price or 0
        mobile_total += mob(price, s['pct']) if (mobile and price is not None) else 0
        minutes += s['dur']
    if size == 'xl':
        pending.add('xl')
    if 'heavy' in stains:
        pending.add('stains')
    total = None if pending else value - savings + mobile_total
    result = {'value_cents': value, 'bundle_savings_cents': savings, 'mobile_cents': mobile_total,
              'total_cents': total, 'duration_min': minutes, 'pending_reasons': sorted(pending),
              'suggestion': None}
    # Round 8: when the chosen exterior and interior services make up a
    # bundle that costs less (mobile included), recommend it; never switch.
    if not bundle and ext and intr:
        for code in BUNDLE_ORDER:
            if sorted(SVC[code]['parts']) == sorted([ext, intr]):
                other = quote(loc, code, None, None, addons, vtype, size, not_sure, stains)
                here = value - savings + mobile_total
                there = other['value_cents'] - other['bundle_savings_cents'] + other['mobile_cents']
                if there < here:
                    result['suggestion'] = {'bundle': code, 'saves_cents': here - there}
                break
    return result


MAINS = [('signature_combo', None, None), ('full_detail', None, None),
         (None, 'ext_basic', None), (None, 'ext_deluxe', None),
         (None, None, 'int_basic'), (None, None, 'int_deluxe'),
         (None, 'ext_basic', 'int_basic'), (None, 'ext_basic', 'int_deluxe'),
         (None, 'ext_deluxe', 'int_basic'), (None, 'ext_deluxe', 'int_deluxe')]
ADDONS = [[], ['steam_cleaning'], ['perfect_finish_sealant'], ['steam_cleaning', 'perfect_finish_sealant']]
STAINS = [[], ['light'], ['heavy'], ['heavy', 'pet']]

rows = []
for loc, (bundle, ext, intr), addons, vtype, size, stains in itertools.product(
        ['shop', 'mobile'], MAINS, ADDONS, TYPES, ['standard', 'xl'], STAINS):
    rows.append((loc, bundle, ext, intr, addons, vtype, size, False, stains))
# "Not sure" vehicles (no type) with and without the sealant.
for loc, (bundle, ext, intr), addons in itertools.product(['shop', 'mobile'], MAINS, ADDONS):
    rows.append((loc, bundle, ext, intr, addons, None, 'standard', True, []))


def lit(v):
    if v is None:
        return 'null'
    return "'" + str(v).replace("'", "''") + "'"


values = []
for loc, bundle, ext, intr, addons, vtype, size, not_sure, stains in rows:
    inp = {'location_type': loc, 'bundle': bundle, 'exterior': ext, 'interior': intr, 'addons': addons,
           'vehicle_type': vtype, 'vehicle_size': size, 'not_sure': not_sure, 'stains': stains}
    exp = quote(loc, bundle, ext, intr, addons, vtype, size, not_sure, stains)
    values.append(f"({lit(json.dumps(inp))}::jsonb, {lit(json.dumps(exp, sort_keys=True))}::jsonb)")

sql = f"""-- W-16: every menu combination priced, mobile and not ({len(rows)} quotes).
-- Generated by tests/gen_pricing_matrix.py from an independent model of the
-- owner's price rules. Steam and Sealant get test minutes for this check only.
reset role;
update public.services set duration_min = 30 where code = 'steam_cleaning';
update public.services set duration_min = 45 where code = 'perfect_finish_sealant';

create function tst.quote_or_error(p jsonb) returns jsonb
language plpgsql as $$
declare v_state text; v_msg text;
begin
  return public.quote_booking(p);
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  return jsonb_build_object('error', case when v_state = 'P0001' then v_msg else v_state end);
end
$$;
grant execute on function tst.quote_or_error(jsonb) to anon;

create table tst.pricing (input jsonb, expected jsonb);
insert into tst.pricing (input, expected) values
{',\n'.join(values)};
grant select on tst.pricing to anon;

set role anon;
create temp table pricing_result as
select p.input, p.expected,
       case when q ? 'error' then jsonb_build_object('error', q ->> 'error')
            else jsonb_build_object('value_cents', q -> 'value_cents', 'bundle_savings_cents', q -> 'bundle_savings_cents',
                                    'mobile_cents', q -> 'mobile_cents', 'total_cents', q -> 'total_cents',
                                    'duration_min', q -> 'duration_min', 'pending_reasons', q -> 'pending_reasons',
                                    'suggestion', case when jsonb_typeof(q -> 'suggestion') = 'object'
                                                       then jsonb_build_object('bundle', q -> 'suggestion' -> 'bundle',
                                                                               'saves_cents', q -> 'suggestion' -> 'saves_cents')
                                                       else 'null'::jsonb end) end as got
from tst.pricing p, lateral tst.quote_or_error(p.input) as q;
select tst.eq((select count(*)::text from pricing_result), '{len(rows)}', 'pricing: every combination quoted');
select tst.eq((select count(*)::text from pricing_result where got is distinct from expected), '0', 'pricing: every combination matches the owner''s rules');
select tst.ok(false, 'pricing mismatch', input::text || ' got ' || got::text || ' want ' || expected::text)
from pricing_result where got is distinct from expected limit 20;
select tst.ok((select count(*) > 0 from pricing_result where got ? 'error'), 'pricing: impossible combinations refused (sealant without an exterior service)');
select tst.ok((select bool_and((got ->> 'total_cents')::int = (got ->> 'value_cents')::int - (got ->> 'bundle_savings_cents')::int + (got ->> 'mobile_cents')::int)
               from pricing_result where got ->> 'total_cents' is not null), 'pricing: total = value - savings + mobile');
select tst.eq((select count(*)::text from pricing_result where jsonb_typeof(got -> 'suggestion') = 'object'),
              (select count(*)::text from pricing_result where jsonb_typeof(expected -> 'suggestion') = 'object'),
              'pricing: the cheaper bundle is recommended whenever the chosen services make one up');
select tst.ok((select count(*) > 0 from pricing_result where jsonb_typeof(got -> 'suggestion') = 'object'), 'pricing: recommendations exist in the matrix');
reset role;
drop table pricing_result;
update public.services set duration_min = null where code in ('steam_cleaning', 'perfect_finish_sealant');
"""
Path(__file__).with_name('m001_tests_pricing.sql').write_text(sql)
print(len(rows), 'quotes;', sum(1 for r in rows if 'error' in quote(*r)), 'expected errors')
