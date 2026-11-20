#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VORQON — إصلاح أسعار الكتالوج وأسمائه من نطاقات v2 (إعادة تسعير في المكان).

لماذا: كتالوج الريبو حُوّل من CSV الذي ولّده v1، فورث مرضَي v1:
  (1) السعر كان عشوائياً داخل نطاق القسم كله (ماوس ألعاب بـ24,777 جنيهاً،
      وحقيبة لابتوب بـ24,855، بينما مكسرات 1 كجم بـ18 ولبن بودرة بـ17).
  (2) السمة كانت تُسحب من مجمع سمات القسم كله («Gaming Mouse 24 inch»،
      و«Pasta 900 ml»).
هذا السكربت يعيد تسعير المنتجات الـ10000 الموجودة في مكانها — بلا إعادة
توليد للكتالوج وبلا تغيير في الـSKU — بنفس أسلوب إصلاحَي المتجر الحي في
18 و19 نوفمبر 2026: السعر من نطاق (النوع، الحجم) في جدول v2
(generate_catalog.py — TYPE_TABLE، المستخرج من أسعار المتجر الحي المصححة
شاملة زيادة الـ5%)، والسمة غير المسموحة لنوعها تُحذف من الاسمين.

يولّد catalog-prices.sql (معاملة واحدة، idempotent):
  (أ) UPDATE للسعر (+ سعر المقارنة بنفس نسبة الخصم القديمة) لكل منتج،
      بمفتاح SKU وبشرط IS DISTINCT FROM — والسعر الجديد نقطة حتمية داخل
      النطاق مشتقة من hash ثابت للـSKU، فإعادة التشغيل تنتج الملف نفسه
      حرفياً.
  (ب) UPDATE للأسماء المنظّفة فقط: حذف السمة الخاطئة من name_ar/name_en،
      وإعادة توليد الـslug من الاسم الإنجليزي النظيف (فريد دائماً؛ عند
      التصادم تُضاف لاحقة الـSKU كما في convert_catalog.py)، وتحديث
      الوصفين بنفس قالب المتجر الرئيسي بالاسم النظيف (الوصف الحالي يضمّن
      الاسم القديم بالسمة الخاطئة).
  (ج) صف الحارس catalog_fixups('prices-v2') في نهاية المعاملة — يقرأه
      bootstrap-db.js فلا يُطبَّق الملف إلا مرة واحدة.

بوابات سلامة داخلية: إن فشلت أي بوابة يخرج السكربت بخطأ ولا يكتب SQL:
  - كل سعر جديد داخل نطاق (نوعه، حجمه)؛
  - أغلى كابل شحن ≤ 400؛ أغلى خل أبيض ≤ 60؛ أغلى ماوس ألعاب ≤ 3,000؛
    أرخص مكسرات مشكلة ≥ 150؛ أرخص لبن بودرة ≥ 80؛ أغلى حقيبة لابتوب ≤ 2,500.

مطابقة المنتج → النوع: نفس أسلوب generate_catalog_images.py (وهو أسلوب
assignCatalogImages في المتجر الرئيسي): داخل قسم المنتج، الأنواع مرتبة
بتنازلي طول الاسم الإنجليزي، وأول نوع يظهر اسمه في name_en هو المطابق —
مع تحقق متقاطع للاسم العربي. تحليل السمة: اسم v1 مبني دائماً بصيغة
«النوع + العلامة + سمة واحدة» (+ لاحقة «— تشكيلة N» عند التكرار)، فالسمة
هي ما يتبقى بعد حذف اللاحقة والعلامة والنوع من الاسمين.

التشغيل:  python3 generate_catalog_prices.py
الناتج:   catalog-prices.sql  بجانب هذا السكربت.
"""
import csv
import hashlib
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
CSV_PATH = HERE / "products-10000.csv"
REPO_SQL_PATH = HERE / "catalog-repo.sql"
OUT_PATH = HERE / "catalog-prices.sql"

sys.path.insert(0, str(HERE))
from generate_catalog import CATEGORIES, TYPE_TABLE, BRANDS  # noqa: E402  (v2)

VAR_EN = re.compile(r"\s*—\s*Variant\s*(\d+)\s*$")
VAR_AR = re.compile(r"\s*—\s*تشكيلة\s*(\d+)\s*$")
CHUNK = 500


def sql_str(value) -> str:
    if value is None or value == "":
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def slugify(text: str) -> str:
    # نفس دالة convert_catalog.py حرفياً
    s = text.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def load_current_slugs() -> dict:
    """sku -> slug الحالي في قاعدة البيانات، من catalog-repo.sql (مصدر الزرع الفعلي)."""
    def parse_tuple(line: str):
        fields, cur, i, inq = [], [], 1, False
        while i < len(line):
            ch = line[i]
            if inq:
                cur.append(ch)
                if ch == "'":
                    if i + 1 < len(line) and line[i + 1] == "'":
                        cur.append("'")
                        i += 2
                        continue
                    inq = False
                i += 1
                continue
            if ch == "'":
                inq = True
                cur.append(ch)
                i += 1
                continue
            if ch == ",":
                fields.append("".join(cur).strip())
                cur = []
                i += 1
                continue
            if ch == ")":
                fields.append("".join(cur).strip())
                break
            cur.append(ch)
            i += 1
        return fields

    def unq(f: str):
        if f == "NULL":
            return None
        return f[1:-1].replace("''", "'")

    pairs, in_products = {}, False
    for line in REPO_SQL_PATH.read_text(encoding="utf-8").splitlines():
        if line.startswith("INSERT INTO products"):
            in_products = True
            continue
        if in_products and line.startswith("('"):
            f = parse_tuple(line.rstrip().rstrip(",").rstrip(";"))
            pairs[unq(f[5])] = unq(f[8])  # sku, slug
        elif in_products and line.strip() == ";":
            in_products = False
    return pairs


def price_point(sku: str, pmin: int, pmax: int) -> int:
    """نقطة حتمية داخل [pmin, pmax] من hash ثابت للـSKU — إعادة التشغيل متطابقة."""
    h = int.from_bytes(hashlib.sha256(sku.encode("utf-8")).digest()[:8], "big")
    return pmin + h % (pmax - pmin + 1)


def main() -> int:
    brand_ar_by_en = {en: ar for ar, en in BRANDS}

    # الأنواع لكل قسم مرتبة بتنازلي طول الاسم الإنجليزي (أسلوب المتجر الرئيسي)
    bases_by_slug = {}
    for slug, _count, bases in CATEGORIES:
        bases_by_slug[slug] = sorted(bases, key=lambda b: -len(b[1]))

    # جدول الأنواع: (slug, base_en) -> (base_ar, {attr_en: (attr_ar, pmin, pmax)}, نطاق النوع الكلي)
    type_info = {}
    for slug, _count, bases in CATEGORIES:
        for base_ar, base_en in bases:
            _cat, ben, attrs = TYPE_TABLE[base_ar]
            assert ben == base_en, (base_ar, ben, base_en)
            by_en = {v[0]: (k, v[1], v[2]) for k, v in attrs.items()}
            full = (min(v[1] for v in attrs.values()), max(v[2] for v in attrs.values()))
            type_info[(slug, base_en)] = (base_ar, by_en, attrs, full)
    print(f"types           : {len(type_info)}")
    assert len(type_info) == 210

    current_slugs = load_current_slugs()
    print(f"current slugs   : {len(current_slugs)} (unique: {len(set(current_slugs.values()))})")
    assert len(current_slugs) == 10000 and len(set(current_slugs.values())) == 10000

    rows = list(csv.DictReader(CSV_PATH.open(encoding="utf-8")))
    print(f"csv products    : {len(rows)}")
    assert len(rows) == 10000

    # ---------------------------------------------------------------- التحليل وإعادة التسعير
    used_slugs = set(current_slugs.values())
    results = []            # dict لكل منتج بكل القيم الجديدة
    anomalies = []
    fallback_skus = []      # بلا دلو '' بعد التنظيف/الغياب — نطاق النوع الكلي
    cleaned_examples = []

    for r in rows:
        sku, slug = r["sku"], r["category_slug"]
        name_en, name_ar, brand_en = r["name_en"], r["name_ar"], r["brand"]
        brand_ar = brand_ar_by_en.get(brand_en)
        old_price = int(r["price_egp"])
        old_compare = int(r["compare_at_egp"]) if r["compare_at_egp"] else None

        # مطابقة النوع (نفس منطق generate_catalog_images.py)
        hits = [b for b in bases_by_slug[slug] if b[1] in name_en]
        if not hits or brand_ar is None:
            anomalies.append((sku, "type/brand", name_en))
            continue
        base_ar, base_en = hits[0]
        if base_ar not in name_ar:
            anomalies.append((sku, "ar-base", name_ar))
            continue
        _bar, by_en, attrs, full_range = type_info[(slug, base_en)]

        # تحليل السمة الإنجليزية: [لاحقة تشكيلة] + «علامة نوع سمة»
        m_en = VAR_EN.search(name_en)
        var_en = m_en.group(1) if m_en else None
        en_core = VAR_EN.sub("", name_en)
        if not en_core.startswith(brand_en + " "):
            anomalies.append((sku, "en-brand", name_en))
            continue
        en_rest = en_core[len(brand_en) + 1:]
        if not en_rest.startswith(base_en):
            anomalies.append((sku, "en-base", name_en))
            continue
        attr_en = en_rest[len(base_en):].strip()

        # تحليل السمة العربية: «نوع علامة سمة» + [لاحقة تشكيلة]
        m_ar = VAR_AR.search(name_ar)
        var_ar = m_ar.group(1) if m_ar else None
        ar_core = VAR_AR.sub("", name_ar)
        if not ar_core.startswith(base_ar + " "):
            anomalies.append((sku, "ar-base", name_ar))
            continue
        ar_rest = ar_core[len(base_ar) + 1:]
        if ar_rest == brand_ar:
            attr_ar = ""
        elif ar_rest.startswith(brand_ar + " "):
            attr_ar = ar_rest[len(brand_ar) + 1:].strip()
        else:
            anomalies.append((sku, "ar-brand", name_ar))
            continue
        if (var_en is None) != (var_ar is None) or (var_en is not None and var_en != var_ar):
            anomalies.append((sku, "variant-mismatch", name_en + " || " + name_ar))
            continue

        # الدلو: سمة مسموحة لنوعها، وإلا تنظيف + دلو الأساس/الافتراضي
        cleaned = False
        new_name_en, new_name_ar = name_en, name_ar
        if attr_en and attr_en in by_en:
            exp_ar, pmin, pmax = by_en[attr_en]
            if exp_ar != attr_ar:
                anomalies.append((sku, "attr-pair", f"{attr_en} / {attr_ar} != {exp_ar}"))
                continue
            bucket = attr_en
        else:
            if attr_en:  # سمة موجودة لكنها غير مسموحة لهذا النوع
                cleaned = True
                new_name_en = f"{brand_en} {base_en}" + (f" — Variant {var_en}" if var_en else "")
                new_name_ar = f"{base_ar} {brand_ar}" + (f" — تشكيلة {var_ar}" if var_ar else "")
            if "" in attrs:
                pmin, pmax = attrs[""][1], attrs[""][2]
                bucket = "(base)"
            else:
                pmin, pmax = full_range
                bucket = "(type-range fallback)"
                fallback_skus.append(sku)

        new_price = price_point(sku, pmin, pmax)
        new_compare = None
        if old_compare is not None:
            new_compare = int(round(new_price * old_compare / old_price))
            assert new_compare >= new_price, (sku, new_price, new_compare, old_price, old_compare)

        # الـslug للمنظّفة فقط (نفس خوارزمية convert_catalog.py)
        new_slug = None
        if cleaned:
            old_slug = current_slugs[sku]
            used_slugs.discard(old_slug)
            base_slug = slugify(new_name_en) or "product"
            cand = base_slug[:290]
            if cand in used_slugs:
                cand = base_slug[:280] + "-" + sku.lower()
            if cand in used_slugs:
                cand = cand + "-" + str(len(used_slugs))
            new_slug = cand[:320]
            used_slugs.add(new_slug)
            if len(cleaned_examples) < 10:
                cleaned_examples.append((sku, name_en, new_name_en, name_ar, new_name_ar))

        results.append({
            "sku": sku, "slug_cat": slug, "base_en": base_en, "bucket": bucket,
            "pmin": pmin, "pmax": pmax,
            "old_price": old_price, "new_price": new_price,
            "old_compare": old_compare, "new_compare": new_compare,
            "cleaned": cleaned, "old_name_en": name_en, "new_name_en": new_name_en,
            "old_name_ar": name_ar, "new_name_ar": new_name_ar,
            "old_slug": current_slugs[sku], "new_slug": new_slug,
            "brand_en": brand_en, "brand_ar": brand_ar,
        })

    print(f"parsed          : {len(results)}")
    print(f"anomalies       : {len(anomalies)} {anomalies[:5]}")
    if anomalies or len(results) != 10000:
        print("!! التحليل غير نظيف — رفض إصدار SQL")
        return 1

    repriced = sum(1 for x in results if x["new_price"] != x["old_price"])
    cleaned = [x for x in results if x["cleaned"]]
    slug_changed = [x for x in cleaned if x["new_slug"] != x["old_slug"]]
    with_compare = [x for x in results if x["new_compare"] is not None]
    print(f"repriced (price actually changes): {repriced}")
    print(f"names cleaned   : {len(cleaned)}")
    print(f"slugs changed   : {len(slug_changed)}")
    print(f"size fallback   : {len(fallback_skus)} {fallback_skus[:10]}")
    print(f"compare preserved: {len(with_compare)}")

    # ---------------------------------------------------------------- بوابات السلامة
    gates = []
    for x in results:
        assert x["pmin"] <= x["new_price"] <= x["pmax"], x
    gates.append(("every (type,size) price inside its range", True))

    def type_max(base_en):
        return max(x["new_price"] for x in results if x["base_en"] == base_en)

    def type_min(base_en):
        return min(x["new_price"] for x in results if x["base_en"] == base_en)

    gate_defs = [
        ("Charging Cable max <= 400", type_max("Charging Cable") <= 400, type_max("Charging Cable")),
        ("White Vinegar max <= 60", type_max("White Vinegar") <= 60, type_max("White Vinegar")),
        ("Gaming Mouse max <= 3000", type_max("Gaming Mouse") <= 3000, type_max("Gaming Mouse")),
        ("Mixed Nuts min >= 150", type_min("Mixed Nuts") >= 150, type_min("Mixed Nuts")),
        ("Powdered Milk min >= 80", type_min("Powdered Milk") >= 80, type_min("Powdered Milk")),
        ("Laptop Bag max <= 2500", type_max("Laptop Bag") <= 2500, type_max("Laptop Bag")),
    ]
    for label, ok, val in gate_defs:
        gates.append((f"{label} (actual: {val})", ok))
    print("\nsanity gates:")
    for label, ok in gates:
        print(f"  [{'OK' if ok else 'FAIL'}] {label}")
    if not all(ok for _l, ok in gates):
        print("!! فشلت بوابة سلامة — رفض إصدار SQL")
        return 1

    # ---------------------------------------------------------------- تقارير قبل/بعد
    def deviation(x):
        if x["old_price"] > x["pmax"]:
            return (x["old_price"] - x["pmax"]) / x["pmax"]
        if x["old_price"] < x["pmin"]:
            return (x["pmin"] - x["old_price"]) / x["pmin"]
        return 0.0

    worst = sorted(results, key=lambda x: (-deviation(x), x["sku"]))[:15]
    print("\n15 worst offenders (old -> new):")
    print(f"  {'SKU':<11} {'type':<22} {'bucket':<24} {'old':>7} {'new':>7}")
    for x in worst:
        print(f"  {x['sku']:<11} {x['base_en']:<22} {x['bucket']:<24} {x['old_price']:>7} {x['new_price']:>7}")

    print("\nper-category min/max (before -> after):")
    cat_order = [c[0] for c in CATEGORIES]
    for cat in cat_order:
        xs = [x for x in results if x["slug_cat"] == cat]
        print(f"  {cat:<12} n={len(xs):<5} price {min(x['old_price'] for x in xs)}-{max(x['old_price'] for x in xs)}"
              f" -> {min(x['new_price'] for x in xs)}-{max(x['new_price'] for x in xs)}")

    print("\nname-cleaning examples (before -> after):")
    for sku, oen, nen, oar, nar in cleaned_examples:
        print(f"  {sku}: {oen}  ->  {nen}")
        print(f"  {' ' * len(sku)}  {oar}  ->  {nar}")

    # ---------------------------------------------------------------- بناء SQL
    out = []
    out.append("-- VORQON — إصلاح أسعار v2 وأسماء الكتالوج (يُطبَّق مرة واحدة من bootstrap-db.js، محروس بصف catalog_fixups 'prices-v2')")
    out.append("-- Re-pricing from generate_catalog.py (v2) per-(type, size) ranges extracted from the")
    out.append("-- corrected live store (incl. the +5% increase): every price is a deterministic")
    out.append("-- hash-of-SKU point inside its type/size range; compare-at keeps its old discount ratio;")
    out.append("-- names carrying an attribute that v2 does not allow for their type are cleaned in both")
    out.append("-- languages, their slugs regenerated, and their template descriptions rebuilt from the")
    out.append("-- cleaned names. UPDATEs are keyed by SKU and guarded by IS DISTINCT FROM (idempotent).")
    out.append("-- Generated catalog data — NOT real supplier data.")
    out.append("BEGIN;")
    out.append("")
    out.append("CREATE TABLE IF NOT EXISTS catalog_fixups (")
    out.append("  name       TEXT PRIMARY KEY,")
    out.append("  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()")
    out.append(");")
    out.append("")

    out.append(f"-- ---------------------------------------------------------- الأسعار ({len(results)})")
    for start in range(0, len(results), CHUNK):
        part = results[start:start + CHUNK]
        out.append(f"-- prices {start + 1}-{start + len(part)}")
        out.append("UPDATE products p SET price = v.price::numeric, compare_at_price = v.compare_at::numeric")
        out.append("FROM (VALUES")
        vals = []
        for x in part:
            comp = f"{x['new_compare']:.2f}" if x["new_compare"] is not None else "NULL"
            vals.append(f"  ({sql_str(x['sku'])}, {x['new_price']:.2f}, {comp})")
        out.append(",\n".join(vals))
        out.append(") AS v(sku, price, compare_at)")
        out.append("WHERE p.sku = v.sku")
        out.append("  AND (p.price IS DISTINCT FROM v.price::numeric OR p.compare_at_price IS DISTINCT FROM v.compare_at::numeric);")
        out.append("")

    out.append(f"-- ---------------------------------------------------------- الأسماء المنظّفة ({len(cleaned)})")
    for start in range(0, len(cleaned), CHUNK):
        part = cleaned[start:start + CHUNK]
        out.append(f"-- names {start + 1}-{start + len(part)}")
        out.append("UPDATE products p SET name_ar = v.name_ar, name_en = v.name_en, slug = v.slug,")
        out.append("    description_ar = v.description_ar, description_en = v.description_en")
        out.append("FROM (VALUES")
        vals = []
        for x in part:
            da = (f"{x['new_name_ar']} من علامة {x['brand_ar']} — منتج من كتالوج VORQON الموسّع، "
                  f"يُباع عبر بائعين موثوقين مع دفع عند الاستلام وتوصيل داخل مصر والدول العربية.")
            de = (f"{x['new_name_en']} by {x['brand_en']} — part of the expanded VORQON catalog, "
                  f"sold by trusted sellers with cash on delivery across Egypt and the Arab world.")
            vals.append(f"  ({sql_str(x['sku'])}, {sql_str(x['new_name_ar'])}, {sql_str(x['new_name_en'])}, "
                        f"{sql_str(x['new_slug'])}, {sql_str(da)}, {sql_str(de)})")
        out.append(",\n".join(vals))
        out.append(") AS v(sku, name_ar, name_en, slug, description_ar, description_en)")
        out.append("WHERE p.sku = v.sku")
        out.append("  AND (p.name_ar IS DISTINCT FROM v.name_ar OR p.name_en IS DISTINCT FROM v.name_en")
        out.append("       OR p.slug IS DISTINCT FROM v.slug OR p.description_ar IS DISTINCT FROM v.description_ar")
        out.append("       OR p.description_en IS DISTINCT FROM v.description_en);")
        out.append("")

    out.append("INSERT INTO catalog_fixups (name) VALUES ('prices-v2') ON CONFLICT (name) DO NOTHING;")
    out.append("")
    out.append("COMMIT;")
    out.append("")
    OUT_PATH.write_text("\n".join(out), encoding="utf-8")
    print(f"\nOK: كُتب {OUT_PATH.name} ({OUT_PATH.stat().st_size / 1e6:.2f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
