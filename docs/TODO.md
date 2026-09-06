# TODO — Michket Backend

## ✅ Fait
- [x] Structure NestJS complète
- [x] Schema Drizzle (users, products, categories, orders, payments, carts, inventory, reviews, etc.)
- [x] Auth (JWT Supabase, guards, RBAC)
- [x] Products (CRUD, filtres, pagination, best-sellers)
- [x] Categories (CRUD, featured)
- [x] Carts (add, update, remove, clear, calculate)
- [x] Orders (create, status, reference)
- [x] Inventory (check, reserve, release, confirm)
- [x] Payments (interface + COD provider)
- [x] Delivery (rate calculation, wilayas, communes)
- [x] Health checks (health, ready, live)
- [x] Cache service (in-memory dev, Redis-ready)
- [x] Admin endpoints (dashboard, products, orders, users)
- [x] Webhooks (event logging, idempotency)
- [x] Users (profile, addresses)
- [x] Media service (upload placeholder)
- [x] Swagger documentation
- [x] CI/CD GitHub Actions
- [x] Seed script (16 produits, 4 catégories)
- [x] Documentation (API_PLAN, DATABASE_PLAN, FRONTEND_AUDIT, DEPLOYMENT, SECURITY)

## 🔲 À faire

### Priorité haute
- [ ] Créer un projet Supabase et configurer la base
- [ ] Connecter le frontend au backend (remplacer données statiques)
- [ ] Implémenter le panier serveur côté frontend
- [ ] Checkout réel (remplacer placeholder /paiement)
- [ ] Configurer CORS pour le domaine de production

### Priorité moyenne
- [ ] Tests unitaires pour chaque service
- [ ] Tests E2E pour les flows principaux
- [ ] Intégrer Upstash Redis (cache production)
- [ ] Upload images réel (Supabase Storage)
- [ ] Emails de confirmation de commande
- [ ] Gestion des promotions/codes promo
- [ ] Recherche full-text PostgreSQL (trigram)

### Priorité basse
- [ ] Admin dashboard (React/Next.js)
- [ ] Analytics & métriques
- [ ] Rate limiting Redis (production)
- [ ] Sentry error tracking
- [ ] Monitoring & alerting
- [ ] Backup automatisé
- [ ] Documentation API publique (OpenAPI)
