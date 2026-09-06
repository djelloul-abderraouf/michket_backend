# Performance — Michket Backend

## Métriques cibles

| Métrique | Cible | Actuel |
|----------|-------|--------|
| Temps de réponse API (p50) | < 100ms | À mesurer |
| Temps de réponse API (p99) | < 500ms | À mesurer |
| Requêtes/seconde | > 100 | À mesurer |
| Uptime | 99.9% | À mesurer |

## Stratégies de cache

### Cache Redis (Production)
- **Catalogue public** : 5 minutes TTL
- **Catégories** : 1 heure TTL
- **Détail produit** : 5 minutes TTL
- **Best sellers** : 10 minutes TTL
- **Taux de livraison** : 1 heure TTL

### Cache mémoire (Développement)
- Map in-memory avec TTL
- Même interface que Redis
- Pas de persistance

### Invalidation du cache
- Sur update produit → invalidate produit + catégorie + catalogue
- Sur update catégorie → invalidate catégorie + catalogue
- Sur update stock → invalidate produit

## Optimisations PostgreSQL

1. **Index** : tous les champs de recherche et filtrage indexés
2. **Pagination** : toujours LIMIT/OFFSET avec comptage
3. **JOINs** : product_images, product_variants en LEFT JOIN
4. **Transactions** : pour les opérations stock (FOR UPDATE)
5. **Connection pooling** : max 10 connexions via pg Pool

## Optimisations Fastify

1. **HTTP/2** : supporté nativement
2. **Compression** : gzip/deflate automatique
3. **Keep-alive** : connexions réutilisées
4. **JSON parsing** : rapide via fastify

## Monitoring

- **Health checks** : /health, /health/ready, /health/live
- **Request ID** : X-Request-Id sur chaque requête
- **Structured logging** : JSON logs avec pino
- **Sentry** : error tracking optionnel

## Scaling horizontal

- **Stateless** : pas de session en mémoire
- **PM2 cluster mode** : utiliser tous les CPU
- **Load balancer** : Nginx ou Cloudflare
- **Database** : Supabase gère le scaling
- **Cache** : Redis Upstash serverless
