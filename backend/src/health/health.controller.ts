import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check() {
    return await this.healthService.check();
  }

  @Get('qdrant')
  async checkQdrant() {
    return await this.healthService.checkQdrant();
  }

  @Get('database')
  async checkDatabase() {
    return await this.healthService.checkDatabase();
  }

  @Get('redis')
  async checkRedis() {
    return await this.healthService.checkRedis();
  }
}
