import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { DatasourcesModule } from '../datasources/datasources.module';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [DatasourcesModule, SyncModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
