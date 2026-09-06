# Michket Backend API

Backend API pour la boutique e-commerce Michket.

## Stack

- **Framework**: NestJS 11 + Fastify
- **ORM**: Drizzle ORM
- **Base de données**: PostgreSQL (Supabase)
- **Cache**: Redis (Upstash) — mémoire en dev
- **Auth**: Supabase JWT
- **Validation**: Zod + class-validator
- **Docs**: Swagger/OpenAPI

## Installation

```bash
cd backend
npm install
```

## Configuration

```bash
cp .env.example .env
# Remplir les variables d'environnement
```

## Développement

```bash
# Start en mode dev (watch)
npm run start:dev

# Build
npm run build

# Start en prod
npm run start:prod
```

## Base de données

```bash
# Générer les migrations
npm run db:generate

# Appliquer les migrations
npm run db:migrate

# Push le schema (dev rapide)
npm run db:push

# Seed la base
npm run db:seed
```

## Tests

```bash
# Unit tests
npm run test

# Tests E2E
npm run test:e2e

# Coverage
npm run test:cov
```

## API Endpoints

### Health
- `GET /api/v1/health` — Health check
- `GET /api/v1/health/ready` — Readiness (DB, Redis)
- `GET /api/v1/health/live` — Liveness

### Swagger
- `GET /api/docs` — Swagger UI

### Auth
- `GET /api/v1/auth/me` — Profil utilisateur (Bearer auth)

### Products
- `GET /api/v1/products` — Liste paginée + filtres
- `GET /api/v1/products/best-sellers` — Best sellers
- `GET /api/v1/products/:slug` — Détail produit

### Categories
- `GET /api/v1/categories` — Toutes les catégories
- `GET /api/v1/categories/featured` — Catégories featured
- `GET /api/v1/categories/:slug` — Détail catégorie

### Cart
- `GET /api/v1/carts` — Récupérer panier
- `POST /api/v1/carts/items` — Ajouter au panier
- `PUT /api/v1/carts/items/:itemId` — Modifier quantité
- `DELETE /api/v1/carts/items/:itemId` — Supprimer du panier
- `DELETE /api/v1/carts` — Vider le panier

### Orders
- `POST /api/v1/orders` — Créer commande
- `GET /api/v1/orders` — Mes commandes (auth)
- `GET /api/v1/orders/:reference` — Détail commande

### Delivery
- `GET /api/v1/delivery/rate` — Calcul frais livraison
- `GET /api/v1/delivery/wilayas` — Liste wilayas
- `GET /api/v1/delivery/communes` — Communes d'une wilaya

### Users
- `GET /api/v1/users/me` — Mon profil
- `PUT /api/v1/users/me` — Mettre à jour profil
- `GET /api/v1/users/me/addresses` — Mes adresses
- `POST /api/v1/users/me/addresses` — Ajouter adresse

### Admin (RBAC)
- `GET /api/v1/admin/dashboard` — Stats
- `GET /api/v1/admin/orders` — Toutes les commandes
- `PUT /api/v1/admin/orders/:id/status` — Statut commande
- `GET /api/v1/admin/products` — Tous les produits
- `POST /api/v1/admin/products` — Créer produit
- `PUT /api/v1/admin/products/:id` — Modifier produit
- `DELETE /api/v1/admin/products/:id` — Supprimer produit
- `PUT /api/v1/admin/products/:id/inventory` — Stock
- `GET /api/v1/admin/users` — Tous les utilisateurs
- `PUT /api/v1/admin/users/:id/role` — Rôle utilisateur

## Monnaie

Tous les prix sont stockés en **centimes DZD** (dinar algérien).
Ex: 4990 centimes = 49.90 DA

## Déploiement

Voir [DEPLOYMENT_HOSTINGER.md](docs/DEPLOYMENT_HOSTINGER.md)
