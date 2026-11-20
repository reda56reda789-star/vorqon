#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VORQON — تحويل كتالوج الـ10000 منتج إلى صيغة مخطط ريبو الإنتاج.

يقرأ products-10000.csv (المخطط القديم: category_slug نصي، price_egp، stock،
store_id رقمي 1–5، brand نصي، origin اسم دولة بالعربية) ويولّد
catalog-repo.sql متوافقاً تماماً مع database/schema.sql:

  * users + sellers + stores للمتاجر الخمسة (seller.user_id إلزامي في المخطط)
  * categories لكل category_slug ظاهر في الـCSV
  * brands لكل علامة متميزة، وربط products.brand_id بها
  * products الـ10000: category_id/store_id/seller_id كـUUID، price من
    price_egp، compare_at_price من compare_at_egp، stock_quantity من stock،
    country_of_origin رمز ISO من حرفين، slug فريد مولّد من الاسم الإنجليزي،
    status='published'، currency='EGP'

كل الـUUIDs مولّدة حتمياً بـ uuid5 من بذرة ثابتة، وكل INSERTs تنتهي بـ
ON CONFLICT DO NOTHING — إعادة تشغيل السكربت أو إعادة استيراد الناتج آمنة.

ملحوظة: أسماء الأقسام بالعربية/الإنجليزية معرّفة هنا (generate_catalog.py
يعرّف أنواع المنتجات لكل قسم لا أسماء عرض الأقسام)، وأسماء المتاجر الخمسة
ووصفها كما في المتجر الحي.

التشغيل:  python3 convert_catalog.py
الناتج:   catalog-repo.sql  بجانب هذا السكربت.
"""
import csv
import re
import sys
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
CSV_PATH = HERE / "products-10000.csv"
OUT_PATH = HERE / "catalog-repo.sql"

# بذرة ثابتة لكل UUIDs الحتمية
NS = uuid.uuid5(uuid.NAMESPACE_URL, "https://vorqon.store/catalog-seed-v1")


def uid(kind: str, key: str) -> str:
    return str(uuid.uuid5(NS, f"{kind}:{key}"))


# ------------------------------------------------------------------ المرجعيات
# slug -> (name_ar, name_en, sort_order)
CATEGORY_NAMES = {
    "grocery":     ("بقالة ومواد غذائية", "Grocery & Food", 1),
    "beauty":      ("الصحة والجمال", "Health & Beauty", 2),
    "home-kitchen": ("المنزل والمطبخ", "Home & Kitchen", 3),
    "fashion":     ("أزياء وملابس", "Fashion", 4),
    "electronics": ("إلكترونيات", "Electronics", 5),
    "appliances":  ("أجهزة منزلية", "Home Appliances", 6),
    "computers":   ("كمبيوتر ولابتوب", "Computers & Laptops", 7),
    "toys":        ("ألعاب أطفال", "Toys & Kids", 8),
    "tools":       ("عدد وأدوات", "Tools & Hardware", 9),
    "sports":      ("رياضة ولياقة", "Sports & Fitness", 10),
    "furniture":   ("أثاث", "Furniture", 11),
    "automotive":  ("سيارات وملحقاتها", "Automotive", 12),
    "books":       ("كتب وأدوات مكتبية", "Books & Stationery", 13),
    "watches":     ("ساعات", "Watches", 14),
    "machinery":   ("معدات وماكينات", "Machinery & Equipment", 15),
    "business":    ("مستلزمات أعمال ومكاتب", "Business & Office", 16),
    "agriculture": ("زراعة وحدائق", "Agriculture & Garden", 17),
    "local":       ("منتجات محلية وحرف يدوية", "Local & Handmade", 18),
}

# store_id الرقمي في الـCSV -> بيانات المتجر كما في المتجر الحي
STORES = {
    1: ("techzone-egypt", "تك زون مصر", "TechZone Egypt",
        "أحدث الإلكترونيات والأجهزة الذكية بضمان محلي معتمد.",
        "Latest electronics and smart devices with certified local warranty.", "4.80"),
    2: ("cairo-home-living", "القاهرة للمنزل", "Cairo Home Living",
        "أثاث وأجهزة منزلية مختارة بعناية لمنازل عصرية.",
        "Carefully selected furniture and home appliances for modern homes.", "4.70"),
    3: ("style-avenue", "ستايل أفنيو", "Style Avenue",
        "أزياء وعناية بالجمال من علامات موثوقة.",
        "Fashion and beauty care from trusted brands.", "4.60"),
    4: ("time-house", "تايم هاوس", "Time House",
        "ساعات أصلية وإكسسوارات فاخرة.",
        "Original watches and luxury accessories.", "4.90"),
    5: ("my-store", "متجري", "My Store",
        "متجرك الخاص على VORQON — عدّل الاسم والبيانات من مركز البائعين.",
        "Your own store on VORQON — edit its details from the Seller Center.", "0"),
}

# اسم الدولة بالعربية في الـCSV -> رمز ISO 3166-1 alpha-2 (country_of_origin CHAR(2))
ORIGIN_CODES = {
    "مصر": "EG", "الصين": "CN", "تركيا": "TR", "السعودية": "SA",
    "الإمارات": "AE", "فيتنام": "VN", "الهند": "IN", "إيطاليا": "IT",
}

# كلمة مرور حسابات البائعين المزروعة لا تعمل (نفس اتفاق seed-demo.sql) —
# القيمة مجرد placeholder بصيغة bcrypt؛ الدخول الحقيقي يتطلب إعادة تعيين.
SEED_PASSWORD_HASH = "$2b$10$vorqonseedplaceholderhashnotusable0000000000000000000"


def sql_str(value) -> str:
    if value is None or value == "":
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def slugify(text: str) -> str:
    s = text.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def main() -> int:
    with CSV_PATH.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        print("ERROR: CSV فارغ", file=sys.stderr)
        return 1

    # ------------------------------------------------------------ التحقق البنيوي
    # محاكاة قيود المخطط قبل كتابة أي سطر: NOT NULL، CHECK، فرادة، مفاتيح خارجية.
    errors = []
    cat_slugs = sorted({r["category_slug"] for r in rows})
    store_ids = sorted({int(r["store_id"]) for r in rows})
    brands = sorted({r["brand"] for r in rows if r["brand"]})

    for slug in cat_slugs:
        if slug not in CATEGORY_NAMES:
            errors.append(f"category_slug بلا اسم عرض معرّف: {slug}")
    for sid in store_ids:
        if sid not in STORES:
            errors.append(f"store_id بلا متجر معرّف: {sid}")

    skus, slugs = set(), set()
    for r in rows:
        if not r["sku"] or r["sku"] in skus:
            errors.append(f"SKU مكرر/فارغ: {r['sku']}")
        skus.add(r["sku"])
        if not r["name_ar"] or not r["name_en"]:
            errors.append(f"اسم ناقص للمنتج {r['sku']}")
        if len(r["name_ar"]) > 300 or len(r["name_en"]) > 300:
            errors.append(f"اسم أطول من VARCHAR(300): {r['sku']}")
        price = float(r["price_egp"])
        if price < 0:
            errors.append(f"سعر سالب: {r['sku']}")
        if r["compare_at_egp"] and float(r["compare_at_egp"]) < price:
            errors.append(f"compare_at < price: {r['sku']}")
        if int(r["stock"]) < 0:
            errors.append(f"مخزون سالب: {r['sku']}")
        base = slugify(r["name_en"]) or "product"
        slug = base[:290]
        if slug in slugs:  # التصادم: نضيف معرّف الـSKU كما هو مطلوب
            slug = (base[:280] + "-" + r["sku"].lower())
        if slug in slugs:
            slug = slug + "-" + str(len(slugs))
        slugs.add(slug)
        r["_slug"] = slug[:320]

    if errors:
        print("فشل التحقق البنيوي:", file=sys.stderr)
        for e in errors[:20]:
            print(" -", e, file=sys.stderr)
        return 1

    # ------------------------------------------------------------ بناء الـSQL
    out = []
    out.append("-- ============================================================================")
    out.append("-- VORQON — كتالوج 10000 منتج بصيغة مخطط ريبو الإنتاج (database/schema.sql)")
    out.append("-- مولّد آلياً بـ catalog-10000/convert_catalog.py من products-10000.csv")
    out.append("-- بيانات تجريبية مولّدة، ليست منتجات حقيقية من مورد.")
    out.append("-- كل الـUUIDs حتمية (uuid5) وكل INSERTs بـ ON CONFLICT DO NOTHING:")
    out.append("-- إعادة الاستيراد على نفس القاعدة آمنة ولا تكرر الصفوف.")
    out.append("-- الترتيب: currencies مزروعة في schema.sql نفسه؛ هنا users ثم sellers")
    out.append("-- ثم stores ثم categories ثم brands ثم products.")
    out.append("-- الاستيراد: psql \"<NEON_CONNECTION_STRING>\" -f catalog-10000/catalog-repo.sql")
    out.append("-- ============================================================================")
    out.append("BEGIN;")
    out.append("")

    # users للبائعين (sellers.user_id إلزامي)
    out.append("-- ---------------------------------------------------------- بائعو المتاجر الخمسة (حسابات مزروعة، كلمات مرورها لا تعمل)")
    for sid in store_ids:
        slug, name_ar, name_en = STORES[sid][0], STORES[sid][1], STORES[sid][2]
        out.append(
            "INSERT INTO users (id, email, password_hash, full_name, role, status) VALUES ("
            f"{sql_str(uid('user', slug))}, {sql_str(f'seller-{sid}@vorqon.local')}, "
            f"{sql_str(SEED_PASSWORD_HASH)}, {sql_str(name_en)}, 'seller', 'active')"
            " ON CONFLICT (id) DO NOTHING;"
        )
    out.append("")

    # sellers — الحالة approved والعمولة 5% كما هو مقرر للمنصة
    out.append("-- ---------------------------------------------------------- البائعون (approved، عمولة 5%)")
    for sid in store_ids:
        slug, name_ar, name_en = STORES[sid][0], STORES[sid][1], STORES[sid][2]
        out.append(
            "INSERT INTO sellers (id, user_id, business_name_ar, business_name_en, status, commission_rate) VALUES ("
            f"{sql_str(uid('seller', slug))}, {sql_str(uid('user', slug))}, "
            f"{sql_str(name_ar)}, {sql_str(name_en)}, 'approved', 5.00)"
            " ON CONFLICT (id) DO NOTHING;"
        )
    out.append("")

    # stores
    out.append("-- ---------------------------------------------------------- المتاجر")
    for sid in store_ids:
        slug, name_ar, name_en, desc_ar, desc_en, rating = STORES[sid]
        out.append(
            "INSERT INTO stores (id, seller_id, slug, name_ar, name_en, description_ar, description_en, rating_avg) VALUES ("
            f"{sql_str(uid('store', slug))}, {sql_str(uid('seller', slug))}, {sql_str(slug)}, "
            f"{sql_str(name_ar)}, {sql_str(name_en)}, {sql_str(desc_ar)}, {sql_str(desc_en)}, {rating})"
            " ON CONFLICT (id) DO NOTHING;"
        )
    out.append("")

    # categories — فقط الأقسام الظاهرة فعلاً في الـCSV
    out.append(f"-- ---------------------------------------------------------- الأقسام ({len(cat_slugs)})")
    for slug in cat_slugs:
        name_ar, name_en, sort_order = CATEGORY_NAMES[slug]
        out.append(
            "INSERT INTO categories (id, slug, name_ar, name_en, sort_order) VALUES ("
            f"{sql_str(uid('category', slug))}, {sql_str(slug)}, {sql_str(name_ar)}, "
            f"{sql_str(name_en)}, {sort_order})"
            " ON CONFLICT (id) DO NOTHING;"
        )
    out.append("")

    # brands
    out.append(f"-- ---------------------------------------------------------- العلامات التجارية ({len(brands)})")
    for b in brands:
        out.append(
            "INSERT INTO brands (id, slug, name_ar, name_en) VALUES ("
            f"{sql_str(uid('brand', b))}, {sql_str(slugify(b))}, {sql_str(b)}, {sql_str(b)})"
            " ON CONFLICT (id) DO NOTHING;"
        )
    out.append("")

    # products — دفعات من 500
    out.append(f"-- ---------------------------------------------------------- المنتجات ({len(rows)})")
    cols = ("(id, seller_id, store_id, category_id, brand_id, sku, name_ar, name_en, slug, "
            "description_ar, description_en, price, compare_at_price, currency, "
            "stock_quantity, status, country_of_origin)")
    chunk = 500
    for start in range(0, len(rows), chunk):
        part = rows[start:start + chunk]
        out.append(f"-- products {start + 1}-{start + len(part)}")
        out.append(f"INSERT INTO products {cols} VALUES")
        values = []
        for r in part:
            sid = int(r["store_id"])
            store_slug = STORES[sid][0]
            compare = r["compare_at_egp"] or None
            values.append(
                "(" + ", ".join([
                    sql_str(uid("product", r["sku"])),
                    sql_str(uid("seller", store_slug)),
                    sql_str(uid("store", store_slug)),
                    sql_str(uid("category", r["category_slug"])),
                    sql_str(uid("brand", r["brand"])) if r["brand"] else "NULL",
                    sql_str(r["sku"]),
                    sql_str(r["name_ar"]),
                    sql_str(r["name_en"]),
                    sql_str(r["_slug"]),
                    "NULL", "NULL",
                    f"{float(r['price_egp']):.2f}",
                    f"{float(compare):.2f}" if compare else "NULL",
                    "'EGP'",
                    str(int(r["stock"])),
                    "'published'",
                    sql_str(ORIGIN_CODES.get(r["origin"])),
                ]) + ")"
            )
        out.append(",\n".join(values))
        out.append("ON CONFLICT (id) DO NOTHING;")
        out.append("")

    out.append("COMMIT;")
    out.append("")
    OUT_PATH.write_text("\n".join(out), encoding="utf-8")

    print(f"OK: كُتب {OUT_PATH.name}")
    print(f"  products INSERT rows : {len(rows)}")
    print(f"  categories           : {len(cat_slugs)} {cat_slugs}")
    print(f"  stores / sellers     : {len(store_ids)} {store_ids}")
    print(f"  brands               : {len(brands)}")
    print(f"  unique slugs         : {len(slugs)}")
    print(f"  unique skus          : {len(skus)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
