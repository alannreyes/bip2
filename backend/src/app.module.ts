import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';

// Modules
import { CommonModule } from './common/common.module';
import { DatasourcesModule } from './datasources/datasources.module';
import { SyncModule } from './sync/sync.module';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { QdrantModule } from './qdrant/qdrant.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { SearchModule } from './search/search.module';
import { HealthModule } from './health/health.module';
import { DuplicatesModule } from './duplicates/duplicates.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // TypeORM (PostgreSQL)
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DATABASE_HOST'),
        port: configService.get('DATABASE_PORT'),
        username: configService.get('DATABASE_USERNAME'),
        password: configService.get('DATABASE_PASSWORD'),
        database: configService.get('DATABASE_NAME'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: configService.get('NODE_ENV') === 'development', // Only in dev
        logging: configService.get('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),

    // Bull (Redis Queue)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST'),
          port: configService.get('REDIS_PORT'),
          password: configService.get('REDIS_PASSWORD'),
        },
      }),
      inject: [ConfigService],
    }),

    // Schedule (Cron jobs)
    ScheduleModule.forRoot(),

    // Common services (global)
    CommonModule,

    // Feature modules
    DatasourcesModule,
    SyncModule,
    EmbeddingsModule,
    QdrantModule,
    SchedulerModule,
    WebhooksModule,
    SearchModule,
    HealthModule,
    DuplicatesModule,
  ],
})
export class AppModule {}
