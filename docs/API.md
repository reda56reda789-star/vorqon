# VORQON API — REST Documentation | توثيق REST API

> **Base URL:** `http://localhost:3000/api` (dev) — `https://api.vorqon.example/api` (prod)
> **Default language / اللغة الافتراضية:** العربية `ar` (RTL) — English `en` supported.
> اللغة عبر `?lang=ar|en` أو ترويسة `Accept-Language`. كل كيان مترجم يعيد
> `name_ar` و `name_en` معاً، وحقل `name` المحسوب حسب اللغة المطلوبة.
> **Auth:** `Authorization: Bearer <access_token>` (JWT, 15m) + Refresh Token (7d).
> **Currencies / العملات:** `EGP` (default) ، `USD` ، `SAR` ، `AED`.
> **Errors / الأخطاء:** `{ "error": "..." }` مع رموز HTTP القياسية (400/401/403/404/423/503).

---

## 1. Health | الصحة

```http
GET /health
```
```json
{ "ok": true, "service": "vorqon-api", "lang": "ar" }
```

---

## 2. Auth | المصادقة — `POST /api/auth/*`

### POST /api/auth/register — إنشاء حساب
```http
POST /api/auth/register
Content-Type: application/json
{ "email": "ahmed@example.com", "password": "StrongPass123", "fullName": "أحمد محمد", "role": "customer", "language": "ar", "currency": "EGP" }
```
`role` يقبل `customer` أو `seller` فقط — لا يمكن تسجيل `admin` ذاتياً.
```json
// 201 Created
{ "user": { "id": "uuid", "email": "ahmed@example.com", "fullName": "أحمد محمد", "role": "customer" }, "access": "eyJ...", "refresh": "eyJ..." }
```

### POST /api/auth/login — تسجيل الدخول
```http
POST /api/auth/login
{ "email": "ahmed@example.com", "password": "StrongPass123" }
```
- 5 محاولات فاشلة = قفل 15 دقيقة → `423 Locked`.
```json
// 200 OK
{ "user": { "id": "uuid", "email": "ahmed@example.com", "role": "customer" }, "access": "eyJ...", "refresh": "eyJ..." }
```

### GET /api/auth/me — حسابي (Bearer مطلوب)
```json
// 200 OK
{ "user": { "id": "uuid", "email": "ahmed@example.com", "fullName": "أحمد محمد", "role": "customer", "language": "ar", "currency": "EGP" } }
```

---

## 3. Categories | الأقسام — `GET /api/categories`

```http
GET /api/categories?lang=ar
GET /api/categories?root=true
GET /api/categories/electronics-phones
```
```json
// 200 OK
{ "categories": [ { "id": "uuid", "parent_id": null, "slug": "electronics-phones", "name_ar": "الإلكترونيات والهواتف", "name_en": "Electronics & Phones", "name": "الإلكترونيات والهواتف", "sort_order": 1 } ] }
```

### POST /api/categories — إنشاء قسم (admin فقط)
```http
POST /api/categories
Authorization: Bearer <admin_token>
{ "slug": "smart-home", "name_ar": "المنزل الذكي", "name_en": "Smart Home", "parent_id": null }
```
```json
// 201 Created
{ "category": { "id": "uuid", "slug": "smart-home", "name_ar": "المنزل الذكي", "name_en": "Smart Home" } }
```

---

## 4. Products | المنتجات — `GET /api/products`

```http
GET /api/products?q=هاتف&category=<uuid>&min_price=1000&max_price=10000&min_rating=4&in_stock=true&sort=best_selling&page=1&limit=20&lang=ar
```
الترتيب `sort`: `newest` (افتراضي) | `price_asc` | `price_desc` | `rating` | `best_selling`.
```json
// 200 OK
{
  "products": [ { "id": "uuid", "sku": "VQ-PHN-001", "name_ar": "هاتف ذكي نايل تك X100", "name_en": "Nile Tech X100 Smartphone", "name": "هاتف ذكي نايل تك X100", "price": 8999.00, "currency": "EGP", "stock_quantity": 25, "rating_avg": 0 } ],
  "meta": { "total": 1, "page": 1, "limit": 20, "pages": 1 }
}
```

### GET /api/products/:slug — تفاصيل المنتج
```json
// 200 OK
{ "product": { "id": "uuid", "name_ar": "هاتف ذكي نايل تك X100", "name_en": "Nile Tech X100 Smartphone", "price": 8999.00, "currency": "EGP", "images": [], "variants": [], "reviews": [] } }
```

### POST /api/products — إضافة منتج (seller فقط، يذهب إلى `pending_review`)
```http
POST /api/products
Authorization: Bearer <seller_token>
{ "name_ar": "هاتف ذكي", "name_en": "Smartphone", "slug": "smartphone-x", "sku": "VQ-PHN-099", "price": 7999, "currency": "EGP", "category_id": "<uuid>", "stock_quantity": 10 }
```

### POST /api/products/:id/reviews — تقييم (1–5)
```http
POST /api/products/<id>/reviews
Authorization: Bearer <token>
{ "rating": 5, "body": "منتج ممتاز" }
```

---

## 5. Sellers | البائعون — `/api/sellers`

```http
GET /api/sellers/stores/nile-electronics
```
```json
{ "store": { "slug": "nile-electronics", "name_ar": "متجر النيل للإلكترونيات", "name_en": "Nile Electronics Store" }, "products": [] }
```

```http
GET /api/sellers/me/dashboard        # seller فقط — إحصائياتي ورصيدي
GET /api/sellers/me/orders           # seller فقط — طلباتي الفرعية فقط
POST /api/sellers/me/payouts         # seller فقط
Authorization: Bearer <seller_token>
{ "amount_egp": 5000, "method": "bank_transfer", "account_ref": "****1234" }
```

---

## 6. Cart | السلة — `/api/cart` (Bearer مطلوب)

```http
GET /api/cart
POST /api/cart/items   { "product_id": "<uuid>", "quantity": 2 }
DELETE /api/cart/items/<id>
```
```json
// GET 200 OK
{ "items": [ { "product_id": "uuid", "name_ar": "هاتف ذكي نايل تك X100", "name_en": "Nile Tech X100 Smartphone", "price": 8999.00, "currency": "EGP", "quantity": 2 } ], "subtotal": 17998.00 }
```

---

## 7. Orders | الطلبات — `/api/orders` (Bearer مطلوب)

### POST /api/orders/checkout — إتمام الشراء (يقسّم الطلب حسب البائع)
الأسعار تُحسب من الخادم من السلة — لا تُقبل أسعار من العميل.
```http
POST /api/orders/checkout
{ "address_id": "<uuid>", "currency": "EGP", "coupon_code": "VORQON10" }
```
```json
// 201 Created
{
  "parentOrder": { "id": "uuid", "orderNumber": "VQ-2026-000001", "grandTotal": 17998.00 },
  "subOrders": [ { "id": "uuid", "orderNumber": "VQ-2026-000002", "sellerId": "uuid", "grandTotal": 17998.00 } ]
}
```

```http
GET /api/orders            # طلباتي الرئيسية
GET /api/orders/<id>       # طلب رئيسي + طلباته الفرعية + عناصره
```

---

## 8. Admin | الإدارة — `/api/admin` (admin/staff فقط)

```http
GET   /api/admin/stats                    # المبيعات، الطلبات، العملاء، البائعون، العمولات
GET   /api/admin/sellers?status=pending   # مراجعة تسجيلات البائعين
PATCH /api/admin/sellers/<id>/approve     # admin فقط
PATCH /api/admin/sellers/<id>/reject      # admin فقط
PATCH /api/admin/products/<id>/approve    # اعتماد منتج (published)
PATCH /api/admin/payouts/<id>/approve     # اعتماد تحويل أرباح (admin فقط)
POST  /api/admin/coupons                  # { "code": "VORQON10", "discount_type": "percent", "discount_value": 10 }
```

---

## 9. Payments | الدفع — `/api/payments`

> **الحالة: غير مفعّلة (not configured).** انظر `docs/INTEGRATIONS.md`.
> لا تُرسل بيانات بطاقات إلى هذه المسارات أبداً.

```http
GET  /api/payments/methods
POST /api/payments/checkout-session   # 503 { "error": "Payment provider is not configured", "status": "not_configured" }
POST /api/payments/webhook            # callback من المزود بعد التفعيل
```

## 10. Shipping | الشحن — `/api/shipping`

```http
GET /api/shipping/quote?country=EG&weight_kg=1.5
```
```json
// 200 OK — تقدير منطقة فقط، بلا تتبع حي حتى تفعيل شركة شحن
{ "quote": { "feeEgp": 45.00, "etaDaysMin": 1, "etaDaysMax": 3, "zone": { "name_ar": "داخل مصر", "name_en": "Inside Egypt" } }, "liveTracking": false }
```

```http
GET /api/shipping/track/<tracking_number>   # حالة الشحنة المخزنة فقط
```

---

## 11. Pagination | ترقيم الصفحات

كل القوائم تقبل `?page=1&limit=20` (الحد الأقصى 100) وتعيد:
```json
{ "meta": { "total": 120, "page": 1, "limit": 20, "pages": 6 } }
```
