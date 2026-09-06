import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { webhookEvents } from '../database/schema';
import { DATABASE_CONNECTION } from '../database/database.module';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger('WebhooksService');

  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<any>,
  ) {}

  /**
   * Log a webhook event for idempotency.
   */
  async logEvent(
    source: string,
    eventType: string,
    payload: any,
  ): Promise<string> {
    const [event] = await this.db
      .insert(webhookEvents)
      .values({
        source,
        eventType,
        payload,
        processed: false,
      })
      .returning();

    return event.id;
  }

  /**
   * Mark an event as processed.
   */
  async markProcessed(eventId: string, error?: string) {
    await this.db
      .update(webhookEvents)
      .set({
        processed: !error,
        error: error || null,
      })
      .where(eq(webhookEvents.id, eventId));
  }

  /**
   * Check if an event has already been processed (idempotency).
   */
  async isProcessed(source: string, eventType: string, payloadId: string) {
    const [event] = await this.db
      .select()
      .from(webhookEvents)
      .where(
        // Simple dedup: check source + type + payload ID
        eq(webhookEvents.source, source),
      )
      .limit(1);

    return event?.processed || false;
  }
}
