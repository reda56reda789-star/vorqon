-- ============================================================================
-- VORQON — seed-demo.sql — بيانات تجريبية DEMO فقط
-- DEMO DATA ONLY — NOT production data. Do NOT load in production.
-- كل قسم ومنتج هنا له اسم عربي + اسم إنجليزي (name_ar / name_en).
-- Every category and product below is bilingual (Arabic + English).
-- العملات: EGP / USD / SAR / AED. الأسعار بالجنيه المصري (EGP) ما لم يُذكر خلاف ذلك.
-- كلمات مرور الحسابات التجريبية: قيمة DEMO_HASH — لا يمكن الدخول بها؛
--   سجّل حساباً جديداً عبر /api/auth/register أو عيّن كلمة مرور من لوحة الإدارة.
-- أسعار الصرف أدناه أرقام تجريبية ثابتة للعرض فقط، وليست أسعاراً حية.
-- ============================================================================

BEGIN;

-- --- Demo users (DEMO only) ---
INSERT INTO users (id, email, phone, password_hash, full_name, role, language, currency) VALUES
  ('a0000000-0000-0000-0000-000000000001','admin@vorqon.demo','+201000000001','DEMO_HASH_SET_VIA_REGISTER','مدير تجريبي | Demo Admin','admin','ar','EGP'),
  ('a0000000-0000-0000-0000-000000000002','seller-nile@vorqon.demo','+201000000002','DEMO_HASH_SET_VIA_REGISTER','متجر النيل للإلكترونيات','seller','ar','EGP'),
  ('a0000000-0000-0000-0000-000000000003','seller-cairo@vorqon.demo','+201000000003','DEMO_HASH_SET_VIA_REGISTER','متجر القاهرة للأزياء','seller','ar','EGP'),
  ('a0000000-0000-0000-0000-000000000004','seller-delta@vorqon.demo','+201000000004','DEMO_HASH_SET_VIA_REGISTER','متجر الدلتا للأغذية','seller','ar','EGP'),
  ('a0000000-0000-0000-0000-000000000005','customer@vorqon.demo','+201000000005','DEMO_HASH_SET_VIA_REGISTER','عميل تجريبي | Demo Customer','customer','ar','EGP')
ON CONFLICT (email) DO NOTHING;

-- --- Demo sellers + stores (DEMO only) ---
INSERT INTO sellers (id, user_id, business_name_ar, business_name_en, status, commission_rate) VALUES
  ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','النيل للإلكترونيات','Nile Electronics','approved',10.00),
  ('b0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000003','القاهرة للأزياء','Cairo Fashion','approved',12.00),
  ('b0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000004','الدلتا للأغذية','Delta Foods','approved',8.00)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO stores (id, seller_id, slug, name_ar, name_en, description_ar, description_en) VALUES
  ('c0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','nile-electronics','متجر النيل للإلكترونيات','Nile Electronics Store','إلكترونيات وهواتف أصلية بضمان محلي.','Genuine electronics and phones with local warranty.'),
  ('c0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000002','cairo-fashion','متجر القاهرة للأزياء','Cairo Fashion Store','ملابس وأحذية مصرية وعربية بجودة عالية.','High-quality Egyptian and Arab clothing and shoes.'),
  ('c0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000003','delta-foods','متجر الدلتا للأغذية','Delta Foods Store','منتجات غذائية مصرية: عسل، تمر، وزيوت طبيعية.','Egyptian food products: honey, dates, and natural oils.')
ON CONFLICT (slug) DO NOTHING;

-- --- 18 categories / 18 قسماً (bilingual) ---
INSERT INTO categories (id, slug, name_ar, name_en, sort_order) VALUES
  ('d0000000-0000-0000-0000-000000000001','electronics-phones','الإلكترونيات والهواتف','Electronics & Phones',1),
  ('d0000000-0000-0000-0000-000000000002','computers-accessories','الكمبيوتر والإكسسوارات','Computers & Accessories',2),
  ('d0000000-0000-0000-0000-000000000003','home-appliances','الأجهزة المنزلية','Home Appliances',3),
  ('d0000000-0000-0000-0000-000000000004','clothing-shoes','الملابس والأحذية','Clothing & Shoes',4),
  ('d0000000-0000-0000-0000-000000000005','watches-accessories','الساعات والإكسسوارات','Watches & Accessories',5),
  ('d0000000-0000-0000-0000-000000000006','health-beauty','الصحة والجمال','Health & Beauty',6),
  ('d0000000-0000-0000-0000-000000000007','home-kitchen','المنزل والمطبخ','Home & Kitchen',7),
  ('d0000000-0000-0000-0000-000000000008','furniture-decor','الأثاث والديكور','Furniture & Decor',8),
  ('d0000000-0000-0000-0000-000000000009','cars-spare-parts','السيارات وقطع الغيار','Cars & Spare Parts',9),
  ('d0000000-0000-0000-0000-000000000010','equipment-machinery','المعدات والآلات','Equipment & Machinery',10),
  ('d0000000-0000-0000-0000-000000000011','agricultural-equipment','المعدات الزراعية','Agricultural Equipment',11),
  ('d0000000-0000-0000-0000-000000000012','industrial-tools','العدد والأدوات الصناعية','Industrial Tools',12),
  ('d0000000-0000-0000-0000-000000000013','sports-entertainment','الرياضة والترفيه','Sports & Entertainment',13),
  ('d0000000-0000-0000-0000-000000000014','toys-kids','الألعاب والأطفال','Toys & Kids',14),
  ('d0000000-0000-0000-0000-000000000015','books-stationery','الكتب والقرطاسية','Books & Stationery',15),
  ('d0000000-0000-0000-0000-000000000016','corporate-factory-supplies','مستلزمات الشركات والمصانع','Corporate & Factory Supplies',16),
  ('d0000000-0000-0000-0000-000000000017','food-products','المنتجات الغذائية','Food Products',17),
  ('d0000000-0000-0000-0000-000000000018','local-international-products','المنتجات المحلية والعالمية','Local & International Products',18)
ON CONFLICT (slug) DO NOTHING;

-- --- Demo brands (bilingual) ---
INSERT INTO brands (id, slug, name_ar, name_en) VALUES
  ('e0000000-0000-0000-0000-000000000001','nile-tech','نايل تك','Nile Tech'),
  ('e0000000-0000-0000-0000-000000000002','cairo-cotton','قطن القاهرة','Cairo Cotton'),
  ('e0000000-0000-0000-0000-000000000003','delta-gold','دلتا الذهبي','Delta Gold')
ON CONFLICT (slug) DO NOTHING;

-- --- Demo products (bilingual, EGP) — 12 منتجاً تجريبياً ---
INSERT INTO products (id, seller_id, store_id, category_id, brand_id, sku, model_number, name_ar, name_en, slug, description_ar, description_en, price, compare_at_price, currency, stock_quantity, status, warranty_months, country_of_origin) VALUES
  ('f0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','VQ-PHN-001','NT-X100','هاتف ذكي نايل تك X100','Nile Tech X100 Smartphone','nile-tech-x100','هاتف ذكي بشاشة 6.5 بوصة وذاكرة 128GB.','Smartphone with 6.5" display and 128GB storage.',8999.00,10999.00,'EGP',25,'published',12,'EG'),
  ('f0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002','e0000000-0000-0000-0000-000000000001','VQ-LAP-002','NT-L15','لابتوب نايل تك 15 بوصة','Nile Tech 15" Laptop','nile-tech-laptop-15','لابتوب للأعمال والدراسة بمعالج حديث وذاكرة 16GB.','Business and study laptop, modern CPU, 16GB RAM.',24999.00,27999.00,'EGP',10,'published',12,'EG'),
  ('f0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000003',NULL,'VQ-FAN-003','NT-FAN40','مروحة منزلية 40 سم','40cm Home Fan','home-fan-40cm','مروحة منزلية هادئة بثلاث سرعات.','Quiet 3-speed home fan.',749.00,999.00,'EGP',60,'published',12,'EG'),
  ('f0000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000004','e0000000-0000-0000-0000-000000000002','VQ-SHT-004','CC-M-01','قميص قطن مصري رجالي','Egyptian Cotton Men Shirt','egyptian-cotton-shirt','قميص قطن مصري 100%، مريح ومناسب للصيف.','100% Egyptian cotton shirt, comfortable for summer.',649.00,899.00,'EGP',40,'published',0,'EG'),
  ('f0000000-0000-0000-0000-000000000005','b0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000004','e0000000-0000-0000-0000-000000000002','VQ-SHO-005','CC-SH-42','حذاء رياضي القاهرة','Cairo Running Shoes','cairo-running-shoes','حذاء رياضي خفيف للجري اليومي.','Lightweight running shoes for daily use.',1299.00,1699.00,'EGP',30,'published',0,'EG'),
  ('f0000000-0000-0000-0000-000000000006','b0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000005',NULL,'VQ-WAT-006','CC-W-01','ساعة يد كلاسيكية','Classic Wrist Watch','classic-wrist-watch','ساعة يد كلاسيكية بسوار جلد طبيعي.','Classic wrist watch with genuine leather strap.',1899.00,2499.00,'EGP',15,'published',12,'EG'),
  ('f0000000-0000-0000-0000-000000000007','b0000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000017','e0000000-0000-0000-0000-000000000003','VQ-HON-007','DG-H-500','عسل نحل طبيعي 500غ','Natural Honey 500g','natural-honey-500g','عسل نحل طبيعي من مناحل الدلتا، 500 غرام.','Natural honey from Delta apiaries, 500g.',349.00,449.00,'EGP',100,'published',0,'EG'),
  ('f0000000-0000-0000-0000-000000000008','b0000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000017',NULL,'VQ-DAT-008','DG-D-1K','تمر سكري فاخر 1كغ','Premium Sukkari Dates 1kg','premium-sukkari-dates-1kg','تمر سكري فاخر، 1 كيلوغرام.','Premium Sukkari dates, 1kg.',299.00,399.00,'EGP',80,'published',0,'SA'),
  ('f0000000-0000-0000-0000-000000000009','b0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000007',NULL,'VQ-POT-009','NT-P-5L','طقم قدور مطبخ 5 قطع','5-Piece Cookware Set','cookware-set-5pc','طقم قدور غير لاصقة للمطبخ، 5 قطع.','Non-stick cookware set for the kitchen, 5 pieces.',1799.00,2299.00,'EGP',20,'published',12,'EG'),
  ('f0000000-0000-0000-0000-000000000010','b0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000013',NULL,'VQ-BAL-010','CC-B-05','كرة قدم احترافية','Professional Football','professional-football','كرة قدم احترافية مقاس 5.','Professional football, size 5.',499.00,699.00,'EGP',50,'published',0,'EG'),
  ('f0000000-0000-0000-0000-000000000011','b0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000014',NULL,'VQ-TOY-011','CC-T-01','لعبة سيارة للأطفال','Kids Toy Car','kids-toy-car','لعبة سيارة آمنة للأطفال من عمر 3 سنوات.','Safe toy car for kids aged 3+.',259.00,349.00,'EGP',70,'published',0,'EG'),
  ('f0000000-0000-0000-0000-000000000012','b0000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000006',NULL,'VQ-OIL-012','DG-O-250','زيت زيتون بكر 250مل','Extra Virgin Olive Oil 250ml','olive-oil-250ml','زيت زيتون بكر ممتاز، 250 مل.','Extra virgin olive oil, 250ml.',189.00,249.00,'EGP',90,'published',0,'EG')
ON CONFLICT (sku) DO NOTHING;

-- --- Demo exchange rates (DEMO fixed rates — not live) ---
INSERT INTO exchange_rates (from_currency, to_currency, rate, source) VALUES
  ('USD','EGP',48.50,'demo'), ('EGP','USD',0.0206,'demo'),
  ('SAR','EGP',12.93,'demo'), ('AED','EGP',13.20,'demo')
ON CONFLICT DO NOTHING;

-- --- Demo shipping zones (bilingual) ---
INSERT INTO shipping_zones (name_ar, name_en, countries, base_fee_egp, per_kg_egp, eta_days_min, eta_days_max) VALUES
  ('داخل مصر','Inside Egypt','{EG}',35.00,10.00,1,3),
  ('الدول العربية','Arab Countries','{SA,AE,JO,KW}',150.00,40.00,3,7),
  ('دولي','International','{US,GB,DE}',300.00,80.00,5,12)
ON CONFLICT DO NOTHING;

-- --- Demo payment methods — all inactive except COD (no gateway wired) ---
INSERT INTO payment_methods (code, name_ar, name_en, provider, is_active, is_cod) VALUES
  ('cod','الدفع عند الاستلام','Cash on Delivery',NULL,TRUE,TRUE),
  ('card','بطاقة بنكية (Visa / Mastercard)','Card (Visa / Mastercard)','paymob',FALSE,FALSE),
  ('meeza','ميزة','Meeza','paymob',FALSE,FALSE),
  ('fawry','فوري','Fawry','fawry',FALSE,FALSE),
  ('vodafone_cash','فودافون كاش','Vodafone Cash','vodafone',FALSE,FALSE),
  ('instapay','إنستا باي','InstaPay','bank',FALSE,FALSE)
ON CONFLICT (code) DO NOTHING;

-- --- Demo coupon ---
INSERT INTO coupons (code, discount_type, discount_value, min_order_egp, valid_until) VALUES
  ('VORQON10','percent',10.00,500.00, now() + interval '90 days')
ON CONFLICT (code) DO NOTHING;

COMMIT;
-- End of DEMO seed. End of file.
