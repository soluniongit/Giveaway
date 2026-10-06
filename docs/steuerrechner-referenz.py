"""Reference implementation of the algorithms documented in tariffs.json."""
import json
import math


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def floor100(x):
    return math.floor(x / 100.0) * 100


# ------------------------------------------------------------ federal
def federal_tax(T, y, married=False, children=0, round100=True):
    fed = T["federal"]
    tbl = fed["married" if married else "single"]
    if round100:
        y = floor100(y)
    if y >= tbl["flat_rate_threshold"]:
        tax = y * tbl["flat_rate_percent_on_total_income"] / 100.0
    else:
        row = None
        for r in tbl["brackets"]:
            if r["from_income"] <= y:
                row = r
        steps = math.floor((y - row["from_income"]) / 100.0)
        tax = row["base_tax_at_from"] + steps * row["chf_per_100_above"]
        # special point just below flat threshold (793'900 / 941'300) is covered by the formula
    tax = max(0.0, tax - children * fed["child_tax_credit_per_child_chf"])
    if tax < fed["minimum_tax_chf"]:
        tax = 0.0
    return round(tax, 2)


# ------------------------------------------------------------ generic step tariff
def step_tax(steps, x, top_rate=None):
    t = 0.0
    lo = 0
    for s in steps:
        w, r = s["width"], s["rate_percent"]
        hi = lo + w
        if x > lo:
            t += (min(x, hi) - lo) * r / 100.0
        lo = hi
    if top_rate is not None and x > lo:
        t += (x - lo) * top_rate / 100.0
    return t


def zh_simple(C, y, married):
    tar = C["tariffs"]["married" if married else "single"]
    return step_tax(tar["steps"], y, tar["top"]["rate_percent"])


def sz_T36(C, x):
    t = C["tariffs"]["base_36"]
    if x > t["above_rule"]["from_income_exclusive"]:
        return x * t["above_rule"]["flat_rate_percent_on_total_income"] / 100.0
    return step_tax(t["steps"], x)


def sz_T36a(C, x):
    t36 = C["tariffs"]["base_36"]
    a = C["tariffs"]["canton_36a"]
    if x > a["above_rule"]["from_income_exclusive"]:
        return x * a["above_rule"]["flat_rate_percent_on_total_income"] / 100.0
    if x <= t36["above_rule"]["from_income_exclusive"]:
        return step_tax(t36["steps"], x)
    st = a["additional_step"]
    return st["base_tax_at_from"] + (x - st["from_income"]) * st["rate_percent"] / 100.0


def sz_simple(C, y, married, divisor_round=True):
    if not married:
        return sz_T36(C, y), sz_T36a(C, y)
    q = y / 1.9
    if divisor_round:
        q = floor100(q)  # ESTV practice: rate-determining income floored to CHF 100
    if q <= 0:
        return 0.0, 0.0
    return y * sz_T36(C, q) / q, y * sz_T36a(C, q) / q


def zg_simple(C, y, married):
    tar = C["tariffs"]["married" if married else "single"]
    return step_tax(tar["steps"], y, tar["top"]["rate_percent"])


def sg_T(C, x):
    t = C["tariffs"]["single"]
    if x > t["above_rule"]["from_income_exclusive"]:
        return x * t["above_rule"]["flat_rate_percent_on_total_income"] / 100.0
    return step_tax(t["steps"], x)


def round_05(v):
    return math.floor(v * 20 + 0.5) / 20.0


def sg_simple(C, y, married):
    if not married:
        return sg_T(C, y)
    q = floor100(y / 2.0)  # official SG Tarif 2026: half income floored to CHF 100
    if q <= 0:
        return 0.0
    return round_05(y * sg_T(C, q) / q)  # official table: rounded to 5 Rappen


def cantonal_tax(T, canton, muni, y, married, round100=True, sz_divisor_round=True):
    C = T["cantons"][canton]
    M = C["municipalities"][muni]
    if round100:
        y = floor100(y)
    out = {}
    if canton == "ZH":
        es = zh_simple(C, y, married)
        out["simple"] = es
        out["canton"] = es * C["canton_multiplier_percent"] / 100
        out["municipality"] = es * M["municipal_multiplier_percent"] / 100
        out["personal"] = C["personal_tax"]["chf_per_person"] * (2 if married else 1)
    elif canton == "SZ":
        es_l, es_k = sz_simple(C, y, married, sz_divisor_round)
        out["simple"] = es_l
        out["simple_canton"] = es_k
        out["canton"] = es_k * C["canton_multiplier_percent"] / 100
        out["district"] = es_l * M["district_multiplier_percent"] / 100
        out["municipality"] = es_l * M["municipal_multiplier_percent"] / 100
    elif canton == "ZG":
        es = zg_simple(C, y, married)
        out["simple"] = es
        out["canton"] = es * C["canton_multiplier_percent"] / 100
        out["municipality"] = es * M["municipal_multiplier_percent"] / 100
    elif canton == "SG":
        es = sg_simple(C, y, married)
        out["simple"] = es
        out["canton"] = es * C["canton_multiplier_percent"] / 100
        out["municipality"] = es * M["municipal_multiplier_percent"] / 100
    out["total_cantonal_local"] = sum(v for k, v in out.items() if k in ("canton", "district", "municipality", "personal"))
    return {k: round(v, 2) for k, v in out.items()}
