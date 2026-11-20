# نشر VORQON مجاناً — Neon + Render

دليل خطوة بخطوة لنشر نسخة الإنتاج كاملة دون أي تكلفة:

| المكوّن | الخدمة | الخطة |
|---|---|---|
| قاعدة البيانات PostgreSQL | Neon | Free |
| الواجهة البرمجية (Backend) | Render Web Service (Docker) | Free |
| الواجهة (Frontend) | Render Static Site | Free |

ما هو جاهز في الريبو لهذا النشر:

- `render.yaml` في جذر المشروع (Render Blueprint) يعرّف الخدمتين ومتغيراتهما.
- `Dockerfile` في جذر المشروع يبني صورة الباك إند ومعها ملفّا SQL، وسكربت
  `backend/src/bootstrap-db.js` يهيّئ قاعدة Neon الفارغة تلقائياً عند أول
  تشغيل (`DB_BOOTSTRAP=true` مضبوط في `render.yaml`) — لا حاجة لأي
  تجهيز يدوي للقاعدة (الخطوة 3).
- الواجهة تبني عنوان الـAPI من أساس واحد (`frontend/src/lib/api.js`) يُضبط وقت
  البناء بالمتغير `VITE_API_URL`، وقيمته الافتراضية `/api` (تطوير محلي عبر
  بروكسي Vite كما هو الآن).
- Redis **غير مطلوب**: الكود الحالي لا يستخدمه فعلياً (قيمة `REDIS_URL` في
  الإعدادات غير مستهلَكة، وتحديد معدل الطلبات يعمل بالذاكرة). إن احتجته
  لاحقاً أضف خدمة Render Key Value واضبط `REDIS_URL` للباك إند.

---

## قبل أن تبدأ

1. حساب GitHub (أو GitLab) — Render ينشر من مستودع Git فقط، وهذا المجلد
   المحلي ليس مستودع Git بعد (الخطوة 1).
2. حساب Neon من https://neon.tech (تسجيل الدخول بحساب GitHub يكفي).
3. حساب Render من https://render.com (تسجيل الدخول بحساب GitHub يكفي).
4. أداة `psql` على جهازك (تأتي مع PostgreSQL client) — **اختيارية**: لم
   تعد لازمة لتجهيز القاعدة (الباك إند يهيّئها بنفسه عند أول تشغيل)،
   وتفيد فقط للتحقق اليدوي أو كبديل (نهاية الخطوة 3).

---

## الخطوة 1 — رفع الكود إلى GitHub

أنشئ مستودعاً جديداً (خاصاً أو عاماً) على GitHub باسم مثل `vorqon`، ثم من
مجلد المشروع:

```bash
cd vorqon-project
git init
git add .
git commit -m "VORQON production repo"
git branch -M main
git remote add origin https://github.com/<your-user>/vorqon.git
git push -u origin main
```

ملف `.gitignore` في المشروع يستبعد `.env` و`node_modules` — لا ترفع أي أسرار
أبداً؛ كل الأسرار تُدخل لاحقاً في لوحات Neon/Render فقط.

---

## الخطوة 2 — إنشاء قاعدة البيانات على Neon

1. من لوحة Neon اختر **New Project**، وسمّه `vorqon`.
2. اختر المنطقة الأقرب لخدمات Render في هذا الدليل:
   **AWS Europe Central 1 (Frankfurt)** — لأن خدمات Render أدناه مضبوطة على
   منطقة `frankfurt`، وقرب القاعدة من الخادم يعني استجابة أسرع.
3. بعد الإنشاء، من صفحة المشروع (**Dashboard → Connection string**) انسخ
   رابط الاتصال الكامل؛ شكله:
   `postgresql://<user>:<password>@<host>.aws-eu-central-1.aws.neon.tech/neondb?sslmode=require`
4. احتفظ به في مكان آمن — ستحتاجه في الخطوة 4 (قيمة `DATABASE_URL`)،
   ولا تضعه في أي ملف داخل الريبو.

---

## الخطوة 3 — تجهيز قاعدة البيانات (تلقائي عند أول تشغيل)

لا توجد خطوة يدوية هنا: الباك إند يهيّئ قاعدة البيانات بنفسه عند أول
تشغيل على Render.

- مخطط النشر (`render.yaml`) يضبط `DB_BOOTSTRAP=true` لخدمة
  `vorqon-api`، وصورة Docker (ملف `Dockerfile` في جذر الريبو) تضم
  ملفّي SQL داخل الصورة: `database/schema.sql` و
  `catalog-10000/catalog-repo.sql`.
- عند الإقلاع يعمل `backend/src/bootstrap-db.js` قبل خادم الـAPI: إن
  وجد جدول `products` ممتلئاً تخطّى كل شيء؛ وإن كانت القاعدة فارغة
  طبّق المخطط أولاً (كل الجداول والفهارس والقيود + زرع العملات الأربع
  EGP/USD/SAR/AED) ثم الكتالوج كاملاً.
- الملفان آمنان عند إعادة التطبيق (المخطط بـ `IF NOT EXISTS` وزرع
  `ON CONFLICT DO NOTHING`، والكتالوج معاملة واحدة و`ON CONFLICT DO
  NOTHING`)، فإعادة نشر الخدمة أو إعادة تشغيلها لا تكرر البيانات ولا
  تكسرها. وأي فشل في التمهيد يوقف الإقلاع برسالة خطأ واضحة في السجل
  بدل تشغيل API مكسور.
- راقب سجل أول نشر (Render ← vorqon-api ← Logs): ستجد سطوراً تبدأ بـ
  `[db-bootstrap]` تؤكد تطبيق المخطط والكتالوج وعدد المنتجات النهائي.

تحقق بعد اكتمال النشر (من محرر SQL في لوحة Neon: **SQL Editor**، أو
بـ psql إن توفر):

```sql
SELECT count(*) FROM products;    -- المتوقع: 10000
SELECT count(*) FROM categories;  -- المتوقع: 18
SELECT count(*) FROM stores;      -- المتوقع: 5
SELECT count(*) FROM currencies;  -- المتوقع: 4
```

### بديل يدوي (psql) — عند الحاجة فقط

إن أردت تجهيز القاعدة بنفسك بدل التمهيد التلقائي (أو إعادة تجهيز
قاعدة جديدة)، نفّذ المخطط أولاً من مجلد المشروع:

```bash
psql "<NEON_CONNECTION_STRING>" -f database/schema.sql
```

ثم استورد الكتالوج المحوّل كما هو موضح أدناه. وملف
`catalog-10000/products-10000.sql` مكتوب لمخطط مختلف ولا يُستورد
مباشرة على مخطط الريبو. التحويل جاهز: سكربت
`catalog-10000/convert_catalog.py` يقرأ `products-10000.csv` ويولّد
`catalog-10000/catalog-repo.sql` متوافقاً تماماً مع `database/schema.sql`:

- يزرع الأقسام الـ18 والأسماء بالعربية/الإنجليزية، وحسابات وبائعي ومتاجر
  المتاجر الخمسة (تك زون مصر، القاهرة للمنزل، ستايل أفنيو، تايم هاوس،
  متجري — بعمولة 5% وحالة approved)، والعلامات التجارية الـ16.
- يحوّل `category_slug` إلى `category_id`، والمتجر الرقمي (1–5) إلى
  `store_id`/`seller_id`، و`price_egp` إلى `price`، و`compare_at_egp` إلى
  `compare_at_price`، و`stock` إلى `stock_quantity`، واسم دولة المنشأ إلى
  `country_of_origin` (رمز ISO من حرفين)، ويولّد `slug` فريداً لكل منتج
  من اسمه الإنجليزي، والحالة `published` والعملة `EGP`.
- كل الـUUIDs حتمية (uuid5 من بذرة ثابتة) وكل INSERTs تنتهي بـ
  `ON CONFLICT DO NOTHING` — إعادة التوليد أو الاستيراد آمنة ولا تكرر
  الصفوف. حسابات البائعين المزروعة كلمات مرورها لا تعمل (للإدارة فقط).

التشغيل (التوليد مرة واحدة، ثم الاستيراد بعد تطبيق المخطط أعلاه):

```bash
python3 catalog-10000/convert_catalog.py
psql "<NEON_CONNECTION_STRING>" -f catalog-10000/catalog-repo.sql
```

تحقق سريع:

```bash
psql "<NEON_CONNECTION_STRING>" -c "SELECT count(*) FROM products;"    # المتوقع: 10000
psql "<NEON_CONNECTION_STRING>" -c "SELECT count(*) FROM categories;"  # المتوقع: 18
psql "<NEON_CONNECTION_STRING>" -c "SELECT count(*) FROM stores;"      # المتوقع: 5
```

> ملاحظة: مع التمهيد التلقائي (`DB_BOOTSTRAP=true`) لا تحتاج هذا
> البديل إطلاقاً في النشر العادي — القاعدة تُجهَّز وحدها عند أول
> تشغيل للباك إند.

> ملاحظة: ملف `seed/seed-demo.sql` بيانات **DEMO فقط** (متاجر وأقسام
> وحسابات تجريبية كلمات مرورها لا تعمل — سجّل حسابات حقيقية من الواجهة).
> لا تُحمّله في إنتاج فعلي إلا إن أردت بيئة تجربة.

---

## الخطوة 4 — النشر على Render عبر Blueprint

1. من لوحة Render اختر **New +** ثم **Blueprint**.
2. اربط حساب GitHub واختر مستودع `vorqon` — سيقرأ Render ملف
   `render.yaml` ويعرض خدمتين قبل الإنشاء:
   - `vorqon-api` — Web Service من `Dockerfile` في جذر الريبو (سياق
     البناء: جذر الريبو، لأن الصورة تضم ملفّي SQL لتمهيد القاعدة
     تلقائياً؛ خطة Free، منطقة Frankfurt، فحص صحة على `/health`).
     ملف `backend/Dockerfile` الأصلي يبقى كما هو لتشغيل
     docker-compose المحلي.
   - `vorqon-web` — Static Site يُبنى من `frontend/` وينشر من
     `frontend/dist`، مع قاعدة إعادة كتابة (Rewrite) لكل المسارات إلى
     `index.html` حتى يعمل React Router.
3. قبل تأكيد الإنشاء، املأ القيم التي لا يستطيع المخطط معرفتها
   (`sync: false`):
   - في `vorqon-api`:
     - `DATABASE_URL` = رابط اتصال Neon من الخطوة 2.
     - `FRONTEND_URL` = رابط الواجهة المتوقع:
       `https://vorqon-web.onrender.com`
     - `JWT_SECRET` — لا تدخل شيئاً؛ يولّده Render تلقائياً
       (`generateValue: true` في المخطط).
     - `DB_BOOTSTRAP=true` — مضبوط في المخطط؛ يفعّل تجهيز القاعدة
       التلقائي عند أول تشغيل (الخطوة 3).
     - `NODE_ENV=production` و`PORT=10000` مضبوطان في المخطط (الكود يقرأ
       `PORT` من البيئة فيتكيف مع Render).
   - في `vorqon-web`:
     - `VITE_API_URL` = `https://vorqon-api.onrender.com/api`
       (رابط الباك إند المتوقع + `/api`).
4. اضغط **Apply / Create** وانتظر اكتمال بناء الخدمتين.

> **إذا اختلفت الروابط الفعلية** (مثلاً اسم `vorqon-api` محجوز فأصبح
> الرابط `vorqon-api-xxxx.onrender.com`): عدّل `FRONTEND_URL` في خدمة
> الباك إند و`VITE_API_URL` في خدمة الواجهة من **Dashboard → Environment**،
> ثم أعد نشر الواجهة من **Manual Deploy → Deploy latest commit** — لأن
> `VITE_API_URL` يُدمج في حزمة الواجهة **وقت البناء**، وأي خطأ في
> `FRONTEND_URL` سيمنع المتصفح من الاتصال بالـAPI (CORS).

---

## الخطوة 5 — التحقق من التشغيل

1. **الباك إند:** افتح `https://vorqon-api.onrender.com/health`
   — الرد المتوقع: `{"ok":true,"service":"vorqon-api",...}`.
   أول طلب بعد فترة خمول قد يستغرق نحو دقيقة (انظر حدود الخطة المجانية).
2. **الواجهة:** افتح `https://vorqon-web.onrender.com` — يجب أن تظهر
   الصفحة الرئيسية والأقسام (تُجلب من الـAPI).
3. **حساب حقيقي:** سجّل حساب عميل جديد من الواجهة ثم سجّل الدخول — نجاح
   الدخول يؤكد سلامة `DATABASE_URL` و`JWT_SECRET` و`FRONTEND_URL` و
   `VITE_API_URL` معاً.
4. افتح صفحة متجر وصفحة منتج وتأكد أن التنقل بين الصفحات (روابط مباشرة)
   لا يعطي 404 — هذا يؤكد قاعدة الـRewrite.
5. **قاعدة البيانات:** في سجل أول نشر (Render ← vorqon-api ← Logs)
   تأكد من سطور `[db-bootstrap]`، ونفّذ استعلامات التحقق في الخطوة 3
   من محرر SQL في لوحة Neon (10000 منتج، 18 قسماً، 5 متاجر، 4 عملات).

---

## حدود الخطط المجانية — بصراحة

- **Render Web Service (Free):** الخدمة **تنام بعد 15 دقيقة** دون أي طلب،
  وأول طلب بعدها يستغرق **نحو دقيقة** حتى تصحو (صفحة تحميل/انتظار عند
  الزائر الأول فقط). الحد الشهري 750 ساعة تشغيل. هذا هو الثمن الحقيقي
  للمجانية في الباك إند — مناسب للتجربة والإطلاق الأول، ومزعج لمتجر
  بزيارات متقطعة على مدار اليوم.
- **Render Static Site (Free):** الواجهة **لا تنام** أبداً وتُقدَّم من شبكة
  CDN (حد نقل البيانات المجاني 100GB شهرياً) — لكنها تستدعي الباك إند
  النائم، فتظل أول استجابة بطيئة عند صحوته.
- **Neon (Free):** خطة مجانية دائمة بتخزين **1GB** — يكفي كتالوج VORQON
  الحالي بمراحل. وحدة الحوسبة (Compute) تنام هي أيضاً بعد دقائق من الخمول
  لكنها تصحو في ثوانٍ، فأثرها شبه غير ملحوظ بجانب نوم Render.
- **الدومين:** كلا الخدمتين تعملان على دومين فرعي مجاني
  `*.onrender.com` كما في الخطوات أعلاه — لا حاجة لأي شراء للإطلاق الأول.

## ربط دومين مدفوع لاحقاً (عندما تقرر)

1. اشترِ الدومين من أي مسجّل (مثلاً `vorqon.com`).
2. في Render، لكل خدمة: **Settings → Custom Domains → Add Custom Domain**
   وأدخل الدومين (للفرعي مثل `www` أو `api` أو الجذر نفسه).
3. سيعرض Render سجلات DNS المطلوبة (CNAME للدومين الفرعي، أو A/ALIAS
   للجذر) — أضفها كما هي في لوحة المسجّل، وانتظر إصدار شهادة TLS
   التلقائية (دقائق عادةً).
4. **لا تنسَ تحديث المتغيرات** وإلا انكسر الاتصال بين الواجهة والـAPI:
   - `FRONTEND_URL` في `vorqon-api` = رابط الواجهة الجديد.
   - `VITE_API_URL` في `vorqon-web` = رابط الباك إند الجديد + `/api`، ثم
     **Manual Deploy** لإعادة بناء الواجهة بالقيمة الجديدة.

## ملاحظات تشغيلية

- **الدفع والشحن** ما زالا غير مفعّلين في الكود (`PAYMENT_PROVIDER=none` و
  `SHIPPING_PROVIDER=none`) — النشر المجاني لا يغيّر ذلك؛ التفعيل يحتاج
  حسابات مزوّدين معتمدين كما في `docs/INTEGRATIONS.md`.
- أي تغيير في `render.yaml` يُطبَّق عند دفع الكود إلى GitHub وإعادة
  مزامنة الـBlueprint من لوحة Render (**Blueprint → Sync**).
- لتجاوز نوم الباك إند لاحقاً: الترقية لخطة Render مدفوعة لأي خدمة ويب
  (تبدأ من 7 دولارات شهرياً) تلغي النوم تماماً، دون تغيير أي سطر في هذا
  الدليل.
