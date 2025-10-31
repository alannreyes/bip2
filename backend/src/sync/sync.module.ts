import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SyncJob } from './entities/sync-job.entity';
import { SyncError } from './entities/sync-error.entity';
import { FullSyncProcessor } from './processors/full-sync.processor';
import { IncrementalSyncProcessor } from './processors/incremental-sync.processor';
import { WebhookSyncProcessor } from './processors/webhook-sync.processor';
import { DatasourcesModule } from '../datasources/datasources.module';
import { QdrantModule } from '../qdrant/qdrant.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SyncJob, SyncError]),
    BullModule.registerQueue({
      name: 'sync',
    }),
    DatasourcesModule,
    QdrantModule,
    EmbeddingsModule,
  ],
  controllers: [SyncController],
  providers: [SyncService, FullSyncProcessor, IncrementalSyncProcessor, WebhookSyncProcessor],
  exports: [SyncService],
})
export class SyncModule {}
