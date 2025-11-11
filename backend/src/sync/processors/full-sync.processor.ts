import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { SyncService } from '../sync.service';
import { DatasourcesService } from '../../datasources/datasources.service';
import { QdrantService } from '../../qdrant/qdrant.service';
import { GeminiEmbeddingService } from '../../embeddings/gemini-embedding.service';
import { MssqlConnector } from '../../datasources/connectors/mssql.connector';
import { MysqlConnector } from '../../datasources/connectors/mysql.connector';
import { PostgresqlConnector } from '../../datasources/connectors/postgresql.connector';
import { v5 as uuidv5 } from 'uuid';

// UUID namespace for generating deterministic UUIDs from product codes
const PRODUCT_CODE_NAMESPACE = 'b3c3e1c0-4d3e-4b3a-9c3e-1c0d3e4b3a9c';

@Processor('sync')
export class FullSyncProcessor {
  private readonly logger = new Logger(FullSyncProcessor.name);

  constructor(
    private readonly syncService: SyncService,
    private readonly datasourcesService: DatasourcesService,
    private readonly qdrantService: QdrantService,
    private readonly geminiService: GeminiEmbeddingService,
    private readonly mssqlConnector: MssqlConnector,
    private readonly mysqlConnector: MysqlConnector,
    private readonly postgresqlConnector: PostgresqlConnector,
  ) {}

  @Process('full-sync')
  async handleFullSync(job: Job) {
    const { jobId, datasourceId } = job.data;
    this.logger.log(`Starting full sync job: ${jobId}`);

    try {
      // 🧠 SMART RESUME: Detectar si debemos reanudar desde un punto anterior
      const resumeInfo = await this.syncService.checkIfJobShouldResume(jobId);
      
      if (resumeInfo.shouldResume) {
        this.logger.log(`🎯 SMART RESUME ACTIVATED: Resuming from record ${resumeInfo.lastOffset}`);
        this.logger.log(`💰 COST SAVINGS: Avoiding reprocessing of ${resumeInfo.stats.estimatedRecordsSaved} records`);
        this.logger.log(`📊 PROGRESS: ${resumeInfo.stats.progressPercent}% already completed`);
      } else {
        this.logger.log(`🆕 NEW SYNC: Starting from beginning - ${resumeInfo.stats.reason}`);
      }

      // Update job status to running (but preserve existing progress if resuming)
      await this.syncService.updateJobStatus(jobId, 'running');

      // Get datasource configuration
      const datasource = await this.datasourcesService.findOne(datasourceId);
      const connector = this.getConnector(datasource.type);

      // Get total count
      const totalCount = await this.getTotalCount(datasource, connector);
      this.logger.log(`Total records to sync: ${totalCount}`);

      await this.syncService.updateJobStatus(jobId, 'running', {
        totalRecords: totalCount,
      });

      // Process in batches
      const batchSize = 100;
      const totalBatches = Math.ceil(totalCount / batchSize);
      
      // 🔄 RESUME: Calcular desde qué batch empezar
      const startBatchIndex = Math.floor(resumeInfo.lastOffset / batchSize);
      
      if (resumeInfo.shouldResume) {
        this.logger.log(`📈 RESUME DETAILS: Starting from batch ${startBatchIndex + 1}/${totalBatches} (offset: ${resumeInfo.lastOffset})`);
        this.logger.log(`⏭️  SKIPPING: ${startBatchIndex} batches (${resumeInfo.lastOffset} records) already processed`);
      }

      for (let batchIndex = startBatchIndex; batchIndex < totalBatches; batchIndex++) {
        const offset = batchIndex * batchSize;

        this.logger.debug(`Processing batch ${batchIndex + 1}/${totalBatches} (offset: ${offset})`);

        try {
          // Fetch batch from source database
          const result = await connector.executeQuery(
            datasource.connectionConfig,
            datasource.queryTemplate,
            { offset, limit: batchSize },
          );

          const rows = result.rows;

          if (rows.length === 0) {
            this.logger.debug(`No more rows to process`);
            break;
          }

          // Process batch
          await this.processBatch(jobId, datasource, rows);

          // Update progress
          const progressPercent = Math.round(((batchIndex + 1) / totalBatches) * 100);
          job.progress(progressPercent);

          // 📊 ENHANCED LOGGING: Log progress every 10 batches
          if ((batchIndex + 1) % 10 === 0 || batchIndex === startBatchIndex) {
            const recordsProcessed = (batchIndex + 1) * batchSize;
            const recordsRemaining = totalCount - recordsProcessed;
            this.logger.log(`🔄 BATCH PROGRESS: ${batchIndex + 1}/${totalBatches} (${progressPercent}%) - Processed: ${recordsProcessed}/${totalCount}, Remaining: ${recordsRemaining}`);
          }

        } catch (error) {
          this.logger.error(`Batch ${batchIndex + 1} failed: ${error.message}`);
          await this.syncService.logError(
            jobId,
            null,
            'batch_error',
            `Batch ${batchIndex + 1} failed: ${error.message}`,
            { batchIndex, offset },
          );
          // Continue with next batch
        }
      }

      // Mark job as completed
      await this.syncService.updateJobStatus(jobId, 'completed');
      this.logger.log(`Full sync job completed: ${jobId}`);

    } catch (error) {
      this.logger.error(`Full sync job failed: ${error.message}`, error.stack);
      await this.syncService.updateJobStatus(jobId, 'failed', {
        errorMessage: error.message,
      });
      throw error;
    }
  }

  private async processBatch(jobId: string, datasource: any, rows: any[]): Promise<void> {
    // Build texts for embedding
    const texts = rows.map((row) => this.buildEmbeddingText(row, datasource.embeddingFields));

    // Generate embeddings in batch
    let embeddings: number[][];
    try {
      embeddings = await this.geminiService.generateBatchEmbeddings(texts);
    } catch (error) {
      this.logger.error(`Failed to generate embeddings: ${error.message}`);
      await this.syncService.incrementJobProgress(jobId, rows.length, 0, rows.length);
      await this.syncService.logError(
        jobId,
        null,
        'embedding_error',
        `Failed to generate embeddings: ${error.message}`,
      );
      return;
    }

    // Build Qdrant points
    const points = rows.map((row, index) => {
      // Apply field mapping to transform raw column names to mapped names
      const payload: Record<string, any> = {};
      const fieldMapping = datasource.fieldMapping || {};

      for (const [sourceField, targetField] of Object.entries(fieldMapping)) {
        if (row[sourceField] !== undefined) {
          payload[targetField as string] = row[sourceField];
        }
      }

      // Extract ID from the specified idField (raw column name)
      let pointId: string;
      const originalId = datasource.idField ? row[datasource.idField] : null;

      if (originalId !== undefined && originalId !== null) {
        const codeStr = String(originalId).trim();

        // Validate that we have a non-empty string
        if (!codeStr) {
          this.logger.warn(`Empty ID found for row, using fallback UUID`);
          const fallbackId = `fallback-${Date.now()}-${index}`;
          pointId = uuidv5(fallbackId, PRODUCT_CODE_NAMESPACE);
        } else {
          // Store original ID in payload for reference
          payload['_original_id'] = codeStr;

          // Convert to UUID for Qdrant point ID (deterministic UUID v5)
          pointId = uuidv5(codeStr, PRODUCT_CODE_NAMESPACE);
        }
      } else {
        // Fallback to timestamp-based UUID if no ID field
        const fallbackId = `fallback-${Date.now()}-${index}`;
        pointId = uuidv5(fallbackId, PRODUCT_CODE_NAMESPACE);
      }

      return {
        id: pointId,
        vector: embeddings[index],
        payload,
      };
    });

    // Validate all UUIDs before sending to Qdrant
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const invalidPoints = points.filter(p => !uuidRegex.test(p.id));

    if (invalidPoints.length > 0) {
      this.logger.error(`Found ${invalidPoints.length} invalid UUIDs in batch!`);
      invalidPoints.slice(0, 3).forEach(p => {
        this.logger.error(`Invalid UUID: "${p.id}" for original ID: "${p.payload._original_id}"`);
      });

      await this.syncService.incrementJobProgress(jobId, rows.length, 0, rows.length);
      await this.syncService.logError(
        jobId,
        null,
        'uuid_validation_error',
        `Found ${invalidPoints.length} invalid UUIDs in batch`,
        { sampleInvalidIds: invalidPoints.slice(0, 5).map(p => ({ uuid: p.id, originalId: p.payload._original_id })) },
      );
      return;
    }

    // Log point structure before upsert
    if (points.length > 0) {
      this.logger.debug(`First point ID: ${points[0].id}, Vector length: ${points[0].vector.length}, Payload keys: ${Object.keys(points[0].payload).join(', ')}`);
      this.logger.debug(`First point payload: ${JSON.stringify(points[0].payload)}`);
    }

    // Upsert to Qdrant
    try {
      await this.qdrantService.upsertPoints(
        datasource.qdrantCollection,
        points,
        datasource.qdrantHost,
        datasource.qdrantPort,
      );
      await this.syncService.incrementJobProgress(jobId, rows.length, rows.length, 0);
      this.logger.debug(`Upserted ${points.length} points to Qdrant`);
    } catch (error) {
      this.logger.error(`Failed to upsert batch to Qdrant: ${error.message}`);
      this.logger.error(`Error stack: ${error.stack}`);

      // Extract more details from the error
      const errorDetails: any = {
        message: error.message,
        batchSize: points.length,
        firstPointId: points[0]?.id,
        firstOriginalId: points[0]?.payload?._original_id,
      };

      // Try to extract Qdrant-specific error details
      if (error.response?.data) {
        errorDetails.qdrantError = error.response.data;
        this.logger.error(`Qdrant response: ${JSON.stringify(error.response.data)}`);
      }

      // Log a few sample point IDs for debugging
      const sampleIds = points.slice(0, 5).map(p => ({
        id: p.id,
        originalId: p.payload._original_id,
      }));
      this.logger.error(`Sample point IDs in failed batch: ${JSON.stringify(sampleIds)}`);

      await this.syncService.incrementJobProgress(jobId, rows.length, 0, rows.length);
      await this.syncService.logError(
        jobId,
        points[0]?.payload?._original_id,
        'qdrant_error',
        `Failed to upsert to Qdrant: ${error.message}`,
        errorDetails,
      );
    }
  }

  private buildEmbeddingText(row: any, embeddingFields: string[]): string {
    const parts = embeddingFields
      .map((field) => row[field])
      .filter((value) => value != null && value !== '')
      .map((value) => String(value).trim());

    return parts.join(' ');
  }

  private getConnector(type: string) {
    switch (type) {
      case 'mssql':
        return this.mssqlConnector;
      case 'mysql':
        return this.mysqlConnector;
      case 'postgresql':
        return this.postgresqlConnector;
      default:
        throw new Error(`Unsupported datasource type: ${type}`);
    }
  }

  private async getTotalCount(datasource: any, connector: any): Promise<number> {
    try {
      // Use the datasource service's preview method which has the correct count logic for CTEs
      const preview = await this.datasourcesService.previewData(datasource.id, 1);
      return preview.total;
    } catch (error) {
      this.logger.error(`Failed to get total count: ${error.message}`);
      this.logger.warn(`Using fallback: will sync until no more records found`);
      // Return a large number as fallback to continue syncing
      return 999999;
    }
  }

}
