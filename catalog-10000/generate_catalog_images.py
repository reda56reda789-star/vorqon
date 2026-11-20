#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VORQON — استكمال بيانات الكتالوج: صور الأنواع + أسعار المقارنة + الأوصاف.

يولّد catalog-images.sql (معاملة واحدة، idempotent) الذي:
  (أ) يزرع صفاً واحداً في product_images لكل منتج من الـ10000، بصورة النوع
      الأساسي الحقيقية نفسها المستخدمة في المتجر الرئيسي (صورة واحدة لكل
      نوع من الأنواع الـ210 — انظر photo-plan.md)، بالرابط المحلي
      /images/types/<file>.jpg (الملفات منسوخة إلى frontend/public/images/types/).
  (ب) يضبط products.compare_at_price من عمود compare_at_egp في الـCSV
      (تحديث بمفتاح SKU — القيم نفسها التي زرعها convert_catalog.py،
      والتكرار هنا يضمن الاكتمال حتى لو اختلفت أي قيمة).
  (ج) يملأ description_ar / description_en الفارغة بقالب المتجر الرئيسي
      نفسه (اسم المنتج + علامته + نص كتالوج VORQON الموسّع) — بيانات
      كتالوج مولّدة، وليست بيانات مورّد حقيقي.

مطابقة المنتج → النوع: نفس أسلوب إجراء assignCatalogImages في المتجر
الرئيسي (server/src/actions.ts): داخل قسم المنتج (category_slug من الـCSV)،
الأنواع مرتبة بتنازلي طول الاسم الإنجليزي، وأول نوع يظهر اسمه الإنجليزي
داخل name_en هو المطابق — مع تحقق متقاطع أن الاسم العربي للنوع يظهر داخل
name_ar. خريطة النوع → الصورة مأخوذة من CATALOG_IMAGE_KEYS في actions.ts
(نفس مصدر الحقيقة الذي يستخدمه المتجر الرئيسي)، والأنواع نفسها معرّفة في
generate_catalog.py — يتحقق السكربت أن المجموعتين متطابقتان تماماً (210).

كل UUIDs الصور حتمية بـ uuid5 وبنفس بذرة convert_catalog.py
(uid("product-image", sku))، وكل INSERT ينتهي بـ ON CONFLICT DO NOTHING.

التشغيل:  python3 generate_catalog_images.py
الناتج:   catalog-images.sql  بجانب هذا السكربت.
"""
import csv
import re
import sys
import uuid
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
CSV_PATH = HERE / "products-10000.csv"
OUT_PATH = HERE / "catalog-images.sql"
ARTIFACT_ACTIONS = Path.home() / "workspace" / "ts-spaces" / "vorqon" / "server" / "src" / "actions.ts"
IMAGES_DIR = HERE.parent / "frontend" / "public" / "images" / "types"

sys.path.insert(0, str(HERE))
from generate_catalog import CATEGORIES, BRANDS  # noqa: E402

# نفس بذرة convert_catalog.py
NS = uuid.uuid5(uuid.NAMESPACE_URL, "https://vorqon.store/catalog-seed-v1")


def uid(kind: str, key: str) -> str:
    return str(uuid.uuid5(NS, f"{kind}:{key}"))


def sql_str(value) -> str:
    if value is None or value == "":
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


# ------------------------------------------------------------------ خريطة النوع -> الصورة من المتجر الرئيسي
def load_image_keys() -> dict:
    text = ARTIFACT_ACTIONS.read_text(encoding="utf-8")
    block = text.split("const CATALOG_IMAGE_KEYS", 1)[1].split("};", 1)[0]
    pairs = re.findall(r'"([^"]+)":\s*"(cat-[a-z0-9-]+)"', block)
    out = {}
    for k, v in pairs:
        slug, base_en = k.split(":", 1)
        out[(slug, base_en)] = v
    return out


def main() -> int:
    image_keys = load_image_keys()

    # الأنواع من مولّد الريبو
    gen_types = {(slug, base_en) for slug, _count, bases in CATEGORIES for (_ar, base_en) in bases}
    map_types = set(image_keys.keys())
    print(f"generator types : {len(gen_types)}")
    print(f"artifact map    : {len(map_types)}")
    only_gen = sorted(gen_types - map_types)
    only_map = sorted(map_types - gen_types)
    if only_gen:
        print(f"!! types without a photo in artifact map: {only_gen}")
    if only_map:
        print(f"!! artifact map entries not in generator: {only_map}")
    if only_gen or only_map:
        return 1

    # كل ملفات الصور موجودة في الريبو
    missing_files = [k for k in sorted(set(image_keys.values())) if not (IMAGES_DIR / f"{k}.jpg").exists()]
    print(f"distinct photos : {len(set(image_keys.values()))} (missing files: {missing_files})")
    if missing_files:
        return 1

    brand_ar_by_en = {en: ar for ar, en in BRANDS}

    # الأنواع لكل قسم مرتبة بتنازلي طول الاسم الإنجليزي (أسلوب المتجر الرئيسي)
    bases_by_slug = {}
    for slug, _count, bases in CATEGORIES:
        bases_by_slug[slug] = sorted(bases, key=lambda b: -len(b[1]))

    rows = list(csv.DictReader(CSV_PATH.open(encoding="utf-8")))
    print(f"csv products    : {len(rows)}")

    matched = []          # (row, base_ar, base_en, image_key)
    unmatched = []
    ar_check_fail = []
    multi_match = []
    unknown_brands = set()
    for r in rows:
        bases = bases_by_slug[r["category_slug"]]
        hits = [b for b in bases if b[1] in r["name_en"]]
        if not hits:
            unmatched.append(r["sku"])
            continue
        base_ar, base_en = hits[0]
        if len(hits) > 1:
            multi_match.append((r["sku"], [h[1] for h in hits]))
        if base_ar not in r["name_ar"]:
            ar_check_fail.append((r["sku"], r["name_ar"], base_ar))
        if r["brand"] not in brand_ar_by_en:
            unknown_brands.add(r["brand"])
        matched.append((r, base_ar, base_en, image_keys[(r["category_slug"], base_en)]))

    print(f"matched         : {len(matched)}")
    print(f"unmatched       : {len(unmatched)} {unmatched[:10]}")
    print(f"ar cross-check failures: {len(ar_check_fail)} {ar_check_fail[:5]}")
    print(f"multi-match (resolved longest-first): {len(multi_match)}")
    for sku, names in multi_match[:10]:
        print(f"    {sku}: {names}")
    print(f"unknown brands  : {sorted(unknown_brands)}")
    if unmatched or ar_check_fail or unknown_brands:
        print("!! matching is not clean — refusing to emit SQL")
        return 1

    # ------------------------------------------------------------------ بناء SQL
    out = []
    out.append("-- VORQON — استكمال بيانات الكتالوج (يُطبَّق مرة واحدة من bootstrap-db.js عندما تكون product_images فارغة)")
    out.append("-- Catalog data completion: one real type photo per product (210 base types),")
    out.append("-- compare-at prices from products-10000.csv, and template descriptions in the")
    out.append("-- main store's own wording. Generated catalog data — NOT real supplier data.")
    out.append("-- Idempotent: deterministic uuid5 image ids + ON CONFLICT DO NOTHING;")
    out.append("-- compare UPDATEs keyed by SKU; description UPDATEs only fill NULLs.")
    out.append("BEGIN;")
    out.append("")

    # (أ) الصور — دفعات من 500
    out.append(f"-- ---------------------------------------------------------- صور المنتجات ({len(matched)})")
    chunk = 500
    for start in range(0, len(matched), chunk):
        part = matched[start:start + chunk]
        out.append(f"-- images {start + 1}-{start + len(part)}")
        out.append("INSERT INTO product_images (id, product_id, url, alt_ar, alt_en, sort_order, is_main)")
        out.append("SELECT v.id::uuid, p.id, v.url, p.name_ar, p.name_en, 0, TRUE")
        out.append("FROM (VALUES")
        vals = []
        for r, _bar, _ben, key in part:
            vals.append(f"  ({sql_str(uid('product-image', r['sku']))}, {sql_str(r['sku'])}, {sql_str('/images/types/' + key + '.jpg')})")
        out.append(",\n".join(vals))
        out.append(") AS v(id, sku, url)")
        out.append("JOIN products p ON p.sku = v.sku")
        out.append("ON CONFLICT (id) DO NOTHING;")
        out.append("")

    # (ب) أسعار المقارنة — تحديث واحد بقيم الـCSV
    compare_rows = [r for r in rows if r["compare_at_egp"]]
    out.append(f"-- ---------------------------------------------------------- أسعار المقارنة ({len(compare_rows)})")
    out.append("UPDATE products p SET compare_at_price = v.c")
    out.append("FROM (VALUES")
    vals = [f"  ({sql_str(r['sku'])}, {float(r['compare_at_egp']):.2f})" for r in compare_rows]
    out.append(",\n".join(vals))
    out.append(") AS v(sku, c)")
    out.append("WHERE p.sku = v.sku AND p.compare_at_price IS DISTINCT FROM v.c;")
    out.append("")

    # (ج) الأوصاف — دفعات من 500، تملأ الفارغ فقط
    out.append(f"-- ---------------------------------------------------------- الأوصاف ({len(matched)})")
    for start in range(0, len(matched), chunk):
        part = matched[start:start + chunk]
        out.append(f"-- descriptions {start + 1}-{start + len(part)}")
        out.append("UPDATE products p SET description_ar = v.da, description_en = v.de")
        out.append("FROM (VALUES")
        vals = []
        for r, _bar, _ben, _key in part:
            brand_ar = brand_ar_by_en[r["brand"]]
            da = (f"{r['name_ar']} من علامة {brand_ar} — منتج من كتالوج VORQON الموسّع، "
                  f"يُباع عبر بائعين موثوقين مع دفع عند الاستلام وتوصيل داخل مصر والدول العربية.")
            de = (f"{r['name_en']} by {r['brand']} — part of the expanded VORQON catalog, "
                  f"sold by trusted sellers with cash on delivery across Egypt and the Arab world.")
            vals.append(f"  ({sql_str(r['sku'])}, {sql_str(da)}, {sql_str(de)})")
        out.append(",\n".join(vals))
        out.append(") AS v(sku, da, de)")
        out.append("WHERE p.sku = v.sku AND p.description_ar IS NULL;")
        out.append("")

    out.append("COMMIT;")
    out.append("")
    OUT_PATH.write_text("\n".join(out), encoding="utf-8")

    per_type = Counter((r["category_slug"], ben) for r, _bar, ben, _k in matched)
    print(f"OK: كُتب {OUT_PATH.name} ({OUT_PATH.stat().st_size / 1e6:.2f} MB)")
    print(f"  image rows        : {len(matched)}")
    print(f"  compare updates   : {len(compare_rows)}")
    print(f"  description rows  : {len(matched)}")
    print(f"  types used        : {len(per_type)} / 210")
    return 0


if __name__ == "__main__":
    sys.exit(main())
