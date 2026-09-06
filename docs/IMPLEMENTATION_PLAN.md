# Implementation Plan — Michket Backend

## Phase 1: Project Setup ✅
- [x] Créer `backend/` avec package.json, tsconfig.json
- [ ] Installer les dépendances (npm install)
- [ ] Configurer `.env.example`
- [ ] Créer `main.ts` + `app.module.ts`
- [ ] Configurer Fastify adapter
- [ ] Configurer Swagger

## Phase 2: Configuration & Common
- [ ] `src/config/env.ts` — Validation Zod des variables d'environnement
- [ ] `src/common/filters/http-exception.filter.ts`
- [ ] `src/common/interceptors/request-id.interceptor.ts`
- [ ] `src/common/interceptors/logging.interceptor.ts`
- [ ] `src/common/guards/rate-limit.guard.ts`
- [ ] `src/common/decorators/current-user.decorator.ts`
- [ ] `src/common/dto/pagination.dto.ts`

## Phase 3: Database
- [ ] `src/database/schema/` — Toutes les tables Drizzle
- [ ] `src/database/client.ts` — Connexion DB
- [ ] `src/database/database.module.ts`
- [ ] `drizzle.config.ts`
- [ ] Migrations initiales
- [ ] Seed script

## Phase 4: Auth
- [ ] `src/auth/auth.module.ts`
- [ ] `src/auth/auth.service.ts` — Register, login, JWT
- [ ] `src/auth/auth.controller.ts`
- [ ] `src/auth/jwt.strategy.ts`
- [ ] `src/auth/uards/roles.guard.ts`
- [ ] `src/auth/dto/` — register.dto, login.dto

## Phase 5: Catalogue
- [ ] `src/products/products.module.ts`
- [ ] `src/products/products.service.ts`
- [ ] `src/products/products.controller.ts`
- [ ] `src/categories/categories.module.ts`
- [ ] `src/categories/categories.service.ts`
- [ ] `src/categories/categories.controller.ts`
- [ ] `src/search/search.service.ts`

## Phase 6: Cart
- [ ] `src/carts/carts.module.ts`
- [ ] `src/carts/carts.service.ts`
- [ ] `src/carts/carts.controller.ts`

## Phase 7: Orders + Inventory
- [ ] `src/orders/orders.module.ts`
- [ ] `src/orders/orders.service.ts`
- [ ] `src/orders/orders.controller.ts`
- [ ] `src/inventory/inventory.module.ts`
- [ ] `src/inventory/inventory.service.ts`

## Phase 8: Payments
- [ ] `src/payments/payments.module.ts`
- [ ] `src/payments/payments.service.ts`
- [ ] `src/payments/providers/payment-provider.interface.ts`
- [ ] `src/payments/providers/cod.provider.ts`
- [ ] `src/webhooks/webhooks.module.ts`
- [ ] `src/webhooks/webhooks.controller.ts`

## Phase 9: Cache + Health
- [ ] `src/cache/cache.module.ts`
- [ ] `src/cache/cache.service.ts`
- [ ] `src/health/health.module.ts`
- [ ] `src/health/health.controller.ts`

## Phase 10: Admin
- [ ] `src/admin/admin.module.ts`
- [ ] `src/admin/admin.controller.ts`
- [ ] Guards RBAC

## Phase 11: Media + Users
- [ ] `src/media/media.module.ts`
- [ ] `src/media/media.service.ts`
- [ ] `src/users/users.module.ts`
- [ ] `src/users/users.service.ts`
- [ ] `src/users/users.controller.ts`

## Phase 12: Delivery
- [ ] `src/delivery/delivery.module.ts`
- [ ] `src/delivery/delivery.service.ts`

## Phase 13: Sécurité + Observabilité
- [ ] Helmet configuration
- [ ] CORS allowlist
- [ ] Rate limiting
- [ ] Structured logging (pino)
- [ ] Sentry setup (optionnel)

## Phase 14: Tests
- [ ] Unit tests pour chaque service
- [ ] Integration tests pour les endpoints critiques
- [ ] E2E tests pour les flows principaux

## Phase 15: Documentation
- [ ] README.md
- [ ] SECURITY.md
- [ ] PERFORMANCE.md
- [ ] DEPLOYMENT_HOSTINGER.md
- [ ] CLOUDFLARE.md
- [ ] TODO.md
- [ ] FINAL_REPORT.md

## Phase 16: CI/CD
- [ ] GitHub Actions workflow
- [ ] Lint, typecheck, test, build
