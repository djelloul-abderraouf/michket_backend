# Frontend Audit — Michket Storefront

Date: 2026-09-01

## Stack Technique
- **Framework**: Next.js 16.3.3 (App Router, React 19.2.8, Tailwind CSS v4)
- **Node**: 22.x
- **State Management**: React Context (CartContext + localStorage)
- **TypeScript**: Strict mode, path alias `@/*` → `./src/*`

## Données Statiques (Products)
**Fichier**: `src/data/products.ts`
- **Interface Product**: id, slug, title, description, price, compareAtPrice, currency, images, badge, category, occasion, rating, reviewCount, inStock, personalizable
- **16 produits** répartis en 4 catégories
- **Currency**: Champ `currency: "DA"` mais les prix semblent en EUR (49.90, 54.90...)
- **Prix**: Stockés en décimales (pas en cents)
- **Badges**: BEST SELLER, NOUVEAU, PROMO, PERSONNALISABLE, ENVOI GRATUIT
- **Fonctions utilitaires**: getProductBySlug, getProductsByCategory, getBestSellers, getNewArrivals, getPersonalizableProducts

## Données Statiques (Catégories)
**Fichier**: `src/data/categories.ts`
- **4 catégories principales**: lampes-3d, trophees, cartes-du-monde, neon-led
- **3 catégories mises en avant**: lampes-anniversaire, trofees-bac, cartes-monde-deco
- **Interface Category**: id, label, description, href, image

## Données Statiques (Livraison)
**Fichier**: `src/data/delivery-prices.ts`
- Tarifs manuels par wilaya (vide `{}`)
- Mapping courier wilaya → code legacy
- Intégration Yalidine API via freeship.dzbuild.com

## Données Statiques (Site Config)
**Fichier**: `src/data/site-config.ts`
- **OWNER_INPUT_REQUIRED** partout : URL, currency, contact info, social links, legal entity, newsletter

## Cart Context (Client-Side)
**Fichier**: `src/contexts/CartContext.tsx`
- Actions: ADD, REMOVE, UPDATE_QUANTITY, CLEAR, HYDRATE
- Max quantité: 99
- Persistance: localStorage (`michket-cart`)
- Aucune synchronisation serveur

## API Endpoints Existants
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/orders` | Soumet commande via webhook (ORDER_WEBHOOK_URL) |
| POST | `/api/delivery-rate` | Calcul frais livraison (Yalidine API) |

### POST /api/orders
- Valide inputs (productSlug, quantity, firstName, lastName, phone, etc.)
- Vérifie honeypot field
- Calcule delivery rate
- Génère référence: `MICH-{timestamp}`
- Envoie JSON au webhook ORDER_WEBHOOK_URL
- **Aucune persistance en base**

### POST /api/delivery-rate
- Utilise `getDeliveryRate()` depuis lib/delivery
- Env vars: DELIVERY_FROM_WILAYA, YALIDINE_API_ID, YALIDINE_API_TOKEN

## Page Checkout (/paiement)
**Statut**: Placeholder statique
- Formulaire avec champs: prénom, nom, email, adresse, code postal, ville, téléphone
- **Ne soumet nulle part** — aucun handler
- Ne lit pas le panier

## Page Panier (/panier)
- Lit useCart() depuis CartContext
- Affiche produits avec quantités
- Redirige vers /paiement
- Formatage EUR (incohérent avec DA)

## Recherche (SearchOverlay)
- Recherche client-side sur tableau statique
- Scoring: title×5, category×4, occasion×3, description×2, badge×1

## Navigation/Catégories
- `/lampes-3d`, `/trophees`, `/cartes-du-monde`, `/neon-led`
- `/coup-de-coeur` (favoris)
- `/paiement` (checkout)
- `/panier` (cart)

## Ce qui N'EXISTE PAS côté backend
1. ❌ Authentification / utilisateurs
2. ❌ Base de données
3. ❌ API catalogue dynamique
4. ❌ Gestion panier serveur
5. ❌ Gestion commandes avec statuts
6. ❌ Paiement
7. ❌ Administration
8. ❌ Cache Redis
9. ❌ Recherche full-text
10. ❌ Upload images / gestion médias
11. ❌ Emails / notifications
12. ❌ Webhooks sécurisés

## Priorités d'Implémentation Backend
1. **Sécurité immédiate**: Les prix ne doivent JAMAIS être calculés côté client
2. **Catalogue dynamique**: Remplacer les données statiques par l'API
3. **Panier serveur**: Synchronisation avec le serveur
4. **Commandes**: Persistance et gestion des statuts
5. **Paiement**: Intégration sécurisée
6. **Admin**: Dashboard pour gérer le catalogue
