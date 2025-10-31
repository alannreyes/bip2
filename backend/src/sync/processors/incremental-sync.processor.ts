import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { SyncService } from '../sync.service';
import { DatasourcesService } from '../../datasources/datasources.service';
import { QdrantService } from '../../qdrant/qdrant.service';
import { GeminiEmbeddingService } from '../../embeddings/gemini-embedding.service';
import { IBaseConnector } from '../../datasources/connectors/base-connector.interface';
import { MssqlConnector } from '../../datasources/connectors/mssql.connector';
import { MysqlConnector } from '../../datasources/connectors/mysql.connector';
import { PostgresqlConnector } from '../../datasources/connectors/postgresql.connector';

@Processor('sync')
export class IncrementalSyncProcessor {
  private readonly logger = new Logger(IncrementalSyncProcessor.name);
  // Default rate limiting delay between batches (in milliseconds)
  private readonly DEFAULT_BATCH_DELAY = 1000; // 1 second

  constructor(
    private readonly syncService: SyncService,
    private readonly datasourcesService: DatasourcesService,
    private readonly qdrantService: QdrantService,
    private readonly geminiService: GeminiEmbeddingService,
    private readonly mssqlConnector: MssqlConnector,
    private readonly mysqlConnector: MysqlConnector,
    private readonly postgresqlConnector: PostgresqlConnector,
  ) {}

  @Process('incremental-sync')
  async handleIncrementalSync(job: Job) {
    const { jobId, datasourceId } = job.data;

    this.logger.log(`Starting incremental sync job: ${jobId}`);

    try {
      await this.syncService.updateJobStatus(jobId, 'running');

      // Get datasource
      const datasource = await this.datasourcesService.findOne(datasourceId);
      const connector = this.getConnector(datasource.type);

      // Get last sync timestamp
      const lastSyncedAt = datasource.lastSyncedAt || new Date(0);

      // Build query with timestamp filter
      const incrementalQuery = this.buildIncrementalQuery(
        datasource.queryTemplate,
        lastSyncedAt,
      );

      this.logger.log(
        `Fetching records updated since: ${lastSyncedAt.toISOString()}`,
      );

      // Get total count of updated records
      const totalCount = await this.getTotalCount(datasource, connector, lastSyncedAt);

      this.logger.log(`Found ${totalCount} records to sync`);

      if (totalCount === 0) {
        await this.syncService.updateJobStatus(jobId, 'completed', {
          totalRecords: 0,
          processedRecords: 0,
          successfulRecords: 0,
          failedRecords: 0,
        });
        return;
      }

      // Update total records
      await this.syncService.updateJobStatus(jobId, 'running', {
        totalRecords: totalCount,
      });

      // Process in batches with configurable size and rate limiting
      const batchSize = datasource.batchSize || 100;
      const batchDelay = datasource.batchDelay || this.DEFAULT_BATCH_DELAY;
      const totalBatches = Math.ceil(totalCount / batchSize);

      this.logger.log(`Processing in ${totalBatches} batches (size: ${batchSize}, delay: ${batchDelay}ms)`);

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const offset = batchIndex * batchSize;

        this.logger.debug(
          `Processing batch ${batchIndex + 1}/${totalBatches} (offset: ${offset})`,
        );

        try {
          const result = await connector.executeQuery(
            datasource.connectionConfig,
            incrementalQuery,
            { offset, limit: batchSize },
          );

          if (result.rows.length === 0) {
            continue;
          }

          // Build embedding texts
          const texts = result.rows.map((row) =>
            this.buildEmbeddingText(row, datasource.embeddingFields),
          );

          // Generate embeddings in batch
          const embeddings = await this.geminiService.generateBatchEmbeddings(texts);

          // Build Qdrant points with proper ID handling
          const points = result.rows.map((row, index) => {
            const id = this.extractAndConvertId(row, datasource.idField, index);
            const payload = this.mapFields(row, datasource.fieldMapping);

            // Store original ID in payload for reference
            const originalId = datasource.idField ? row[datasource.idField] : null;
            if (originalId !== undefined && originalId !== null) {
              payload['_original_id'] = String(originalId);
            }

            return {
              id,
              vector: embeddings[index],
              payload,
            };
          });

          // Upsert to Qdrant (will update existing or insert new)
          await this.qdrantService.upsertPoints(
            datasource.qdrantCollection,
            points,
            datasource.qdrantHost,
            datasource.qdrantPort,
          );

          // Update progress
          await this.syncService.incrementJobProgress(
            jobId,
            result.rows.length,
            result.rows.length,
            0,
          );

          // Update job progress percentage
          job.progress((batchIndex + 1) / totalBatches * 100);

          this.logger.debug(
            `Batch ${batchIndex + 1} completed: ${result.rows.length} records`,
          );

          // Rate limiting: Add delay between batches (except for the last batch)
          if (batchIndex < totalBatches - 1 && batchDelay > 0) {
            this.logger.debug(`Waiting ${batchDelay}ms before next batch...`);
            await this.sleep(batchDelay);
          }
        } catch (error) {
          this.logger.error(
            `Error processing batch ${batchIndex + 1}: ${error.message}`,
          );

          // Log batch error but continue
          await this.syncService.logError(
            jobId,
            null,
            'BATCH_ERROR',
            `Batch ${batchIndex + 1} failed: ${error.message}`,
          );

          await this.syncService.incrementJobProgress(
            jobId,
            batchSize,
            0,
            batchSize,
          );
        }
      }

      // Update datasource last synced time
      await this.datasourcesService.updateLastSyncTime(datasourceId);

      // Mark as completed
      await this.syncService.updateJobStatus(jobId, 'completed');

      this.logger.log(`Incremental sync job ${jobId} completed successfully`);
    } catch (error) {
      this.logger.error(`Incremental sync job ${jobId} failed: ${error.message}`);
      await this.syncService.updateJobStatus(jobId, 'failed', {
        errorMessage: error.message,
      });
      throw error;
    }
  }

  private getConnector(type: string): IBaseConnector {
    switch (type) {
      case 'mssql':
        return this.mssqlConnector;
      case 'mysql':
        return this.mysqlConnector;
      case 'postgresql':
        return this.postgresqlConnector;
      default:
        throw new Error(`Unknown datasource type: ${type}`);
    }
  }

  private buildIncrementalQuery(
    queryTemplate: string,
    lastSyncedAt: Date,
  ): string {
    // Format date for MySQL: 'YYYY-MM-DD HH:MM:SS'
    const formattedDate = lastSyncedAt.toISOString().slice(0, 19).replace('T', ' ');

    // Check if query has WHERE clause
    const hasWhere = /WHERE/i.test(queryTemplate);

    // Extract the base query (before ORDER BY, OFFSET, LIMIT)
    const baseQueryMatch = queryTemplate.match(/^([\s\S]*?)(?=\s+ORDER BY|\s+OFFSET|\s+LIMIT|$)/i);
    const baseQuery = baseQueryMatch ? baseQueryMatch[1] : queryTemplate;

    // Extract ORDER BY, OFFSET, LIMIT clauses if they exist
    const orderByMatch = queryTemplate.match(/ORDER BY[\s\S]*?(?=OFFSET|LIMIT|$)/i);
    const orderByClause = orderByMatch ? orderByMatch[0] : '';

    // Build incremental WHERE condition
    const incrementalCondition = `updated_at > '${formattedDate}'`;

    // Combine query parts
    let incrementalQuery;
    if (hasWhere) {
      // Add to existing WHERE clause with AND
      incrementalQuery = `${baseQuery} AND ${incrementalCondition} ${orderByClause}`.trim();
    } else {
      // Add new WHERE clause
      incrementalQuery = `${baseQuery} WHERE ${incrementalCondition} ${orderByClause}`.trim();
    }

    return incrementalQuery;
  }

  private async getTotalCount(
    datasource: any,
    connector: IBaseConnector,
    lastSyncedAt: Date,
  ): Promise<number> {
    try {
      // Format date for MySQL: 'YYYY-MM-DD HH:MM:SS'
      const formattedDate = lastSyncedAt.toISOString().slice(0, 19).replace('T', ' ');

      // Build count query from template
      const fromMatch = datasource.queryTemplate.match(
        /FROM\s+([^\s;]+)/i,
      );
      if (!fromMatch) {
        throw new Error('Could not extract FROM clause from query template');
      }

      const tableName = fromMatch[1];
      const whereMatch = datasource.queryTemplate.match(
        /WHERE\s+(.+?)(?:ORDER BY|OFFSET|FETCH|$)/is,
      );

      let countQuery = `SELECT COUNT(*) as total FROM ${tableName}`;

      if (whereMatch) {
        countQuery += ` WHERE ${whereMatch[1]} AND updated_at > '${formattedDate}'`;
      } else {
        countQuery += ` WHERE updated_at > '${formattedDate}'`;
      }

      const result = await connector.executeQuery(
        datasource.connectionConfig,
        countQuery,
      );

      return parseInt(result.rows[0]?.total || '0', 10);
    } catch (error) {
      this.logger.warn(
        `Could not get count for incremental sync: ${error.message}. Proceeding with estimation.`,
      );
      return 0;
    }
  }

  private buildEmbeddingText(row: any, embeddingFields: string[]): string {
    const parts = embeddingFields
      .map((field) => {
        const value = row[field];
        return value ? String(value).trim() : '';
      })
      .filter((part) => part.length > 0);

    return parts.join(' | ');
  }

  private extractAndConvertId(row: any, idField: string, index: number): number {
    // Extract ID from the specified idField (raw column name)
    const originalId = idField ? row[idField] : null;

    if (originalId !== undefined && originalId !== null) {
      // Convert to numeric ID for Qdrant
      if (typeof originalId === 'number') {
        return originalId;
      } else {
        const strId = String(originalId);
        const numericId = parseInt(strId, 10);

        if (!isNaN(numericId) && String(numericId) === strId) {
          // Pure numeric string - use as is
          return numericId;
        } else {
          // Alphanumeric or non-numeric string - convert using hash
          return this.stringToNumericId(strId);
        }
      }
    } else {
      // Fallback to index-based integer ID
      return Date.now() * 1000 + index;
    }
  }

  private stringToNumericId(str: string): number {
    // Simple hash function to convert string to positive integer
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Ensure positive and within safe integer range
    return Math.abs(hash) % Number.MAX_SAFE_INTEGER;
  }

  private mapFields(
    row: any,
    fieldMapping: Record<string, string>,
  ): Record<string, any> {
    const payload: Record<string, any> = {};

    for (const [sourceField, targetField] of Object.entries(fieldMapping)) {
      if (row.hasOwnProperty(sourceField)) {
        payload[targetField] = row[sourceField];
      }
    }

    return payload;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
