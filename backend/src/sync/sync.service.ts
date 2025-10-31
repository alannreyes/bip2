import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { SyncJob } from './entities/sync-job.entity';
import { SyncError } from './entities/sync-error.entity';
import { DatasourcesService } from '../datasources/datasources.service';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @InjectRepository(SyncJob)
    private readonly syncJobRepository: Repository<SyncJob>,
    @InjectRepository(SyncError)
    private readonly syncErrorRepository: Repository<SyncError>,
    private readonly datasourcesService: DatasourcesService,
    @InjectQueue('sync') private readonly syncQueue: Queue,
  ) {}

  async triggerFullSync(datasourceId: string): Promise<SyncJob> {
    // Verify datasource exists
    const datasource = await this.datasourcesService.findOne(datasourceId);

    this.logger.log(`Triggering full sync for datasource: ${datasource.name}`);

    // Create sync job
    const syncJob = this.syncJobRepository.create({
      datasourceId,
      type: 'full',
      status: 'pending',
      metadata: {
        startedBy: 'manual',
        datasourceName: datasource.name,
      },
    });

    const savedJob = await this.syncJobRepository.save(syncJob);

    // Add job to queue
    await this.syncQueue.add('full-sync', {
      jobId: savedJob.id,
      datasourceId,
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });

    this.logger.log(`Full sync job created: ${savedJob.id}`);
    return savedJob;
  }

  async triggerIncrementalSync(datasourceId: string): Promise<SyncJob> {
    const datasource = await this.datasourcesService.findOne(datasourceId);

    this.logger.log(`Triggering incremental sync for datasource: ${datasource.name}`);

    const syncJob = this.syncJobRepository.create({
      datasourceId,
      type: 'incremental',
      status: 'pending',
      metadata: {
        startedBy: 'manual',
        datasourceName: datasource.name,
      },
    });

    const savedJob = await this.syncJobRepository.save(syncJob);

    await this.syncQueue.add('incremental-sync', {
      jobId: savedJob.id,
      datasourceId,
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });

    this.logger.log(`Incremental sync job created: ${savedJob.id}`);
    return savedJob;
  }

  async triggerWebhookSync(datasourceId: string, codes: string[]): Promise<SyncJob> {
    const datasource = await this.datasourcesService.findOne(datasourceId);

    this.logger.log(`Triggering webhook sync for ${codes.length} codes`);

    const syncJob = this.syncJobRepository.create({
      datasourceId,
      type: 'webhook',
      status: 'pending',
      totalRecords: codes.length,
      metadata: {
        startedBy: 'webhook',
        datasourceName: datasource.name,
        codes,
      },
    });

    const savedJob = await this.syncJobRepository.save(syncJob);

    await this.syncQueue.add('webhook-sync', {
      jobId: savedJob.id,
      datasourceId,
      codes,
    }, {
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 3000,
      },
    });

    this.logger.log(`Webhook sync job created: ${savedJob.id}`);
    return savedJob;
  }

  async findAllJobs(datasourceId?: string): Promise<SyncJob[]> {
    const where = datasourceId ? { datasourceId } : {};
    return await this.syncJobRepository.find({
      where,
      relations: ['datasource'],
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async findOneJob(id: string): Promise<SyncJob> {
    const job = await this.syncJobRepository.findOne({
      where: { id },
      relations: ['datasource', 'errors'],
    });

    if (!job) {
      throw new NotFoundException(`Sync job with ID ${id} not found`);
    }

    return job;
  }

  async cancelJob(id: string): Promise<SyncJob> {
    const job = await this.findOneJob(id);

    if (job.status !== 'pending' && job.status !== 'running') {
      throw new Error(`Cannot cancel job in status: ${job.status}`);
    }

    job.status = 'cancelled';
    job.completedAt = new Date();

    // Try to remove from queue
    const bullJobs = await this.syncQueue.getJobs(['waiting', 'active', 'delayed']);
    const bullJob = bullJobs.find((bj) => bj.data.jobId === id);
    if (bullJob) {
      await bullJob.remove();
    }

    return await this.syncJobRepository.save(job);
  }

  async getJobErrors(jobId: string): Promise<SyncError[]> {
    return await this.syncErrorRepository.find({
      where: { syncJobId: jobId },
      order: { createdAt: 'DESC' },
    });
  }

  async retryErrors(jobId: string): Promise<SyncJob> {
    const job = await this.findOneJob(jobId);
    const errors = await this.getJobErrors(jobId);

    if (errors.length === 0) {
      throw new Error('No errors to retry');
    }

    // Extract codes from errors
    const codes = errors
      .filter((e) => e.recordIdentifier)
      .map((e) => e.recordIdentifier);

    if (codes.length === 0) {
      throw new Error('No valid record identifiers found in errors');
    }

    // Create new webhook sync job for retry
    return await this.triggerWebhookSync(job.datasourceId, codes);
  }

  async updateJobStatus(
    jobId: string,
    status: 'running' | 'completed' | 'failed',
    updates?: Partial<SyncJob>,
  ): Promise<void> {
    const job = await this.syncJobRepository.findOne({ where: { id: jobId } });
    if (!job) {
      this.logger.error(`Job ${jobId} not found for status update`);
      return;
    }

    job.status = status;

    if (status === 'running' && !job.startedAt) {
      job.startedAt = new Date();
    }

    if (status === 'completed' || status === 'failed') {
      job.completedAt = new Date();
    }

    if (updates) {
      Object.assign(job, updates);
    }

    await this.syncJobRepository.save(job);

    // Update datasource lastSyncedAt on successful completion
    if (status === 'completed' && job.datasourceId) {
      try {
        await this.datasourcesService.updateLastSyncTime(job.datasourceId);
        this.logger.log(`Updated lastSyncedAt for datasource: ${job.datasourceId}`);
      } catch (error) {
        this.logger.error(`Failed to update lastSyncedAt: ${error.message}`);
      }
    }
  }

  async incrementJobProgress(
    jobId: string,
    processed: number,
    successful: number,
    failed: number,
  ): Promise<void> {
    await this.syncJobRepository.increment({ id: jobId }, 'processedRecords', processed);
    await this.syncJobRepository.increment({ id: jobId }, 'successfulRecords', successful);
    await this.syncJobRepository.increment({ id: jobId }, 'failedRecords', failed);
  }

  async logError(
    jobId: string,
    recordIdentifier: string | null,
    errorType: string,
    errorMessage: string,
    recordData?: any,
  ): Promise<void> {
    const error = this.syncErrorRepository.create({
      syncJobId: jobId,
      recordIdentifier,
      errorType,
      errorMessage,
      recordData,
    });

    await this.syncErrorRepository.save(error);
  }

  async markJobAsFailed(jobId: string, errorMessage: string): Promise<void> {
    await this.updateJobStatus(jobId, 'failed', {
      errorMessage,
    });
    this.logger.warn(`Job ${jobId} marked as failed: ${errorMessage}`);
  }

  async findStaleJobs(): Promise<SyncJob[]> {
    // Find jobs that are running but haven't been started or updated in 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    return await this.syncJobRepository
      .createQueryBuilder('job')
      .where('job.status = :status', { status: 'running' })
      .andWhere('job.startedAt < :thirtyMinutesAgo', { thirtyMinutesAgo })
      .getMany();
  }

  async deleteOldJobs(daysToKeep: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.syncJobRepository
      .createQueryBuilder()
      .delete()
      .where('status IN (:...statuses)', { statuses: ['completed', 'cancelled'] })
      .andWhere('completedAt < :cutoffDate', { cutoffDate })
      .execute();

    return result.affected || 0;
  }
}
