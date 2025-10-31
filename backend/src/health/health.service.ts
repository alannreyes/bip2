import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { QdrantService } from '../qdrant/qdrant.service';
import Redis from 'ioredis';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private redis: Redis;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly qdrantService: QdrantService,
    private readonly configService: ConfigService,
  ) {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST'),
      port: this.configService.get('REDIS_PORT'),
      password: this.configService.get('REDIS_PASSWORD'),
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
  }

  async check() {
    const [database, qdrant, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkQdrant(),
      this.checkRedis(),
    ]);

    const healthy = database.healthy && qdrant.healthy && redis.healthy;

    return {
      status: healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database,
        qdrant,
        redis,
      },
    };
  }

  async checkDatabase(): Promise<{ healthy: boolean; message: string }> {
    try {
      await this.dataSource.query('SELECT 1');
      return { healthy: true, message: 'Database is healthy' };
    } catch (error) {
      this.logger.error(`Database health check failed: ${error.message}`);
      return { healthy: false, message: error.message };
    }
  }

  async checkQdrant(): Promise<{ healthy: boolean; message: string }> {
    return await this.qdrantService.healthCheck();
  }

  async checkRedis(): Promise<{ healthy: boolean; message: string }> {
    try {
      await this.redis.ping();
      return { healthy: true, message: 'Redis is healthy' };
    } catch (error) {
      this.logger.error(`Redis health check failed: ${error.message}`);
      return { healthy: false, message: error.message };
    }
  }
}
