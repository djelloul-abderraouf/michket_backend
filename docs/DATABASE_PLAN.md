# Database Plan — Michket Backend

Base de données: Supabase (PostgreSQL 15+)
ORM: Drizzle ORM

## Schéma de tables

### users
| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | ID unique |
| email | text | UNIQUE, NOT NULL | Email login |
| password_hash | text | NOT NULL | Hash bcrypt (Supabase gère) |
| first_name | text | | Prénom |
| last_name | text | | Nom |
| phone | text | | Téléphone |
| role | enum | default 'customer' | customer/admin/super_admin |
| is_active | boolean | default true | Compte actif |
| created_at | timestamptz | default now() | |
| updated_at | timestamptz | default now() | |

### addresses
| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| user_id | uuid | FK users.id, NOT NULL | |
| label | text | | "Domicile", "Bureau" |
| first_name | text | NOT NULL | |
| last_name | text | NOT NULL | |
| phone | text | NOT NULL | |
| address_line_1 | text | NOT NULL | |
| address_line_2 | text | | Complément |
| wilaya_code | integer | NOT NULL | Code wilaya (1-58) |
| wilaya_name | text | NOT NULL | |
| commune | text | NOT NULL | |
| is_default | boolean | default false | |
| created_at | timestamptz | default now() | |

### categories
| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| name | text | NOT NULL | "Lampes 3D" |
| slug | text | UNIQUE, NOT NULL | "lampes-3d" |
| description | text | | |
| image_url | text | | URL image catégorie |
| href | text | | Route frontend |
| parent_id | uuid | FK categories.id | Catégorie parente |
| is_active | boolean | default true | |
| sort_order | integer | default 0 | |
| meta_title | text | | SEO |
| meta_description | text | | SEO |
| created_at | timestamptz | default now() | |
| updated_at | timestamptz | default now() | |

### products
| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| name | text | NOT NULL | Nom produit |
| slug | text | UNIQUE, NOT NULL | URL slug |
| description | text | | Description longue |
| short_description | text | | Description courte |
| category_id | uuid | FK categories.id, NOT NULL | |
| price_cents | integer | NOT NULL | Prix en centimes DZD |
| compare_at_price_cents | integer | | Prix barré |
| currency | text | default 'DZD' | Devise |
| badge | enum | | BEST_SELLER/NOUVEAU/PROMO/PERSONNALISABLE/ENVOI_GRATUIT |
| occasions | text[] | | Tableau d'occasions |
| is_active | boolean | default true | |
| is_personalizable | boolean | default false | |
| personalization_prompt | text | | Instructions personnalisation |
| meta_title | text | | SEO |
| meta_description | text | | SEO |
| rating_avg | numeric(3,2) | | Moyenne avis |
| rating_count | integer | default 0 | Nombre d'avis |
| created_at | timestamptz | default now() | |
| updated_at | timestamptz | default now() | |

### product_images
| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| product_id | uuid | FK products.id, NOT NULL | |
| url | text | NOT NULL | URL image |
| alt_text | text | | Texte alternatif |
| sort_order | integer | default 0 | |
| is_primary | boolean | default false | Image principale |
| created_at | timestamptz | default now() | |

### product_variants
| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| product_id | uuid | FK products.id, NOT NULL | |
| name | text | NOT NULL | "Rouge", "Grand" |
| sku | text | UNIQUE | Code SKU |
| price_cents | integer | | Prix spécifique (override) |
| options | jsonb | | Options flexibles |
| is_active | boolean | default true | |
| created_at | timestamptz | default now() | |

### inventory
| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| product_id | uuid | FK products.id, UNIQUE | 1 stock par produit |
| variant_id | uuid | FK product_variants.id | null = stock produit principal |
| quantity | integer | NOT NULL, default 0 | |
| reserved | integer | NOT NULL, default 0 | Réservé (commandes en cours) |
| low_stock_threshold | integer | default 5 | |
| track_inventory | boolean | default true | |
| updated_at | timestamptz | default now() | |
| CONSTRAINT: quantity >= reserved | | CHECK | |

### carts
| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| user_id | uuid | FK users.id | null si guest |
| session_id | text | | ID session guest |
| status | enum | default 'active' | active/converted/abandoned |
| promo_code | text | | Code promo appliqué |
| promo_discount_cents | integer | default 0 | Réduction |
| created_at | timestamptz | default now() | |
| updated_at | timestamptz | default now() | |
| CONSTRAINT: user_id XOR session_id | | CHECK | |

### cart_items
| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| cart_id | uuid | FK carts.id, NOT NULL | |
| product_id | uuid | FK products.id, NOT NULL | |
| variant_id | uuid | FK product_variants.id | |
| quantity | integer | NOT NULL, CHECK > 0 | |
| unit_price_cents | integer | NOT NULL | Snapshot du prix |
| personalization | jsonb | | Données personnalisation |
| created_at | timestamptz | default now() | |
| updated_at | timestamptz | default now() | |
| UNIQUE(cart_id, product_id, variant_id) | | | |

### orders
| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| reference | text | UNIQUE, NOT NULL | MICH-XXXX |
| user_id | uuid | FK users.id | null si guest |
| status | enum | NOT NULL | pending/confirmed/processing/shipped/delivered/cancelled/refunded |
| subtotal_cents | integer | NOT NULL | |
| delivery_fee_cents | integer | NOT NULL | |
| discount_cents | integer | default 0 | |
| total_cents | integer | NOT NULL | |
| currency | text | default 'DZD' | |
| first_name | text | NOT NULL | Snapshot |
| last_name | text | NOT NULL | |
| phone | text | NOT NULL | |
| email | text | | |
| address_line_1 | text | NOT NULL | |
| address_line_2 | text | | |
| wilaya_code | integer | NOT NULL | |
| wilaya_name | text | NOT NULL | |
| commune | text | NOT NULL | |
| delivery_type | text | NOT NULL | home/office |
| notes | text | | Instructions |
| promo_code | text | | |
| payment_method | text | default 'cod' | cash_on_delivery |
| payment_status | enum | default 'pending' | pending/paid/failed/refunded |
| paid_at | timestamptz | | |
| shipped_at | timestamptz | | |
| delivered_at | timestamptz | | |
| cancelled_at | timestamptz | | |
| cancel_reason | text | | |
| created_at | timestamptz | default now() | |
| updated_at | timestamptz | default now() | |

### order_items
| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| order_id | uuid | FK orders.id, NOT NULL | |
| product_id | uuid | FK products.id | Référence |
| product_name | text | NOT NULL | Snapshot nom |
| product_slug | text | NOT NULL | Snapshot slug |
| product_image_url | text | | Snapshot image |
| variant_name | text | | Snapshot variante |
| quantity | integer | NOT NULL | |
| unit_price_cents | integer | NOT NULL | Prix au moment de la commande |
| total_price_cents | integer | NOT NULL | unit × qty |
| personalization | jsonb | | Données personnalisation |
| created_at | timestamptz | default now() | |

### payments
| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| order_id | uuid | FK orders.id, NOT NULL | |
| provider | text | NOT NULL | cod/stripe/cpa |
| provider_payment_id | text | | ID externe |
| amount_cents | integer | NOT NULL | |
| currency | text | default 'DZD' | |
| status | enum | NOT NULL | pending/succeeded/failed/refunded |
| metadata | jsonb | | Données additionnelles |
| created_at | timestamptz | default now() | |
| updated_at | timestamptz | default now() | |

### webhook_events
| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| source | text | NOT NULL | "payment_provider" |
| event_type | text | NOT NULL | |
| payload | jsonb | NOT NULL | |
| processed | boolean | default false | |
| error | text | | Erreur traitement |
| created_at | timestamptz | default now() | |

### idempotency_keys
| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | text | PK | Idempotency-Key |
| user_id | uuid | FK users.id | |
| response_status | integer | | Code HTTP réponse |
| response_body | jsonb | | Corps réponse |
| created_at | timestamptz | default now() | |
| expires_at | timestamptz | NOT NULL | TTL 24h |

### product_reviews
| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| product_id | uuid | FK products.id, NOT NULL | |
| user_id | uuid | FK users.id, NOT NULL | |
| rating | integer | NOT NULL, CHECK 1-5 | |
| title | text | | |
| comment | text | | |
| is_approved | boolean | default false | |
| created_at | timestamptz | default now() | |
| UNIQUE(product_id, user_id) | | | Un avis par produit/utilisateur |

## Indexes
- products: slug (UNIQUE), category_id, is_active, price_cents, created_at
- product_images: product_id
- product_variants: product_id
- inventory: product_id, variant_id
- cart_items: cart_id
- orders: user_id, reference (UNIQUE), status, created_at
- order_items: order_id
- payments: order_id, provider_payment_id
- webhook_events: processed, created_at
- addresses: user_id
- product_reviews: product_id, is_approved

## Relations
- categories → self (parent_id)
- products → categories
- product_images → products
- product_variants → products
- inventory → products, product_variants
- carts → users (optional)
- cart_items → carts, products, product_variants
- orders → users (optional)
- order_items → orders, products
- payments → orders
- addresses → users
- product_reviews → products, users
