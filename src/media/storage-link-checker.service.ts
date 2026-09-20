import {
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import {
  DATABASE_CONNECTION,
} from '../database/database.module';
import * as schema from '../database/schema';

@Injectable()
export class StorageLinkCheckerService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Throws ConflictException if the storagePath is already
   * linked to a product image in product_images.storage_path.
   *
   * Used by the orphan cleanup endpoint to prevent deleting
   * files that are officially associated with a product.
   */
  async assertProductImageUnlinked(
    storagePath: string,
  ): Promise<void> {
    const [row] = await this.db
      .select({ id: schema.productImages.id })
      .from(schema.productImages)
      .where(
        eq(
          schema.productImages.storagePath,
          storagePath,
        ),
      )
      .limit(1);

    if (row) {
      throw new ConflictException(
        'Product image is already linked to a product',
      );
    }
  }

  /**
   * Throws ConflictException if the storagePath is already
   * linked to either:
   *   - categories.image_storage_path (main category photo)
   *   - category_images.storage_path (desktop hero image)
   *   - category_images.mobile_storage_path (mobile hero image)
   *
   * Used by the orphan cleanup endpoint to prevent deleting
   * files that are officially associated with a category.
   */
  async assertCategoryImageUnlinked(
    storagePath: string,
  ): Promise<void> {
    const [categoryRow] = await this.db
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(
        eq(
          schema.categories.imageStoragePath,
          storagePath,
        ),
      )
      .limit(1);

    if (categoryRow) {
      throw new ConflictException(
        'Category image is already linked to a category',
      );
    }

    const [heroDesktopRow] = await this.db
      .select({ id: schema.categoryImages.id })
      .from(schema.categoryImages)
      .where(
        eq(
          schema.categoryImages.storagePath,
          storagePath,
        ),
      )
      .limit(1);

    if (heroDesktopRow) {
      throw new ConflictException(
        'Category hero desktop image is already linked to a category',
      );
    }

    const [heroMobileRow] = await this.db
      .select({ id: schema.categoryImages.id })
      .from(schema.categoryImages)
      .where(
        eq(
          schema.categoryImages.mobileStoragePath,
          storagePath,
        ),
      )
      .limit(1);

    if (heroMobileRow) {
      throw new ConflictException(
        'Category hero mobile image is already linked to a category',
      );
    }
  }

  /**
   * Throws ConflictException if the storagePath is already
   * linked to client_references.image_storage_path.
   *
   * This protects an official "Nos références" logo/image
   * from being deleted by the orphan cleanup endpoint.
   */
  async assertReferenceImageUnlinked(
    storagePath: string,
  ): Promise<void> {
    const [referenceRow] = await this.db
      .select({ id: schema.clientReferences.id })
      .from(schema.clientReferences)
      .where(
        eq(
          schema.clientReferences.imageStoragePath,
          storagePath,
        ),
      )
      .limit(1);

    if (referenceRow) {
      throw new ConflictException(
        'Reference image is already linked to a client reference',
      );
    }
  }
}
