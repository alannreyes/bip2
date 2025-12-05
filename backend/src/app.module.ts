import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

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
import { AuthModule } from './auth/auth.module';
import { PromptsModule } from './prompts/prompts.module';

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

    // Rate Limiting - Protección contra abusos
    // 100 requests por minuto por IP (general)
    // Endpoints específicos pueden tener límites más estrictos
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,      // 1 segundo
        limit: 10,      // 10 requests por segundo máximo
      },
      {
        name: 'medium',
        ttl: 60000,     // 1 minuto
        limit: 100,     // 100 requests por minuto
      },
      {
        name: 'long',
        ttl: 3600000,   // 1 hora
        limit: 1000,    // 1000 requests por hora
      },
    ]),

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
    AuthModule,
    PromptsModule,
  ],
  providers: [
    // Aplicar Rate Limiting globalmente
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
