import { Injectable, Logger } from '@nestjs/common';
import { DatasourcesService } from '../datasources/datasources.service';
import { SyncService } from '../sync/sync.service';
import { SyncJob } from '../sync/entities/sync-job.entity';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly datasourcesService: DatasourcesService,
    private readonly syncService: SyncService,
  ) {}

  async validateWebhook(datasourceId: string, providedSecret: string): Promise<boolean> {
    try {
      const datasource = await this.datasourcesService.findOne(datasourceId);

      if (!datasource.webhookEnabled) {
        this.logger.warn(`Webhook not enabled for datasource: ${datasourceId}`);
        return false;
      }

      if (!datasource.webhookSecret) {
        this.logger.warn(`No webhook secret configured for datasource: ${datasourceId}`);
        return false;
      }

      return datasource.webhookSecret === providedSecret;
    } catch (error) {
      this.logger.error(`Webhook validation failed: ${error.message}`);
      return false;
    }
  }

  async processSyncRequest(datasourceId: string, codes: string[]): Promise<SyncJob> {
    this.logger.log(`Processing webhook sync request for ${codes.length} codes`);
    return await this.syncService.triggerWebhookSync(datasourceId, codes);
  }
}
