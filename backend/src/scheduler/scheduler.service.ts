import { Injectable, Logger } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Datasource } from '../datasources/entities/datasource.entity';
import { SyncService } from '../sync/sync.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectRepository(Datasource)
    private readonly datasourceRepository: Repository<Datasource>,
    private readonly syncService: SyncService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  async onModuleInit() {
    try {
      await this.initializeScheduledSyncs();
    } catch (error) {
      this.logger.warn(`Failed to initialize scheduled syncs on startup: ${error.message}. Will retry when database is ready.`);
    }
  }

  /**
   * Initialize all scheduled syncs from database
   */
  async initializeScheduledSyncs() {
    try {
      this.logger.log('Initializing scheduled syncs...');

      const datasources = await this.datasourceRepository.find({
        where: {
          status: 'active',
        },
      });

    for (const datasource of datasources) {
      if (datasource.syncSchedule) {
        try {
          await this.addCronJob(datasource.id, datasource.syncSchedule);
          this.logger.log(
            `Scheduled sync for datasource ${datasource.name} with cron: ${datasource.syncSchedule}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to schedule sync for datasource ${datasource.name}: ${error.message}`,
          );
        }
      }
    }

      this.logger.log('Scheduled syncs initialized');
    } catch (error) {
      this.logger.warn(`Error during scheduled syncs initialization: ${error.message}`);
    }
  }

  /**
   * Add a cron job for a datasource
   */
  async addCronJob(datasourceId: string, cronExpression: string) {
    const jobName = `sync-${datasourceId}`;

    // Remove existing job if any
    try {
      const existingJob = this.schedulerRegistry.getCronJob(jobName);
      if (existingJob) {
        existingJob.stop();
        this.schedulerRegistry.deleteCronJob(jobName);
      }
    } catch (error) {
      // Job doesn't exist, continue
    }

    // Create new cron job
    const job = new CronJob(cronExpression, async () => {
      this.logger.log(`Executing scheduled sync for datasource: ${datasourceId}`);
      try {
        await this.syncService.triggerFullSync(datasourceId);
      } catch (error) {
        this.logger.error(
          `Scheduled sync failed for datasource ${datasourceId}: ${error.message}`,
        );
      }
    });

    this.schedulerRegistry.addCronJob(jobName, job);
    job.start();

    this.logger.log(`Cron job ${jobName} added with expression: ${cronExpression}`);
  }

  /**
   * Remove a cron job for a datasource
   */
  async removeCronJob(datasourceId: string) {
    const jobName = `sync-${datasourceId}`;

    try {
      const job = this.schedulerRegistry.getCronJob(jobName);
      job.stop();
      this.schedulerRegistry.deleteCronJob(jobName);
      this.logger.log(`Cron job ${jobName} removed`);
    } catch (error) {
      this.logger.warn(`No cron job found to remove: ${jobName}`);
    }
  }

  /**
   * Update a cron job (remove and add with new schedule)
   */
  async updateCronJob(datasourceId: string, cronExpression: string) {
    await this.removeCronJob(datasourceId);
    if (cronExpression) {
      await this.addCronJob(datasourceId, cronExpression);
    }
  }

  /**
   * Health check - runs every 5 minutes
   * Checks for stale running jobs and marks them as failed
   */
  @Cron('*/5 * * * *')
  async checkStaleJobs() {
    this.logger.debug('Checking for stale sync jobs...');

    const staleJobs = await this.syncService.findStaleJobs();

    if (staleJobs.length > 0) {
      this.logger.warn(`Found ${staleJobs.length} stale jobs`);
      for (const job of staleJobs) {
        await this.syncService.markJobAsFailed(
          job.id,
          'Job marked as failed due to timeout (no progress for over 30 minutes)',
        );
      }
    }
  }

  /**
   * Cleanup old completed jobs - runs daily at 2 AM
   */
  @Cron('0 2 * * *')
  async cleanupOldJobs() {
    this.logger.log('Cleaning up old completed jobs...');

    const daysToKeep = 30;
    const deletedCount = await this.syncService.deleteOldJobs(daysToKeep);

    this.logger.log(`Deleted ${deletedCount} old jobs`);
  }

  /**
   * Get all scheduled jobs info
   */
  getScheduledJobs() {
    const jobs = this.schedulerRegistry.getCronJobs();
    const jobsInfo = [];

    jobs.forEach((job, name) => {
      jobsInfo.push({
        name,
        running: (job as any).running || false,
        lastDate: job.lastDate(),
        nextDate: job.nextDate(),
      });
    });

    return jobsInfo;
  }
}
