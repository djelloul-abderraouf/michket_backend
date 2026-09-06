# Sécurité — Michket Backend

## Méthodes d'authentification

- **JWT Supabase** : token Bearer dans le header Authorization
- **Honeypot** : champ `website` dans les formulaires (doit être vide)
- **Rate limiting** : 100 req/min public, 300 req/min auth, 500 req/min admin

## RBAC (Role-Based Access Control)

| Rôle | Capacités |
|------|-----------|
| `customer` | Consulter catalogue, gérer panier, créer/commander, voir ses commandes |
| `admin` | Tout customer + gérer produits/catégories/stock/commandes |
| `super_admin` | Tout admin + gérer rôles utilisateurs |

## Sécurité des données

- **Prix** : toujours calculés côté serveur, jamais confiance au client
- **Stock** : transactions PostgreSQL avec verrouillage ligne (`FOR UPDATE`)
- **Commandes** : snapshots immutables (les prix ne changent pas après commande)
- **Webhooks** : signature vérifiée (X-Webhook-Signature)
- **Idempotency** : header `Idempotency-Key` pour les requêtes POST créatives

## Headers de sécurité (Helmet)

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Content-Security-Policy: default-src 'self'`

## Variables sensibles

| Variable | Usage |
|----------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` | Accès admin Supabase — JAMAIS exposée côté client |
| `SUPABASE_JWT_SECRET` | Vérification JWT |
| `DATABASE_URL` | Connexion PostgreSQL |
| `REDIS_URL` | Connexion Redis |

## Bonnes pratiques

1. Ne jamais logger les mots de passe ou tokens
2. Valider toutes les entrées avec Zod/class-validator
3. Utiliser des prepared statements (Drizzle le fait automatiquement)
4. Limiter la taille des réponses (pagination obligatoire)
5. CORS strict : uniquement les origines autorisées
6. Rate limiting sur tous les endpoints publics
7. HTTPS obligatoire en production
