# VORQON — BEYOND POSSIBILITIES
# فوركون — ما وراء الإمكانيات

> **اللغة الافتراضية: العربية (RTL) — مع دعم كامل للإنجليزية (LTR).**
> **Default language: Arabic (RTL) — full English (LTR) support.**
>
> منصة Marketplace عالمية متعددة البائعين — Multi-vendor global marketplace.
> تبدأ من مصر والعالم العربي، وتتوسع إلى الأسواق العالمية.

---

## 1. ما هذا المشروع؟ | What is this?

**العربية:**
مستودع إنتاجي كامل لمنصة VORQON: واجهة أمامية، Backend حقيقي، قاعدة بيانات PostgreSQL،
API موثق، نظام بائعين، تقسيم الطلبات حسب البائع، عمولات ومستحقات، سلة ودفع وشحن
(جاهزة للربط — غير مفعّلة حتى توفير مفاتيح مزود معتمد، انظر `docs/INTEGRATIONS.md`).

**English:**
A production-ready repository for the VORQON marketplace: frontend, real backend,
PostgreSQL database, documented API, seller system, per-seller order splitting,
commissions and payouts, cart / payments / shipping (integration-ready — **not**
activated until a licensed provider's keys are supplied, see `docs/INTEGRATIONS.md`).

**لا توجد بيانات بطاقات مخزّنة أبداً. No card data is ever stored.**
**لا يوجد محتوى منسوخ من Amazon أو غيرها. No content copied from Amazon or others.**

---

## 2. التقنية المختارة ولماذا | Tech stack & why

| الطبقة / Layer | التقنية | لماذا؟ / Why |
|---|---|---|
| Backend | **Node.js + Express** | سريع، JavaScript موحّد مع الواجهة، نظام بيئي ضخم، سهل النشر والتوظيف |
| قاعدة البيانات | **PostgreSQL + Prisma ORM** | علاقات معقدة (طلبات فرعية، عمولات، مخزون) تحتاج ACID + قيود FK قوية؛ Prisma يمنع SQL Injection عبر الاستعلامات المُعامَلة ويعطي typing آمن |
| الواجهة | **React + Vite** | أداء عالٍ، HMR سريع، مكوّنات قابلة لإعادة الاستخدام، دعم i18n و RTL/LTR |
| الترجمة | **i18next + حقول `name_ar / name_en`** | كل قسم ومنتج له اسم عربي وإنجليزي في قاعدة البيانات نفسها |
| التخزين المؤقت / الطوابير | **Redis** | جلسات، تحديد معدل الطلبات، وطوابير إشعارات/بريد |
| الحاويات | **Docker Compose** | بيئة dev/prod متطابقة: app + postgres + redis بأمر واحد |
| المصادقة | **JWT + bcrypt** | كلمات مرور مشفّرة (bcrypt)، صلاحيات RBAC: customer / seller / admin / staff |

**لماذا ليست صفحة HTML واحدة؟**
لأن Marketplace حقيقي يحتاج معاملات مالية، صلاحيات منفصلة لكل بائع، وتقسيم طلبات —
وهذا لا يمكن تنفيذه بأمان في ملف HTML ثابت.

---

## 3. بنية المستودع | Repository structure

```
vorqon-project/
├── README.md
├── .env.example                 # نموذج إعدادات — بلا أسرار حقيقية
├── docker-compose.yml           # app + postgres + redis
├── database/
│   └── schema.sql               # مخطط PostgreSQL الكامل (i18n + عملات + عمولات)
├── backend/
│   ├── package.json
│   ├── prisma/schema.prisma     # نموذج Prisma المطابق لـ schema.sql
│   └── src/
│       ├── server.js            # نقطة الدخول، Helmet/CORS/CSRF/Rate-limit
│       ├── config.js
│       ├── middleware/          # auth.js, rbac.js, errorHandler.js, rateLimit.js
│       ├── routes/              # auth, categories, products, sellers, cart,
│       │                        # orders, admin, payments, shipping
│       ├── services/            # orders.js (تقسيم الطلبات), commissions.js,
│       │                        # currency.js, payments.js (واجهة مزود فقط)
│       └── utils/               # db.js, security.js, i18n.js, pagination.js
├── frontend/
│   ├── package.json             # React + Vite + i18next
│   ├── vite.config.js
│   ├── index.html
│   └── src/                     # App.jsx, i18n/, pages/, components/
├── seed/
│   └── seed-demo.sql            # بيانات DEMO فقط — 18 قسماً، بائعون ومنتجات مصرية/عربية
└── docs/
    ├── API.md                   # توثيق REST API ثنائي اللغة
    ├── INTEGRATIONS.md          # التكاملات — كلها: غير مفعّلة، جاهزة للربط فقط
    └── REPORT.md                # ما نُفّذ فعلاً وما يحتاج مفاتيح خارجية
```

---

## 4. اللغات والعملات | Languages & currencies

- **اللغات:** العربية `ar` (افتراضية، RTL) والإنجليزية `en` (LTR). كل كيان قابل للترجمة
  يحمل `name_ar` و `name_en` و `description_ar` و `description_en` و `slug`.
  تبديل اللغة يغيّر `dir` تلقائياً. إضافة لغة ثالثة = عمود جديد + ملف ترجمة، بلا تغيير بنيوي.
- **العملات:** `EGP` (الأساسية في مصر) و `USD` و `SAR` و `AED`.
  جدولا `currencies` و `exchange_rates` يخزنان سعر الصرف المستخدم وقت الطلب
  (`exchange_rate_used`)، والعملة الأصلية للمنتج محفوظة دائماً.
  الأسعار تُحفظ بالعملة الأصلية وتُعرض بعد التحويل — لا يُعاد حساب طلب قديم بسعر صرف جديد.

---

## 5. التثبيت والتشغيل | Installation & running

### المتطلبات | Requirements
- Node.js 20+ ، npm 10+
- Docker + Docker Compose (للطريقة الأسهل)، أو PostgreSQL 16+ و Redis 7+ محلياً

### الطريقة 1 — Docker (موصى بها) | Docker (recommended)

```bash
git clone <repo-url> vorqon-project
cd vorqon-project
cp .env.example .env          # عدّل القيم — لا تضع أسراراً حقيقية في git
docker compose up --build     # app على :3000 ، postgres على :5432 ، redis على :6379
# تطبيق المخطط:
docker compose exec app npm run db:migrate
# بيانات تجريبية DEMO فقط (اختياري، وليست للإنتاج):
docker compose exec postgres psql -U vorqon -d vorqon -f /seed/seed-demo.sql
```

### الطريقة 2 — تشغيل محلي | Local

```bash
cp .env.example .env
# عدّل DATABASE_URL في .env ليشير إلى PostgreSQL المحلي
cd backend && npm install && npm run db:migrate && npm run dev   # :3000
cd ../frontend && npm install && npm run dev                      # :5173
```

### الإنتاج | Production

```bash
cd backend && npm ci --omit=dev && npm run build && npm start
cd ../frontend && npm ci && npm run build   # ينتج dist/ تُقدَّم عبر Nginx/CDN
# متغيرات إلزامية في الإنتاج: NODE_ENV=production ، JWT_SECRET قوي (32+ حرفاً)،
# DATABASE_URL عبر SSL، SESSION/COOKIE آمنة، CORS_ORIGIN = دومينك فقط.
```

### أوامر مفيدة | Useful commands

```bash
cd backend
npm run dev          # nodemon
npm run db:migrate   # prisma migrate deploy
npm run db:studio    # Prisma Studio لفحص البيانات
npm test             # اختبارات الوحدة (إن وُجدت)
```

---

## 6. النشر على استضافة + دومين | Deployment

1. **استضافة:** أي VPS (Hetzner / DigitalOcean / Contabo) أو PaaS (Render / Railway / Fly.io).
   الحد الأدنى: 2 vCPU ، 4 GB RAM ، 20 GB SSD.
2. **الدومين:** اربط `vorqon.com` (مثال) بسجل A إلى IP الخادم، و `api.vorqon.com` للـ Backend.
3. **HTTPS:** شهادة مجانية عبر Certbot / Let's Encrypt على Nginx — إلزامي قبل أي دفع.
4. **قاعدة البيانات:** PostgreSQL مُدار أو حاوية منفصلة مع نسخ احتياطي يومي (`pg_dump` + تخزين خارجي).
5. **البيئة:** انسخ `.env.example` إلى `.env` على الخادم فقط، واملأ الأسرار من مدير أسرار
   (لا تُرسل `.env` إلى git أبداً — محمي في `.gitignore`).
6. **النشر:** `docker compose -f docker-compose.yml up -d --build` ثم
   `docker compose exec app npm run db:migrate`.
7. **بعد النشر:** فعّل بوابة دفع معتمدة وشركة شحن من `docs/INTEGRATIONS.md` قبل قبول أي طلب حقيقي.

---

## 7. الأمان | Security

- كلمات المرور: bcrypt (cost 12)، ولا تُخزَّن أبداً كنص صريح.
- JWT قصير العمر + Refresh Token، وحماية CSRF للكوكيز.
- Helmet، CORS مقيّد، تحديد معدل محاولات الدخول (5 محاولات / 15 دقيقة).
- Prisma / استعلامات مُعامَلة = حماية من SQL Injection؛ تعقيم المدخلات = حماية من XSS.
- سجل تدقيق `audit_logs` لكل عملية إدارية ومالية.
- **لا تُخزَّن بيانات البطاقات في قاعدة البيانات إطلاقاً** — الدفع عبر صفحة مزود معتمد فقط.

## 8. الترخيص | License

مشروع خاص بعلامة VORQON. جميع النصوص والمنتجات في `seed/` بيانات تجريبية أصلية
(DEMO) وليست منسوخة من أي متجر آخر.
