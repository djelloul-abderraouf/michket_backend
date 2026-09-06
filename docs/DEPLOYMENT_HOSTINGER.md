# Déploiement — Hostinger VPS

## Prérequis

1. **VPS Hostinger** avec Ubuntu 22.04+
2. **Node.js 22.x** installé
3. **PostgreSQL** (ou Supabase externe)
4. **Redis** (ou Upstash externe)
5. **Domaine** configuré

## Setup initial du VPS

```bash
# Connexion SSH
ssh root@ton-vps-ip

# Mise à jour
apt update && apt upgrade -y

# Installation Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
apt install -y nodejs

# Vérification
node --version  # v22.x.x

# Installation PM2 (process manager)
npm install -g pm2

# Installation build tools
apt install -y build-essential
```

## Déploiement

```bash
# Cloner le repo
cd /var/www
git clone https://github.com/djelloul-abderraouf/michket.git
cd michket/backend

# Installer les dépendances
npm install

# Configurer l'environnement
cp .env.example .env
nano .env  # Remplir les valeurs

# Build
npm run build

# Lancer avec PM2
pm2 start dist/main.js --name michket-backend

# Sauvegarder la config PM2
pm2 save
pm2 startup  # Pour démarrer au boot
```

## Nginx (reverse proxy)

```nginx
server {
    listen 80;
    server_name api.michket.dz;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## SSL (Let's Encrypt)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d api.michket.dz
```

## Variables d'environnement (production)

```env
NODE_ENV=production
PORT=3000
API_PREFIX=api/v1
CORS_ORIGINS=https://michket.dz,https://www.michket.dz

# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
SUPABASE_JWT_SECRET=xxx

# Database
DATABASE_URL=postgresql://user:pass@host:5432/michket

# Redis
REDIS_URL=redis://default:pass@host:6379

# Delivery
DELIVERY_FROM_WILAYA=16
```

## Monitoring

```bash
# Logs
pm2 logs michket-backend

# Status
pm2 status

# Restart
pm2 restart michket-backend

# Health check
curl https://api.michket.dz/api/v1/health
```

## CI/CD avec GitHub Actions

Voir `.github/workflows/deploy.yml`
