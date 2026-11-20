#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VORQON — مولّد كتالوج 10000 منتج (بيانات تجريبية مولّدة)
- أسماء عربية/إنجليزية أصلية من تأليف المولّد، لا تنسخ وصف أمازون أو أسماء منتجاتها.
- التركيز على الأكثر استهلاكاً في مصر والدول العربية: الغذاء/البقالة والتنظيف والعناية أكبر حصة.
- التشغيل: python3 generate_catalog.py
- المخرجات في نفس المجلد: products-10000.csv, products-10000.sql, README.md
"""
import csv
import random
from collections import Counter
from pathlib import Path

BASE = Path(__file__).resolve().parent
random.seed(42)

BRANDS = [
    ("نوفا", "Nova"), ("دلتا", "Delta"), ("النيل", "Nile"), ("الصفا", "Safa"),
    ("المصرية", "Masriya"), ("العربية", "Arabia"), ("الشرق", "Sharq"),
    ("الجودة", "Jawda"), ("البركة", "Baraka"), ("السلام", "Salam"),
    ("الخير", "Khair"), ("الوادي", "Wadi"), ("النجمة", "Najma"),
    ("المدينة", "Madina"), ("الريان", "Rayan"), ("الهدى", "Huda"),
]

ORIGINS = [
    ("مصر", 35), ("الصين", 30), ("تركيا", 10), ("السعودية", 8),
    ("الإمارات", 5), ("فيتنام", 5), ("الهند", 4), ("إيطاليا", 3),
]

def pick_weighted(pairs):
    items, weights = zip(*pairs)
    return random.choices(items, weights=weights, k=1)[0]

# كل قسم: slug, count, price_min, price_max, bases[(ar,en)], attrs[(ar,en)]
CATEGORIES = [
    ("grocery", 1500, 15, 450, [
        ("أرز أبيض", "White Rice"), ("سكر أبيض", "White Sugar"), ("زيت طعام", "Cooking Oil"),
        ("شاي أسود", "Black Tea"), ("قهوة مطحونة", "Ground Coffee"), ("معكرونة", "Pasta"),
        ("دقيق قمح", "Wheat Flour"), ("عدس أصفر", "Yellow Lentils"), ("فول مدمس", "Fava Beans"),
        ("جبنة بيضاء", "White Cheese"), ("لبن بودرة", "Powdered Milk"), ("عسل نحل", "Honey"),
        ("تمر سكري", "Dates"), ("مكسرات مشكلة", "Mixed Nuts"), ("صلصة طماطم", "Tomato Paste"),
        ("ملح طعام", "Table Salt"), ("خل أبيض", "White Vinegar"), ("شوفان", "Oats"),
        ("بسكويت سادة", "Plain Biscuits"), ("مربى فراولة", "Strawberry Jam"),
    ], [("1 كجم", "1 kg"), ("500 جم", "500 g"), ("2 كجم", "2 kg"), ("900 مل", "900 ml"), ("عبوة عائلية", "Family Pack"), ("3 قطع", "3 Pcs")]),
    ("beauty", 1000, 25, 650, [
        ("شامبو للشعر", "Hair Shampoo"), ("بلسم للشعر", "Hair Conditioner"), ("صابون طبيعي", "Natural Soap"),
        ("معجون أسنان", "Toothpaste"), ("كريم مرطب", "Moisturizing Cream"), ("لوشن للجسم", "Body Lotion"),
        ("عطر شرقي", "Oriental Perfume"), ("مزيل عرق", "Deodorant"), ("غسول للوجه", "Face Wash"),
        ("زيت أرغان", "Argan Oil"), ("كريم واقي شمس", "Sunscreen Cream"), ("ماسك للوجه", "Face Mask"),
        ("فرشاة أسنان", "Toothbrush"), ("شاور جل", "Shower Gel"), ("زيت جوز هند", "Coconut Oil"),
        ("كريم لليدين", "Hand Cream"), ("تونر للبشرة", "Skin Toner"), ("سيروم فيتامين سي", "Vitamin C Serum"),
    ], [("200 مل", "200 ml"), ("400 مل", "400 ml"), ("100 مل", "100 ml"), ("50 مل", "50 ml"), ("عبوة 2", "Pack of 2"), ("حجم كبير", "Large Size")]),
    ("home-kitchen", 1000, 20, 1200, [
        ("مسحوق غسيل", "Laundry Detergent"), ("سائل غسيل أطباق", "Dishwashing Liquid"),
        ("منظف متعدد الاستخدامات", "Multi-Purpose Cleaner"), ("إسفنجة تنظيف", "Cleaning Sponge"),
        ("ممسحة أرضيات", "Floor Mop"), ("مقلاة غير لاصقة", "Non-Stick Frying Pan"),
        ("طقم أواني طهي", "Cookware Set"), ("أطباق سيراميك", "Ceramic Plates"),
        ("أكواب زجاجية", "Glass Cups"), ("علب تخزين طعام", "Food Storage Boxes"),
        ("مناديل مطبخ", "Kitchen Towels"), ("منظف زجاج", "Glass Cleaner"),
        ("مبيض ملابس", "Fabric Bleach"), ("معطر جو", "Air Freshener"),
        ("صينية خبز", "Baking Tray"), ("سكين مطبخ", "Kitchen Knife"),
        ("لوح تقطيع", "Cutting Board"), ("ترمس حراري", "Thermal Flask"),
    ], [("1 لتر", "1 L"), ("3 لتر", "3 L"), ("طقم 6 قطع", "Set of 6"), ("طقم 12 قطعة", "Set of 12"), ("عبوة 3", "Pack of 3"), ("مقاس متوسط", "Medium Size")]),
    ("fashion", 900, 99, 1800, [
        ("تيشيرت قطن", "Cotton T-Shirt"), ("بنطلون جينز", "Denim Jeans"),
        ("فستان صيفي", "Summer Dress"), ("حذاء رياضي", "Sports Shoes"),
        ("قميص كلاسيك", "Classic Shirt"), ("جاكيت خفيف", "Light Jacket"),
        ("عباية عملية", "Practical Abaya"), ("حجاب قطن", "Cotton Hijab"),
        ("سنيكرز يومي", "Everyday Sneakers"), ("صندل صيفي", "Summer Sandals"),
        ("بدلة رجالي", "Men Suit"), ("بلوزة نسائية", "Women Blouse"),
        ("شورت رياضي", "Sports Shorts"), ("هودي قطن", "Cotton Hoodie"),
        ("تنورة", "Skirt"), ("حذاء جلد", "Leather Shoes"),
    ], [("مقاس M", "Size M"), ("مقاس L", "Size L"), ("مقاس XL", "Size XL"), ("مقاس 42", "Size 42"), ("مقاس 43", "Size 43"), ("لون أسود", "Black"), ("لون أبيض", "White"), ("لون أزرق", "Blue")]),
    ("electronics", 800, 149, 9500, [
        ("سماعات بلوتوث", "Bluetooth Headphones"), ("شاحن سريع", "Fast Charger"),
        ("كابل شحن", "Charging Cable"), ("باور بانك", "Power Bank"),
        ("سماعة محمولة", "Portable Speaker"), ("ساعة ذكية", "Smart Watch"),
        ("كاميرا مراقبة", "Security Camera"), ("راوتر واي فاي", "Wi-Fi Router"),
        ("لوحة مفاتيح لاسلكية", "Wireless Keyboard"), ("ماوس لاسلكي", "Wireless Mouse"),
        ("فلاشة USB", "USB Flash Drive"), ("هارد خارجي", "External Hard Drive"),
        ("شاشة كمبيوتر", "Computer Monitor"), ("طابعة منزلية", "Home Printer"),
        ("سماعات أذن لاسلكية", "Wireless Earbuds"), ("مروحة USB", "USB Fan"),
    ], [("موديل 2026", "2026 Model"), ("سعة 10000 مللي أمبير", "10000 mAh"), ("سعة 128 جيجا", "128 GB"), ("إصدار برو", "Pro Edition"), ("لون أسود", "Black"), ("لون أبيض", "White")]),
    ("appliances", 700, 199, 12000, [
        ("خلاط كهربائي", "Electric Blender"), ("غلاية كهربائية", "Electric Kettle"),
        ("مكواة بخار", "Steam Iron"), ("مكنسة كهربائية", "Vacuum Cleaner"),
        ("مروحة عمودية", "Standing Fan"), ("دفاية كهربائية", "Electric Heater"),
        ("ماكينة قهوة", "Coffee Machine"), ("محضر طعام", "Food Processor"),
        ("فرن كهربائي", "Electric Oven"), ("ميكروويف", "Microwave Oven"),
        ("ثلاجة صغيرة", "Mini Fridge"), ("غسالة أطباق صغيرة", "Mini Dishwasher"),
        ("مضرب بيض", "Egg Beater"), ("توستر خبز", "Bread Toaster"),
    ], [("1500 واط", "1500 W"), ("1.7 لتر", "1.7 L"), ("سعة 20 لتر", "20 L"), ("3 سرعات", "3 Speeds"), ("موديل 2026", "2026 Model")]),
    ("computers", 500, 249, 25000, [
        ("لابتوب عملي", "Practical Laptop"), ("لوحة مفاتيح ميكانيكية", "Mechanical Keyboard"),
        ("ماوس ألعاب", "Gaming Mouse"), ("سماعة رأس للألعاب", "Gaming Headset"),
        ("شاشة ألعاب", "Gaming Monitor"), ("ذاكرة RAM", "RAM Memory"),
        ("قرص SSD", "SSD Drive"), ("حقيبة لابتوب", "Laptop Bag"),
        ("قاعدة تبريد لابتوب", "Laptop Cooling Pad"), ("كاميرا ويب", "Webcam"),
        ("ميكروفون احترافي", "Professional Microphone"), ("طابعة ليزر", "Laser Printer"),
    ], [("16 جيجا", "16 GB"), ("512 جيجا", "512 GB"), ("شاشة 24 بوصة", "24 inch"), ("شاشة 27 بوصة", "27 inch"), ("إصدار برو", "Pro Edition")]),
    ("toys", 500, 29, 900, [
        ("مكعبات بناء", "Building Blocks"), ("دمية قماشية", "Cloth Doll"),
        ("سيارة لعبة", "Toy Car"), ("لعبة ألغاز", "Puzzle Game"),
        ("طقم تلوين", "Coloring Set"), ("كرة قدم للأطفال", "Kids Football"),
        ("دراجة أطفال", "Kids Bicycle"), ("لعبة تعليمية", "Educational Toy"),
        ("طائرة لعبة", "Toy Plane"), ("مطبخ لعبة", "Toy Kitchen"),
        ("قطار خشبي", "Wooden Train"), ("لعبة ماء", "Water Toy"),
    ], [("عمر 3+", "Age 3+"), ("عمر 5+", "Age 5+"), ("64 قطعة", "64 Pcs"), ("100 قطعة", "100 Pcs"), ("طقم كامل", "Full Set")]),
    ("tools", 450, 49, 3500, [
        ("مثقاب كهربائي", "Electric Drill"), ("مفك براغي", "Screwdriver Set"),
        ("مطرقة", "Hammer"), ("منشار يدوي", "Hand Saw"),
        ("طقم مفاتيح", "Wrench Set"), ("متر قياس", "Measuring Tape"),
        ("سلم ألمنيوم", "Aluminium Ladder"), ("صندوق أدوات", "Toolbox"),
        ("مفك كهربائي", "Electric Screwdriver"), ("مثقاب لاسلكي", "Cordless Drill"),
        ("كماشة", "Pliers"), ("مستوى ميزان", "Spirit Level"),
    ], [("20 فولت", "20 V"), ("طقم 10 قطع", "Set of 10"), ("طقم 24 قطعة", "Set of 24"), ("مقاس 5 متر", "5 m"), ("احترافي", "Professional")]),
    ("sports", 450, 49, 2500, [
        ("حذاء جري", "Running Shoes"), ("سجادة يوغا", "Yoga Mat"),
        ("دمبل حديد", "Dumbbell"), ("كرة قدم", "Football"),
        ("حقيبة رياضية", "Sports Bag"), ("زجاجة مياه رياضية", "Sports Water Bottle"),
        ("حبل قفز", "Jump Rope"), ("قفازات رياضية", "Sports Gloves"),
        ("بدلة رياضية", "Tracksuit"), ("دراجة هوائية", "Bicycle"),
        ("مضرب تنس", "Tennis Racket"), ("نظارة سباحة", "Swimming Goggles"),
    ], [("مقاس M", "Size M"), ("مقاس L", "Size L"), ("وزن 5 كجم", "5 kg"), ("وزن 10 كجم", "10 kg"), ("لون أسود", "Black")]),
    ("furniture", 400, 499, 15000, [
        ("كنبة ثلاثية", "Three-Seater Sofa"), ("كرسي مكتب", "Office Chair"),
        ("طاولة طعام", "Dining Table"), ("سرير خشبي", "Wooden Bed"),
        ("خزانة ملابس", "Wardrobe"), ("رف كتب", "Bookshelf"),
        ("طاولة قهوة", "Coffee Table"), ("مرتبة سرير", "Mattress"),
        ("كرسي استرخاء", "Relaxing Chair"), ("وحدة تلفاز", "TV Unit"),
    ], [("لون رمادي", "Grey"), ("لون بيج", "Beige"), ("خشب بني", "Brown Wood"), ("مقاس 160 سم", "160 cm"), ("مقاس 200 سم", "200 cm")]),
    ("automotive", 400, 49, 4000, [
        ("زيت محرك", "Engine Oil"), ("فلتر هواء", "Air Filter"),
        ("بطارية سيارة", "Car Battery"), ("إطارات سيارة", "Car Tyres"),
        ("ممسحة زجاج", "Windshield Wiper"), ("شمع سيارة", "Car Wax"),
        ("مقعد سيارة للأطفال", "Child Car Seat"), ("غطاء سيارة", "Car Cover"),
        ("مضخة هواء", "Air Pump"), ("كابل تشغيل بطارية", "Jump Start Cable"),
    ], [("4 لتر", "4 L"), ("مقاس 16 بوصة", "16 inch"), ("12 فولت", "12 V"), ("طقم 2", "Set of 2")]),
    ("books", 350, 19, 450, [
        ("دفتر ملاحظات", "Notebook"), ("قلم جاف", "Ballpoint Pen"),
        ("ألوان خشبية", "Colored Pencils"), ("حقيبة مدرسية", "School Bag"),
        ("مسطرة", "Ruler"), ("ممحاة", "Eraser"),
        ("كتاب قصص أطفال", "Kids Story Book"), ("أجندة سنوية", "Annual Agenda"),
        ("ملف بلاستيكي", "Plastic Folder"), ("مقص مدرسي", "School Scissors"),
    ], [("100 ورقة", "100 Sheets"), ("عبوة 10", "Pack of 10"), ("عبوة 12", "Pack of 12"), ("غلاف مقوى", "Hard Cover")]),
    ("watches", 300, 199, 8000, [
        ("ساعة يد كلاسيكية", "Classic Wrist Watch"), ("ساعة ذكية", "Smart Watch"),
        ("ساعة رياضية", "Sports Watch"), ("سوار ساعة جلد", "Leather Watch Strap"),
        ("ساعة حائط", "Wall Clock"), ("منبه مكتب", "Desk Alarm Clock"),
    ], [("سوار جلد", "Leather Strap"), ("سوار معدني", "Metal Strap"), ("مقاومة للماء", "Water Resistant"), ("لون أسود", "Black"), ("لون فضي", "Silver")]),
    ("machinery", 250, 499, 20000, [
        ("مضخة مياه", "Water Pump"), ("مولد كهرباء صغير", "Small Generator"),
        ("ماكينة لحام", "Welding Machine"), ("كمبروسر هواء", "Air Compressor"),
        ("منشار كهربائي", "Electric Saw"), ("ماكينة طحن", "Grinding Machine"),
    ], [("2 حصان", "2 HP"), ("220 فولت", "220 V"), ("سعة 50 لتر", "50 L"), ("احترافي", "Professional")]),
    ("business", 200, 49, 5000, [
        ("طابعة مكتبية", "Office Printer"), ("ورق طباعة A4", "A4 Printing Paper"),
        ("كرسي مكتب مريح", "Ergonomic Office Chair"), ("ماكينة تصوير صغيرة", "Small Copier"),
        ("حاسبة مكتبية", "Desktop Calculator"), ("ماكينة تغليف", "Packaging Machine"),
    ], [("عبوة 500 ورقة", "500 Sheets"), ("A4", "A4"), ("موديل مكتبي", "Office Model")]),
    ("agriculture", 150, 99, 8000, [
        ("بذور خضروات", "Vegetable Seeds"), ("سماد عضوي", "Organic Fertilizer"),
        ("خرطوم ري", "Irrigation Hose"), ("مقص تقليم", "Pruning Shears"),
        ("رشاش مياه", "Water Sprinkler"), ("قفازات زراعية", "Gardening Gloves"),
    ], [("1 كجم", "1 kg"), ("5 كجم", "5 kg"), ("25 متر", "25 m"), ("طقم كامل", "Full Set")]),
    ("local", 150, 29, 1500, [
        ("منتجات بلدي — عسل", "Local Honey"), ("منتجات بلدي — زيت زيتون", "Local Olive Oil"),
        ("حرف يدوية — سلة خوص", "Handmade Wicker Basket"), ("فخار مصري", "Egyptian Pottery"),
        ("سجاد يدوي صغير", "Small Handmade Rug"), ("تمر مصري", "Egyptian Dates"),
    ], [("1 كجم", "1 kg"), ("500 مل", "500 ml"), ("قطعة واحدة", "1 Pc"), ("صناعة يدوية", "Handmade")]),
]

def esc(s):
    return str(s).replace("'", "''")

def main():
    products = []
    seen_names = set()
    sku_num = 100001
    for slug, count, pmin, pmax, bases, attrs in CATEGORIES:
        for _ in range(count):
            base_ar, base_en = random.choice(bases)
            attr_ar, attr_en = random.choice(attrs)
            brand_ar, brand_en = random.choice(BRANDS)
            # اسم أصلي: نوع + صفة + علامة عامة؛ مع رقم تشكيلة لضمان الفرادة عند التكرار
            name_ar = f"{base_ar} {brand_ar} {attr_ar}"
            name_en = f"{brand_en} {base_en} {attr_en}"
            if name_ar in seen_names:
                suffix = 2
                while f"{name_ar} — تشكيلة {suffix}" in seen_names:
                    suffix += 1
                name_ar = f"{name_ar} — تشكيلة {suffix}"
                name_en = f"{name_en} — Variant {suffix}"
            seen_names.add(name_ar)
            price = random.randint(pmin, pmax)
            compare = ""
            if random.random() < 0.35:
                compare = str(int(round(price * random.uniform(1.10, 1.40))))
            stock = random.choices([0, 5, 12, 25, 50, 80, 120, 200, 350], weights=[3, 8, 15, 20, 18, 14, 10, 7, 5])[0]
            origin = pick_weighted(ORIGINS)
            store_id = random.choices([1, 2, 3, 4, 5], weights=[30, 25, 20, 15, 10])[0]
            rating = round(random.uniform(3.5, 5.0), 1)
            units = random.randint(0, 900)
            products.append({
                "sku": f"VOR-{sku_num}", "name_ar": name_ar, "name_en": name_en,
                "brand": brand_en, "category_slug": slug, "price_egp": price,
                "compare_at_egp": compare, "stock": stock, "store_id": store_id,
                "origin": origin, "rating": rating, "units_sold": units,
            })
            sku_num += 1

    assert len(products) == 10000, len(products)
    assert len({p["sku"] for p in products}) == 10000
    assert all(p["price_egp"] > 0 for p in products)

    # CSV — الأعمدة المطلوبة فقط
    csv_path = BASE / "products-10000.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["sku", "name_ar", "name_en", "brand", "category_slug", "price_egp", "compare_at_egp", "stock", "store_id", "origin"])
        w.writeheader()
        for p in products:
            w.writerow({k: p[k] for k in w.fieldnames})

    # SQL — INSERTs مجمعة 500 في كل دفعة
    sql_path = BASE / "products-10000.sql"
    with open(sql_path, "w", encoding="utf-8") as f:
        f.write("-- VORQON catalog 10000 — بيانات تجريبية مولّدة، ليست منتجات حقيقية من مورد\n")
        f.write("-- Generated demo data only. Do NOT treat as real supplier products.\n")
        f.write("-- الاستيراد: psql -d vorqon -f products-10000.sql  (بعد إنشاء جدول products بأعمدة مطابقة)\n\n")
        for i in range(0, len(products), 500):
            batch = products[i:i+500]
            f.write("INSERT INTO products (sku, name_ar, name_en, brand, category_slug, price_egp, compare_at_egp, stock, store_id, origin) VALUES\n")
            lines = []
            for p in batch:
                comp = p["compare_at_egp"] if p["compare_at_egp"] else "NULL"
                lines.append(f"('{p['sku']}', '{esc(p['name_ar'])}', '{esc(p['name_en'])}', '{esc(p['brand'])}', '{p['category_slug']}', {p['price_egp']}, {comp}, {p['stock']}, {p['store_id']}, '{esc(p['origin'])}')")
            f.write(",\n".join(lines) + ";\n\n")

    # README
    dist = Counter(p["category_slug"] for p in products)
    store_dist = Counter(p["store_id"] for p in products)
    total_price = sum(p["price_egp"] for p in products)
    with open(BASE / "README.md", "w", encoding="utf-8") as f:
        f.write("# كتالوج VORQON — 10000 منتج\n\n")
        f.write("بيانات **تجريبية مولّدة** بسكربت `generate_catalog.py` (بذرة عشوائية ثابتة 42 لإعادة الإنتاج).\n")
        f.write("ليست منتجات حقيقية من مورد، وليست نسخة من كتالوج أمازون: الأسماء عربية/إنجليزية أصلية، والعلامات عامة/مصرية/عربية، ولا توجد صور أو روابط أمازون.\n\n")
        f.write("## التركيز\n\nالأكثر استهلاكاً في مصر والدول العربية أولاً: الغذاء والبقالة والتنظيف والعناية الشخصية والمنزل والمطبخ لها أكبر حصة، ثم الإلكترونيات والملابس والأجهزة.\n\n")
        f.write("## التوزيع حسب القسم\n\n| القسم | العدد | النسبة |\n|---|---:|---:|\n")
        for slug, count, *_ in CATEGORIES:
            f.write(f"| {slug} | {dist[slug]} | {dist[slug]/100:.1f}% |\n")
        f.write(f"| **الإجمالي** | **10000** | **100%** |\n\n")
        f.write("## التوزيع حسب المتجر\n\n")
        for sid in sorted(store_dist):
            f.write(f"- المتجر {sid}: {store_dist[sid]} منتجاً ({store_dist[sid]/100:.1f}%)\n")
        f.write(f"\n- متوسط السعر: {total_price/10000:.2f} جنيه\n")
        f.write(f"- نطاق الأسعار: {min(p['price_egp'] for p in products)} – {max(p['price_egp'] for p in products)} جنيه\n")
        f.write("\n## الملفات\n\n- `generate_catalog.py` — المولّد (شغّله بـ `python3 generate_catalog.py` لإعادة التوليد)\n")
        f.write("- `products-10000.csv` — الأعمدة: sku,name_ar,name_en,brand,category_slug,price_egp,compare_at_egp,stock,store_id,origin\n")
        f.write("- `products-10000.sql` — INSERTs مجمعة (500 في كل دفعة)\n\n")
        f.write("## كيفية الاستيراد\n\n")
        f.write("1. **عبر مركز البائعين (CSV):** استخدم إجراء `sellerimportcsv` في التطبيق، بصيغة `name_en,name_ar,brand,price,stock,sku` لكل سطر — ملاحظة: هذا الإجراء يتوقع تلك الأعمدة الستة فقط، لذلك للاستيراد الكامل استخدم SQL أو حوّل الملف لتلك الأعمدة.\n")
        f.write("2. **عبر SQL مباشرة:** `psql -d vorqon -f products-10000.sql` بعد التأكد من وجود جدول `products` بالأعمدة المطابقة وجداول الأقسام والمتاجر.\n")
        f.write("3. **عبر الـ seed:** يمكن تحويل دفعات من CSV إلى `seed` إضافي بنفس أسلوب `seed/seed-demo.sql`.\n\n")
        f.write("## تحذير\n\nلا تعرض هذه البيانات للعملاء على أنها منتجات حقيقية متوفرة قبل مراجعة الأسعار والمخزون والموردين. احذف أو استبدل أي منتج قبل الإطلاق الإنتاجي.\n")

    print(f"OK: {len(products)} products")
    print("Top categories:", dist.most_common(5))
    print("Stores:", sorted(store_dist.items()))

if __name__ == "__main__":
    main()
