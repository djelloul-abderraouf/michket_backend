import {
  Injectable,
  Inject,
} from '@nestjs/common';
import {
  eq,
  desc,
  and,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '../database/schema';
import { crmProducts } from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';
import { CrmBaseService } from '../crm-base/crm-base.service';
import {
  CreateCrmProductDto,
  UpdateCrmProductDto,
} from './dto/crm-products.dto';

@Injectable()
export class CrmProductsService extends CrmBaseService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    db: NodePgDatabase<typeof schema>,
  ) {
    super(db);
  }

  async findAll() {
    return this.db
      .select()
      .from(crmProducts)
      .where(eq(crmProducts.active, true))
      .orderBy(desc(crmProducts.createdAt));
  }

  async findById(id: string) {
    return this.findById(crmProducts, id, 'Product');
  }

  async create(dto: CreateCrmProductDto) {
    const [product] = await this.db
      .insert(crmProducts)
      .values({
        id: dto.id,
        name: dto.name,
        category: dto.category,
        price: dto.price,
        photoUrl: dto.photoUrl,
        averageBuildHours: dto.averageBuildHours,
        active: dto.active ?? true,
      })
      .returning();

    return product;
  }

  async update(id: string, dto: UpdateCrmProductDto) {
    await this.findById(id);

    const [updatedProduct] = await this.db
      .update(crmProducts)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(crmProducts.id, id))
      .returning();

    return updatedProduct;
  }

  async delete(id: string) {
    await this.findById(id);
    await this.deleteById(crmProducts, id);
  }

  async findByCategory(category: 'lampe' | 'trophee' | 'carte' | 'neon') {
    return this.db
      .select()
      .from(crmProducts)
      .where(
        and(
          eq(crmProducts.category, category),
          eq(crmProducts.active, true),
        ),
      )
      .orderBy(desc(crmProducts.createdAt));
  }
}
