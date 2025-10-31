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
export class WebhookSyncProcessor {
  private readonly logger = new Logger(WebhookSyncProcessor.name);

  constructor(
    private readonly syncService: SyncService,
    private readonly datasourcesService: DatasourcesService,
    private readonly qdrantService: QdrantService,
    private readonly geminiService: GeminiEmbeddingService,
    private readonly mssqlConnector: MssqlConnector,
    private readonly mysqlConnector: MysqlConnector,
    private readonly postgresqlConnector: PostgresqlConnector,
  ) {}

  @Process('webhook-sync')
  async handleWebhookSync(job: Job) {
    const { jobId, datasourceId, codes } = job.data;
    this.logger.log(`Starting webhook sync job: ${jobId} with ${codes.length} codes`);

    try {
      await this.syncService.updateJobStatus(jobId, 'running');

      const datasource = await this.datasourcesService.findOne(datasourceId);
      const connector = this.getConnector(datasource.type);

      let successCount = 0;
      let failCount = 0;

      // Process codes in smaller batches
      const batchSize = 20;
      for (let i = 0; i < codes.length; i += batchSize) {
        const batch = codes.slice(i, i + batchSize);

        for (const code of batch) {
          try {
            await this.processCode(jobId, datasource, connector, code);
            successCount++;
          } catch (error) {
            this.logger.error(`Failed to process code ${code}: ${error.message}`);
            await this.syncService.logError(
              jobId,
              code,
              'code_processing_error',
              error.message,
            );
            failCount++;
          }
        }

        // Update progress
        await this.syncService.incrementJobProgress(jobId, batch.length, successCount, failCount);
        job.progress(((i + batch.length) / codes.length) * 100);
      }

      await this.syncService.updateJobStatus(jobId, 'completed');
      this.logger.log(`Webhook sync completed: ${successCount} success, ${failCount} failed`);

    } catch (error) {
      this.logger.error(`Webhook sync job failed: ${error.message}`, error.stack);
      await this.syncService.updateJobStatus(jobId, 'failed', {
        errorMessage: error.message,
      });
      throw error;
    }
  }

  private async processCode(
    jobId: string,
    datasource: any,
    connector: any,
    code: string,
  ): Promise<void> {
    // Build query to fetch this specific code
    const query = this.buildCodeQuery(
      datasource.queryTemplate,
      code,
      datasource.idField || 'Articulo_Codigo',
      'A' // Table alias - could be configurable in future
    );

    // Execute query
    const result = await connector.executeQuery(datasource.connectionConfig, query);

    if (result.rows.length === 0) {
      // Code not found in source DB - delete from Qdrant
      const pointId = uuidv5(code, PRODUCT_CODE_NAMESPACE);
      this.logger.debug(`Code ${code} not found in source, deleting from Qdrant (UUID: ${pointId})`);
      await this.qdrantService.deletePoints(datasource.qdrantCollection, [pointId]);
      return;
    }

    // Code exists - upsert to Qdrant
    const row = result.rows[0];

    // Build embedding text
    const text = this.buildEmbeddingText(row, datasource.embeddingFields);

    // Generate embedding
    const embedding = await this.geminiService.generateEmbedding(text);

    // Map fields
    const payload = this.mapFields(row, datasource.fieldMapping);

    // Store the original code in the payload for reference
    const codeStr = String(code).trim();
    payload._original_id = codeStr;

    // Convert code to UUID for Qdrant point ID
    const pointId = uuidv5(codeStr, PRODUCT_CODE_NAMESPACE);

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(pointId)) {
      throw new Error(`Generated invalid UUID: ${pointId} for code: ${code}`);
    }

    // Upsert to Qdrant
    const point = {
      id: pointId,
      vector: embedding,
      payload,
    };

    await this.qdrantService.upsertPoints(datasource.qdrantCollection, [point]);
    this.logger.debug(`Upserted code ${code} (UUID: ${pointId}) to Qdrant`);
  }

  private buildCodeQuery(queryTemplate: string, code: string, idField: string = 'Articulo_Codigo', tableAlias: string = 'A'): string {
    // Remove placeholders {{offset}} and {{limit}} first
    let query = queryTemplate
      .replace(/\{\{offset\}\}/g, '0')
      .replace(/\{\{limit\}\}/g, '1');

    // Find WHERE clause and add code filter
    const whereMatch = query.match(/WHERE[\s\S]*?(?=ORDER BY|OFFSET|$)/i);
    if (whereMatch) {
      const originalWhere = whereMatch[0];
      const codeCondition = `AND ${tableAlias}.${idField} = '${code}'`;
      const newWhere = originalWhere + ' ' + codeCondition;
      query = query.replace(originalWhere, newWhere);
    }

    // Remove ORDER BY, OFFSET, and FETCH NEXT clauses (not needed when fetching single code)
    query = query
      .replace(/ORDER BY[\s\S]*?(?=OFFSET|FETCH|$)/gi, '')
      .replace(/OFFSET[\s\S]*?ROWS/gi, '')
      .replace(/FETCH NEXT[\s\S]*?ROWS ONLY/gi, '')
      .trim();

    return query;
  }

  private buildEmbeddingText(row: any, embeddingFields: string[]): string {
    const parts = embeddingFields
      .map((field) => row[field])
      .filter((value) => value != null && value !== '')
      .map((value) => String(value).trim());

    return parts.join(' ');
  }

  private mapFields(row: any, fieldMapping: Record<string, string>): Record<string, any> {
    const mapped: Record<string, any> = {};

    for (const [sourceField, targetField] of Object.entries(fieldMapping)) {
      const value = row[sourceField];
      mapped[targetField] = value;
    }

    return mapped;
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
}
