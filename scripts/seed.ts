/**
 * Seed script for Michket database.
 * Run with: npm run db:seed
 *
 * This seeds the database with initial data:
 * - 4 main categories
 * - 16 products (matching frontend static data)
 * - Inventory records for each product
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  categories,
  products,
  productImages,
  inventory,
} from '../src/database/schema';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/michket';

async function seed() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);

  console.log('🌱 Seeding database...');

  // 1. Categories
  console.log('  📂 Creating categories...');
  const categoryData = [
    {
      name: 'Lampes 3D',
      slug: 'lampes-3d',
      description: 'Lampes LED acrylic personnalisées avec éclairage illuminé',
      href: '/lampes-3d',
      imageUrl: '/images/products/lampes/anniv.jpeg',
      sortOrder: 1,
    },
    {
      name: 'Trophées',
      slug: 'trophees',
      description: 'Trophées et plaques commémoratives gravées sur mesure',
      href: '/trophees',
      imageUrl: '/images/products/trophees/trophebac.jpeg',
      sortOrder: 2,
    },
    {
      name: 'Cartes du Monde',
      slug: 'cartes-du-monde',
      description: 'Cartes décoratives en bois découpées au laser',
      href: '/cartes-du-monde',
      imageUrl: '/images/products/cartes-du-monde/carte.jpg',
      sortOrder: 3,
    },
    {
      name: 'Néon LED',
      slug: 'neon-led',
      description: 'Néons LED personnalisés pour décoration intérieure',
      href: '/neon-led',
      imageUrl: '/images/products/neon-led/OIP.webp',
      sortOrder: 4,
    },
  ];

  const insertedCategories: Record<string, string> = {};
  for (const cat of categoryData) {
    const [inserted] = await db
      .insert(categories)
      .values(cat)
      .onConflictDoNothing()
      .returning();
    if (inserted) {
      insertedCategories[inserted.slug] = inserted.id;
      console.log(`    ✅ ${cat.name}`);
    }
  }

  // 2. Products (prices in cents DZD)
  console.log('  📦 Creating products...');
  const productData = [
    {
      name: 'Lampe LED 3D — Anniversaire Étoile',
      slug: 'lampe-led-3d-anniversaire-etoile',
      description:
        'Lampe personnalisée en acrylic LED 3D avec motif étoile. Idéale pour un cadeau d\'anniversaire mémorable.',
      categoryId: insertedCategories['lampes-3d'],
      priceCents: 4990,
      compareAtPriceCents: 6990,
      badge: 'BEST_SELLER' as const,
      occasions: ['anniversaire'],
      isPersonalizable: true,
      ratingAvg: '4.80',
      ratingCount: 245,
      imageUrl: '/images/products/lampes/anniv.jpeg',
      imageAlt: 'Lampe LED 3D personnalisée anniversaire',
    },
    {
      name: 'Lampe LED 3D — Mariage Couple',
      slug: 'lampe-led-3d-mariage-couple',
      description:
        'Lampe personnalisée pour célébrer votre amour. Gravure de vos prénoms et date de mariage.',
      categoryId: insertedCategories['lampes-3d'],
      priceCents: 5490,
      compareAtPriceCents: 7490,
      badge: 'BEST_SELLER' as const,
      occasions: ['mariage', 'couple'],
      isPersonalizable: true,
      ratingAvg: '4.90',
      ratingCount: 189,
      imageUrl: '/images/products/lampes/mariage.jpeg',
      imageAlt: 'Lampe LED 3D personnalisée mariage',
    },
    {
      name: 'Lampe LED 3D — Naissance Bébé',
      slug: 'lampe-led-3d-naissance-bebe',
      description:
        'Lampe de naissance personnalisée avec le prénom et la date de naissance de bébé.',
      categoryId: insertedCategories['lampes-3d'],
      priceCents: 4490,
      compareAtPriceCents: 5990,
      badge: 'NOUVEAU' as const,
      occasions: ['naissance'],
      isPersonalizable: true,
      ratingAvg: '4.70',
      ratingCount: 156,
      imageUrl: '/images/products/lampes/nouveau nee.jpeg',
      imageAlt: 'Lampe LED 3D naissance personnalisée',
    },
    {
      name: 'Lampe LED 3D — Maman & Famille',
      slug: 'lampe-led-3d-maman-famille',
      description:
        'Offrez à maman une lampe personnalisée avec les prénoms de la famille.',
      categoryId: insertedCategories['lampes-3d'],
      priceCents: 4990,
      compareAtPriceCents: 6490,
      badge: 'PERSONNALISABLE' as const,
      occasions: ['maman', 'famille'],
      isPersonalizable: true,
      ratingAvg: '4.80',
      ratingCount: 203,
      imageUrl: '/images/products/lampes/maman.jpeg',
      imageAlt: 'Lampe LED 3D personnalisée maman',
    },
    {
      name: 'Lampe LED 3D — Médecin',
      slug: 'lampe-led-3d-medecin',
      description:
        'Lampe personnalisée pour hommage à un médecin. Motif stéthoscope et prénom gravé.',
      categoryId: insertedCategories['lampes-3d'],
      priceCents: 5290,
      compareAtPriceCents: 6990,
      badge: 'PERSONNALISABLE' as const,
      occasions: ['metiers', 'remerciement'],
      isPersonalizable: true,
      ratingAvg: '4.90',
      ratingCount: 87,
      imageUrl: '/images/products/lampes/medecine.jpeg',
      imageAlt: 'Lampe LED 3D médecin personnalisée',
    },
    {
      name: 'Lampe LED 3D — Football',
      slug: 'lampe-led-3d-football',
      description:
        'Lampe personnalisée pour les amateurs de football. Motif ballon et numéro personnalisé.',
      categoryId: insertedCategories['lampes-3d'],
      priceCents: 4790,
      compareAtPriceCents: 6290,
      badge: 'BEST_SELLER' as const,
      occasions: ['sport'],
      isPersonalizable: true,
      ratingAvg: '4.70',
      ratingCount: 134,
      imageUrl: '/images/products/lampes/football.jpeg',
      imageAlt: 'Lampe LED 3D football personnalisée',
    },
    {
      name: 'Lampe LED 3D — Soutenance',
      slug: 'lampe-led-3d-soutenance',
      description:
        'Lampe de soutenance personnalisée pour célébrer l\'obtention du diplôme.',
      categoryId: insertedCategories['lampes-3d'],
      priceCents: 4990,
      compareAtPriceCents: 6490,
      occasions: ['soutenance', 'diplome'],
      isPersonalizable: true,
      ratingAvg: '4.60',
      ratingCount: 98,
      imageUrl: '/images/products/lampes/soutenance.jpeg',
      imageAlt: 'Lampe LED 3D soutenance personnalisée',
    },
    {
      name: 'Lampe LED 3D — 5ème Année',
      slug: 'lampe-led-3d-5eme',
      description:
        'Lampe commémorative pour les 5 ans de mariage ou événement spécial.',
      categoryId: insertedCategories['lampes-3d'],
      priceCents: 5290,
      compareAtPriceCents: 6990,
      occasions: ['anniversaire', 'mariage'],
      isPersonalizable: true,
      ratingAvg: '4.80',
      ratingCount: 67,
      imageUrl: '/images/products/lampes/5eme.jpeg',
      imageAlt: 'Lampe LED 3D 5ème anniversaire',
    },
    {
      name: 'Trophée Personnalisé — BAC',
      slug: 'trofee-personnalise-bac',
      description:
        'Trophée gravé pour célébrer l\'obtention du BAC. Personnalisation avec nom, spécialité et mention.',
      categoryId: insertedCategories['trophees'],
      priceCents: 3990,
      compareAtPriceCents: 5490,
      badge: 'BEST_SELLER' as const,
      occasions: ['bac', 'diplome'],
      isPersonalizable: true,
      ratingAvg: '4.90',
      ratingCount: 312,
      imageUrl: '/images/products/trophees/trophebac.jpeg',
      imageAlt: 'Trophée personnalisé BAC',
    },
    {
      name: 'Trophée Personnalisé — BEM',
      slug: 'trofee-personnalise-bem',
      description:
        'Trophée de mérite personnalisé pour récompenser l\'excellence.',
      categoryId: insertedCategories['trophees'],
      priceCents: 4290,
      compareAtPriceCents: 5990,
      occasions: ['diplome', 'remerciement'],
      isPersonalizable: true,
      ratingAvg: '4.80',
      ratingCount: 156,
      imageUrl: '/images/products/trophees/bem.jpeg',
      imageAlt: 'Trophée personnalisé BEM',
    },
    {
      name: 'Trophée Personnalisé — Soutenance',
      slug: 'trofee-personnalise-soutenance',
      description:
        'Trophée de soutenance gravé avec le nom de l\'étudiant et le sujet de thèse.',
      categoryId: insertedCategories['trophees'],
      priceCents: 4490,
      compareAtPriceCents: 6290,
      badge: 'NOUVEAU' as const,
      occasions: ['soutenance'],
      isPersonalizable: true,
      ratingAvg: '4.70',
      ratingCount: 89,
      imageUrl: '/images/products/trophees/soutenance2.jpeg',
      imageAlt: 'Trophée personnalisé soutenance',
    },
    {
      name: 'Trophée Personnalisé — Remerciement',
      slug: 'trofee-personnalise-remerciement',
      description:
        'Trophée de remerciement pour exprimer votre gratitude avec un message personnalisé.',
      categoryId: insertedCategories['trophees'],
      priceCents: 3790,
      compareAtPriceCents: 4990,
      occasions: ['remerciement'],
      isPersonalizable: true,
      ratingAvg: '4.80',
      ratingCount: 178,
      imageUrl: '/images/products/trophees/remerciement.jpeg',
      imageAlt: 'Trophée remerciement personnalisé',
    },
    {
      name: 'Carte du Monde en Bois — Multicolore',
      slug: 'carte-du-monde-bois-multicolore',
      description:
        'Carte du monde en bois découpé au laser, multicolore. Décoration murale premium pour salon ou bureau.',
      categoryId: insertedCategories['cartes-du-monde'],
      priceCents: 8990,
      compareAtPriceCents: 11990,
      badge: 'BEST_SELLER' as const,
      occasions: ['anniversaire', 'maison'],
      isPersonalizable: false,
      ratingAvg: '4.90',
      ratingCount: 423,
      imageUrl: '/images/products/cartes-du-monde/carte.jpg',
      imageAlt: 'Carte du monde en bois multicolore',
    },
    {
      name: 'Néon LED — Prénom Personnalisé',
      slug: 'neon-led-prenom-personnalise',
      description:
        'Néon LED sur mesure avec votre prénom. Idéal pour chambre, salon ou bureau.',
      categoryId: insertedCategories['neon-led'],
      priceCents: 5990,
      compareAtPriceCents: 7990,
      badge: 'PERSONNALISABLE' as const,
      occasions: ['anniversaire', 'chambre'],
      isPersonalizable: true,
      ratingAvg: '4.60',
      ratingCount: 112,
      imageUrl: '/images/products/neon-led/OIP.webp',
      imageAlt: 'Néon LED prénom personnalisé',
    },
    {
      name: 'Néon LED — Couple Personnalisé',
      slug: 'neon-led-couple-personnalise',
      description:
        'Néon LED personnalisé avec les prénoms de votre couple. Parfait pour la chambre ou l\'entrée.',
      categoryId: insertedCategories['neon-led'],
      priceCents: 6490,
      compareAtPriceCents: 8490,
      badge: 'NOUVEAU' as const,
      occasions: ['couple', 'mariage'],
      isPersonalizable: true,
      ratingAvg: '4.70',
      ratingCount: 76,
      imageUrl: '/images/products/neon-led/OIP (1).webp',
      imageAlt: 'Néon LED couple personnalisé',
    },
  ];

  for (const prod of productData) {
    const { imageUrl, imageAlt, ...productFields } = prod;
    const [inserted] = await db
      .insert(products)
      .values(productFields)
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      // Insert image
      await db
        .insert(productImages)
        .values({
          productId: inserted.id,
          url: imageUrl,
          altText: imageAlt,
          isPrimary: true,
          sortOrder: 0,
        })
        .onConflictDoNothing();

      // Insert inventory
      await db
        .insert(inventory)
        .values({
          productId: inserted.id,
          quantity: 50,
          reserved: 0,
          lowStockThreshold: 5,
          trackInventory: true,
        })
        .onConflictDoNothing();

      console.log(`    ✅ ${prod.name}`);
    }
  }

  console.log('\n🎉 Seed completed!');
  await pool.end();
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
