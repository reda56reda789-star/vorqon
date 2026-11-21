-- ============================================================================
-- VORQON — BEYOND POSSIBILITIES | PostgreSQL schema
-- اللغة الافتراضية: العربية (ar) — English supported (en)
-- كل كيان قابل للترجمة يحمل name_ar / name_en (+ description_ar / description_en)
-- العملات المدعومة: EGP (الأساسية) ، USD ، SAR ، AED
-- لا تُخزَّن بيانات بطاقات بنكية إطلاقاً في هذا المخطط.
-- PostgreSQL 16+ . Run: psql -U vorqon -d vorqon -f database/schema.sql
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- بحث نصي تقريبي (تصحيح إملائي جزئي)
CREATE EXTENSION IF NOT EXISTS citext;     -- users.email من نوع CITEXT

-- ---------------------------------------------------------------- types
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('customer','seller','admin','staff');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('active','suspended','pending_verification','banned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE seller_status AS ENUM ('pending','approved','rejected','suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE product_status AS ENUM ('draft','pending_review','published','rejected','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('pending','confirmed','preparing','shipped','delivered','cancelled','refunded','returned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending','paid','failed','refunded','cash_on_delivery');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE payout_status AS ENUM ('pending','approved','paid','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------- currencies
CREATE TABLE IF NOT EXISTS currencies (
  code        CHAR(3) PRIMARY KEY,                    -- EGP, USD, SAR, AED
  name_ar     VARCHAR(100) NOT NULL,                  -- جنيه مصري
  name_en     VARCHAR(100) NOT NULL,                  -- Egyptian Pound
  symbol      VARCHAR(10) NOT NULL,                   -- ج.م / $ / ر.س / د.إ
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS exchange_rates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency   CHAR(3) NOT NULL REFERENCES currencies(code),
  to_currency     CHAR(3) NOT NULL REFERENCES currencies(code),
  rate            NUMERIC(18,6) NOT NULL CHECK (rate > 0),
  source          VARCHAR(100) NOT NULL DEFAULT 'admin', -- admin | provider
  effective_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_currency, to_currency, effective_at)
);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_pair ON exchange_rates(from_currency, to_currency, effective_at DESC);

-- ---------------------------------------------------------------- users & addresses
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT UNIQUE NOT NULL,
  phone           VARCHAR(30),
  password_hash   TEXT NOT NULL,                      -- bcrypt فقط، لا نص صريح أبداً
  full_name       VARCHAR(200) NOT NULL,
  role            user_role NOT NULL DEFAULT 'customer',
  status          user_status NOT NULL DEFAULT 'active',
  language        CHAR(2) NOT NULL DEFAULT 'ar' CHECK (language IN ('ar','en')),
  currency        CHAR(3) NOT NULL DEFAULT 'EGP' REFERENCES currencies(code),
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  failed_logins   INT NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS addresses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label         VARCHAR(50) NOT NULL DEFAULT 'home', -- home | work | other
  full_name     VARCHAR(200) NOT NULL,
  phone         VARCHAR(30) NOT NULL,
  country       CHAR(2) NOT NULL DEFAULT 'EG',       -- ISO 3166-1 alpha-2
  city          VARCHAR(100) NOT NULL,
  area          VARCHAR(100),
  street        VARCHAR(255) NOT NULL,
  building      VARCHAR(50),
  postal_code   VARCHAR(20),
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);

-- ---------------------------------------------------------------- sellers & stores
CREATE TABLE IF NOT EXISTS sellers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  business_name_ar    VARCHAR(200) NOT NULL,
  business_name_en    VARCHAR(200),
  tax_number          VARCHAR(50),
  national_id         VARCHAR(50),
  status              seller_status NOT NULL DEFAULT 'pending',
  verification_notes  TEXT,
  commission_rate     NUMERIC(5,2) NOT NULL DEFAULT 5.00 CHECK (commission_rate >= 0 AND commission_rate <= 100),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS stores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id       UUID NOT NULL UNIQUE REFERENCES sellers(id) ON DELETE CASCADE,
  slug            VARCHAR(120) UNIQUE NOT NULL,
  name_ar         VARCHAR(200) NOT NULL,
  name_en         VARCHAR(200) NOT NULL,
  description_ar  TEXT,
  description_en  TEXT,
  logo_url        TEXT,
  banner_url      TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  rating_avg      NUMERIC(3,2) NOT NULL DEFAULT 0 CHECK (rating_avg >= 0 AND rating_avg <= 5),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stores_slug ON stores(slug);
CREATE INDEX IF NOT EXISTS idx_stores_seller ON stores(seller_id);

-- ---------------------------------------------------------------- categories (tree, expandable) & brands
CREATE TABLE IF NOT EXISTS categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id       UUID REFERENCES categories(id) ON DELETE SET NULL, -- NULL = قسم رئيسي
  slug            VARCHAR(120) UNIQUE NOT NULL,
  name_ar         VARCHAR(200) NOT NULL,
  name_en         VARCHAR(200) NOT NULL,
  description_ar  TEXT,
  description_en  TEXT,
  icon_url        TEXT,
  sort_order      INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);

CREATE TABLE IF NOT EXISTS brands (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        VARCHAR(120) UNIQUE NOT NULL,
  name_ar     VARCHAR(200) NOT NULL,
  name_en     VARCHAR(200) NOT NULL,
  logo_url    TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- products
CREATE TABLE IF NOT EXISTS products (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id           UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  store_id            UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category_id         UUID NOT NULL REFERENCES categories(id),
  brand_id            UUID REFERENCES brands(id) ON DELETE SET NULL,
  sku                 VARCHAR(100) UNIQUE NOT NULL,
  model_number        VARCHAR(100),
  name_ar             VARCHAR(300) NOT NULL,
  name_en             VARCHAR(300) NOT NULL,
  slug                VARCHAR(320) UNIQUE NOT NULL,
  description_ar      TEXT,
  description_en      TEXT,
  specs               JSONB NOT NULL DEFAULT '{}'::jsonb,  -- مواصفات فنية حرة
  dimensions          VARCHAR(100),
  weight_grams        INT CHECK (weight_grams >= 0),
  materials_ar        TEXT,
  materials_en        TEXT,
  country_of_origin   CHAR(2),                              -- EG, CN, TR ...
  price               NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  compare_at_price    NUMERIC(12,2) CHECK (compare_at_price IS NULL OR compare_at_price >= price),
  currency            CHAR(3) NOT NULL DEFAULT 'EGP' REFERENCES currencies(code),
  stock_quantity      INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  status              product_status NOT NULL DEFAULT 'draft',
  warranty_months     INT NOT NULL DEFAULT 0 CHECK (warranty_months >= 0),
  package_contents_ar TEXT,
  package_contents_en TEXT,
  usage_ar            TEXT,
  usage_en            TEXT,
  maintenance_ar      TEXT,
  maintenance_en      TEXT,
  is_featured         BOOLEAN NOT NULL DEFAULT FALSE,
  rating_avg          NUMERIC(3,2) NOT NULL DEFAULT 0 CHECK (rating_avg >= 0 AND rating_avg <= 5),
  rating_count        INT NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  sold_count          INT NOT NULL DEFAULT 0 CHECK (sold_count >= 0),
  view_count          INT NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
CREATE INDEX IF NOT EXISTS idx_products_search_trgm ON products USING gin ((name_ar || ' ' || name_en || ' ' || sku) gin_trgm_ops);

CREATE TABLE IF NOT EXISTS product_variants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku             VARCHAR(100) UNIQUE NOT NULL,
  color_ar        VARCHAR(50),
  color_en        VARCHAR(50),
  size_value      VARCHAR(50),
  price_override  NUMERIC(12,2) CHECK (price_override IS NULL OR price_override >= 0),
  stock_quantity  INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);

CREATE TABLE IF NOT EXISTS product_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  alt_ar      VARCHAR(255),
  alt_en      VARCHAR(255),
  sort_order  INT NOT NULL DEFAULT 0,
  is_main     BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_images_product ON product_images(product_id);

CREATE TABLE IF NOT EXISTS inventory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID REFERENCES products(id) ON DELETE CASCADE,
  variant_id      UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity_change INT NOT NULL,                           -- + شراء / - بيع
  reason          VARCHAR(100) NOT NULL,                  -- sale | restock | return | adjustment
  reference_id    UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (product_id IS NOT NULL OR variant_id IS NOT NULL)
);

-- ---------------------------------------------------------------- cart
CREATE TABLE IF NOT EXISTS carts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL = ضيف
  session_id  VARCHAR(100),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cart_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id     UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id  UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity    INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  UNIQUE (cart_id, product_id, variant_id)
);

-- ---------------------------------------------------------------- orders: parent + sub-orders per seller
CREATE TABLE IF NOT EXISTS orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_order_id       UUID REFERENCES orders(id) ON DELETE CASCADE, -- NULL = طلب رئيسي
  order_number          VARCHAR(30) UNIQUE NOT NULL,                  -- VQ-2026-000001
  user_id               UUID REFERENCES users(id),                    -- NULL = طلب ضيف (guest checkout)
  guest_name            VARCHAR(200),                                 -- بيانات الضيف — تُملأ عند غياب user_id
  guest_phone           VARCHAR(30),
  guest_city            VARCHAR(100),
  guest_address         TEXT,
  seller_id             UUID REFERENCES sellers(id),                   -- NULL في الطلب الرئيسي
  address_id            UUID REFERENCES addresses(id) ON DELETE SET NULL,
  status                order_status NOT NULL DEFAULT 'pending',
  payment_status        payment_status NOT NULL DEFAULT 'pending',
  payment_method_code   VARCHAR(50),                                  -- cod | card | fawry | wallet ...
  currency              CHAR(3) NOT NULL DEFAULT 'EGP' REFERENCES currencies(code),
  exchange_rate_used    NUMERIC(18,6) NOT NULL DEFAULT 1,             -- سعر الصرف وقت الطلب
  subtotal              NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_total        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  tax_total             NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  shipping_total        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (shipping_total >= 0),
  grand_total           NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
  coupon_code           VARCHAR(50),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((parent_order_id IS NULL AND seller_id IS NULL) OR (parent_order_id IS NOT NULL AND seller_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_parent ON orders(parent_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE, -- الطلب الفرعي
  product_id      UUID NOT NULL REFERENCES products(id),
  variant_id      UUID REFERENCES product_variants(id),
  seller_id       UUID NOT NULL REFERENCES sellers(id),
  name_ar         VARCHAR(300) NOT NULL,                  -- لقطة وقت الشراء
  name_en         VARCHAR(300) NOT NULL,
  sku             VARCHAR(100) NOT NULL,
  unit_price      NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  quantity        INT NOT NULL CHECK (quantity > 0),
  line_total      NUMERIC(12,2) NOT NULL CHECK (line_total >= 0),
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  commission_amt  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (commission_amt >= 0)
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_seller ON order_items(seller_id);

-- ---------------------------------------------------------------- commissions, balances, payouts
CREATE TABLE IF NOT EXISTS commissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id       UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  category_id     UUID REFERENCES categories(id) ON DELETE SET NULL, -- NULL = نسبة افتراضية للبائع
  rate_percent    NUMERIC(5,2) NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 50),
  effective_from  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS seller_balances (
  seller_id       UUID PRIMARY KEY REFERENCES sellers(id) ON DELETE CASCADE,
  balance_egp     NUMERIC(12,2) NOT NULL DEFAULT 0,
  pending_egp     NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payouts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id       UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  amount_egp      NUMERIC(12,2) NOT NULL CHECK (amount_egp > 0),
  method          VARCHAR(50) NOT NULL,                  -- bank_transfer | wallet | instapay
  account_ref     VARCHAR(100),                           -- مرجع الحساب فقط، لا بيانات حساسة كاملة
  status          payout_status NOT NULL DEFAULT 'pending',
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at    TIMESTAMPTZ
);

-- ---------------------------------------------------------------- coupons, reviews, Q&A
CREATE TABLE IF NOT EXISTS coupons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(50) UNIQUE NOT NULL,
  discount_type   VARCHAR(20) NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value  NUMERIC(12,2) NOT NULL CHECK (discount_value > 0),
  min_order_egp   NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_uses        INT,
  used_count      INT NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  valid_from      TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until     TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id    UUID REFERENCES orders(id) ON DELETE SET NULL,
  rating      INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title       VARCHAR(200),
  body        TEXT,
  is_verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, user_id, order_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE TABLE IF NOT EXISTS questions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question    TEXT NOT NULL,
  answer      TEXT,
  answered_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- shipping, returns, complaints
CREATE TABLE IF NOT EXISTS shipping_zones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar       VARCHAR(150) NOT NULL,
  name_en       VARCHAR(150) NOT NULL,
  countries     CHAR(2)[] NOT NULL DEFAULT '{}',          -- ['EG','SA','AE']
  base_fee_egp  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (base_fee_egp >= 0),
  per_kg_egp    NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (per_kg_egp >= 0),
  eta_days_min  INT NOT NULL DEFAULT 1,
  eta_days_max  INT NOT NULL DEFAULT 3,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS shipments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE, -- الطلب الفرعي
  provider_code   VARCHAR(50) NOT NULL,                   -- aramex | dhl | local (بعد التفعيل فقط)
  tracking_number VARCHAR(100),
  status          VARCHAR(50) NOT NULL DEFAULT 'label_created',
  shipped_at      TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shipments_order ON shipments(order_id);
CREATE TABLE IF NOT EXISTS returns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  reason_ar   TEXT NOT NULL,
  reason_en   TEXT,
  status      VARCHAR(50) NOT NULL DEFAULT 'requested',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS complaints (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  order_id    UUID REFERENCES orders(id) ON DELETE SET NULL,
  subject     VARCHAR(200) NOT NULL,
  body        TEXT NOT NULL,
  status      VARCHAR(50) NOT NULL DEFAULT 'open',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- payments (metadata only — no card data)
CREATE TABLE IF NOT EXISTS payment_methods (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          VARCHAR(50) UNIQUE NOT NULL,              -- cod | card | meeza | fawry | vodafone_cash ...
  name_ar       VARCHAR(150) NOT NULL,
  name_en       VARCHAR(150) NOT NULL,
  provider      VARCHAR(100),                             -- paymob | stripe | fawry ...
  is_active     BOOLEAN NOT NULL DEFAULT FALSE,            -- FALSE حتى التفعيل بمفاتيح حقيقية
  is_cod        BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider            VARCHAR(100) NOT NULL,
  provider_ref        VARCHAR(200),                       -- مرجع المزود فقط
  method_code         VARCHAR(50) NOT NULL REFERENCES payment_methods(code),
  amount_egp          NUMERIC(12,2) NOT NULL CHECK (amount_egp >= 0),
  currency            CHAR(3) NOT NULL DEFAULT 'EGP' REFERENCES currencies(code),
  status              payment_status NOT NULL DEFAULT 'pending',
  -- لا توجد هنا أي أعمدة لرقم البطاقة أو CVV أو تاريخ الانتهاء — ممنوع تخزينها.
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- notifications, audit, favourites, views
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_ar    VARCHAR(255) NOT NULL,
  title_en    VARCHAR(255) NOT NULL,
  body_ar     TEXT,
  body_en     TEXT,
  type        VARCHAR(50) NOT NULL DEFAULT 'general',
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(100) NOT NULL,                      -- order.create | payout.approve ...
  entity_type VARCHAR(50) NOT NULL,
  entity_id   UUID,
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
CREATE TABLE IF NOT EXISTS favourites (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);
CREATE TABLE IF NOT EXISTS recently_viewed (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

-- ---------------------------------------------------------------- seed currencies (EGP default)
INSERT INTO currencies (code, name_ar, name_en, symbol, is_default) VALUES
  ('EGP','جنيه مصري','Egyptian Pound','ج.م', TRUE),
  ('USD','دولار أمريكي','US Dollar','$', FALSE),
  ('SAR','ريال سعودي','Saudi Riyal','ر.س', FALSE),
  ('AED','درهم إماراتي','UAE Dirham','د.إ', FALSE)
ON CONFLICT (code) DO NOTHING;

-- ملاحظة: ملف المتجر.html المذكور في البرومبت الأصلي لم يصل إلى مساحة العمل،
-- لذا بُني هذا المخطط من الصفر دون نسخ أي محتوى خارجي.
