import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('full/:datasourceId')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerFullSync(@Param('datasourceId') datasourceId: string) {
    return await this.syncService.triggerFullSync(datasourceId);
  }

  @Post('incremental/:datasourceId')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerIncrementalSync(@Param('datasourceId') datasourceId: string) {
    return await this.syncService.triggerIncrementalSync(datasourceId);
  }

  @Get('jobs')
  async findAllJobs(@Query('datasourceId') datasourceId?: string) {
    return await this.syncService.findAllJobs(datasourceId);
  }

  @Get('jobs/:id')
  async findOneJob(@Param('id') id: string) {
    return await this.syncService.findOneJob(id);
  }

  @Post('jobs/:id/cancel')
  async cancelJob(@Param('id') id: string) {
    return await this.syncService.cancelJob(id);
  }

  @Get('errors/:jobId')
  async getJobErrors(@Param('jobId') jobId: string) {
    return await this.syncService.getJobErrors(jobId);
  }

  @Post('errors/:jobId/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  async retryErrors(@Param('jobId') jobId: string) {
    return await this.syncService.retryErrors(jobId);
  }
}
