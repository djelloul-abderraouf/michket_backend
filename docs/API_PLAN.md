# API Plan — Michket Backend

Base URL: `/api/v1`

## Auth
| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| POST | `/auth/register` | Créer compte client | Public |
| POST | `/auth/login` | Login (Supabase email+password) | Public |
| POST | `/auth/logout` | Déconnexion | Auth |
| GET | `/auth/me` | Profil utilisateur courant | Auth |
| PUT | `/auth/me` | Mettre à jour profil | Auth |

## Catalogue (Public)
| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| GET | `/products` | Liste paginée + filtres + tri | Public |
| GET | `/products/:slug` | Détail produit | Public |
| GET | `/products/:slug/variants` | Variantes d'un produit | Public |
| GET | `/categories` | Toutes les catégories | Public |
| GET | `/categories/:slug` | Détail catégorie | Public |
| GET | `/search` | Recherche full-text | Public |
| GET | `/home` | Données page d'accueil (featured, best-sellers, etc.) | Public |

## Panier
| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| GET | `/cart` | Récupérer panier courant | Auth/Guest |
| POST | `/cart/items` | Ajouter produit au panier | Auth/Guest |
| PUT | `/cart/items/:itemId` | Modifier quantité | Auth/Guest |
| DELETE | `/cart/items/:itemId` | Supprimer du panier | Auth/Guest |
| DELETE | `/cart` | Vider le panier | Auth/Guest |
| POST | `/cart/apply-promo` | Appliquer code promo | Auth/Guest |

## Commandes
| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| POST | `/orders` | Créer commande (checkout) | Auth/Guest |
| GET | `/orders` | Mes commandes | Auth |
| GET | `/orders/:id` | Détail commande | Auth |
| POST | `/orders/:id/cancel` | Annuler commande | Auth |

## Livraison
| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| GET | `/delivery/rate` | Calculer frais de livraison | Public |
| GET | `/delivery/wilayas` | Liste wilayas | Public |
| GET | `/delivery/communes` | Communes d'une wilaya | Public |

## Paiement
| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| POST | `/payments/webhook` | Webhook paiement (signature vérifiée) | Webhook |

## Utilisateur
| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| GET | `/users/me` | Mon profil | Auth |
| PUT | `/users/me` | Mettre à jour profil | Auth |
| GET | `/users/me/addresses` | Mes adresses | Auth |
| POST | `/users/me/addresses` | Ajouter adresse | Auth |
| PUT | `/users/me/addresses/:id` | Modifier adresse | Auth |
| DELETE | `/users/me/addresses/:id` | Supprimer adresse | Auth |

## Admin (RBAC: admin/super_admin)
| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| GET | `/admin/dashboard` | Stats dashboard | Admin |
| GET | `/admin/orders` | Toutes les commandes (filtres, pagination) | Admin |
| PUT | `/admin/orders/:id/status` | Mettre à jour statut commande | Admin |
| GET | `/admin/products` | Tous les produits (admin view) | Admin |
| POST | `/admin/products` | Créer produit | Admin |
| PUT | `/admin/products/:id` | Modifier produit | Admin |
| DELETE | `/admin/products/:id` | Supprimer produit | Admin |
| POST | `/admin/products/:id/variants` | Ajouter variante | Admin |
| PUT | `/admin/products/:id/variants/:variantId` | Modifier variante | Admin |
| DELETE | `/admin/products/:id/variants/:variantId` | Supprimer variante | Admin |
| PUT | `/admin/products/:id/inventory` | Mettre à jour stock | Admin |
| GET | `/admin/categories` | Toutes les catégories | Admin |
| POST | `/admin/categories` | Créer catégorie | Admin |
| PUT | `/admin/categories/:id` | Modifier catégorie | Admin |
| DELETE | `/admin/categories/:id` | Supprimer catégorie | Admin |
| GET | `/admin/users` | Tous les utilisateurs | Admin |
| PUT | `/admin/users/:id/role` | Changer rôle utilisateur | Admin |

## Health & Monitoring
| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| GET | `/health` | Health check | Public |
| GET | `/health/ready` | Readiness check (DB, Redis) | Public |
| GET | `/health/live` | Liveness check | Public |

## Swagger
| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| GET | `/docs` | Swagger UI | Public |
| GET | `/docs-json` | OpenAPI spec JSON | Public |

## Conventions
- **Pagination**: `?page=1&limit=20` → réponse `{ data: [], meta: { page, limit, total, totalPages } }`
- **Tri**: `?sort=price:asc` ou `?sort=createdAt:desc`
- **Filtres**: `?category=lampes-3d&badge=BEST SELLER&minPrice=3000&maxPrice=8000`
- **Monnaie**: Tous les prix en **centimes DZD** (4990 = 49.90 DA)
- **IDempotency**: `Idempotency-Key` header pour POST créatifs
- **Request ID**: `X-Request-Id` header (UUID généré par le serveur)
- **Rate Limiting**: 100 req/min public, 300 req/min auth, 500 req/min admin
