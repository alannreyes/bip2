import { Injectable, NotFoundException, BadRequestException, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Datasource } from './entities/datasource.entity';
import { CreateDatasourceDto } from './dto/create-datasource.dto';
import { UpdateDatasourceDto } from './dto/update-datasource.dto';
import { MssqlConnector } from './connectors/mssql.connector';
import { MysqlConnector } from './connectors/mysql.connector';
import { PostgresqlConnector } from './connectors/postgresql.connector';
import { IBaseConnector } from './connectors/base-connector.interface';
import { QdrantService } from '../qdrant/qdrant.service';
import { SyncJob } from '../sync/entities/sync-job.entity';
import { AIErrorCorrectionService } from '../common/ai-error-correction.service';
import * as crypto from 'crypto';

@Injectable()
export class DatasourcesService {
  private readonly logger = new Logger(DatasourcesService.name);

  constructor(
    @InjectRepository(Datasource)
    private readonly datasourceRepository: Repository<Datasource>,
    @InjectRepository(SyncJob)
    private readonly syncJobRepository: Repository<SyncJob>,
    private readonly mssqlConnector: MssqlConnector,
    private readonly mysqlConnector: MysqlConnector,
    private readonly postgresqlConnector: PostgresqlConnector,
    private readonly qdrantService: QdrantService,
    private readonly aiErrorService: AIErrorCorrectionService,
  ) {}

  async create(createDatasourceDto: CreateDatasourceDto): Promise<Datasource> {
    try {
      // Generate webhook secret if enabled
      let webhookSecret = null;
      if (createDatasourceDto.webhookEnabled) {
        webhookSecret = this.generateWebhookSecret();
      }

      const datasource = this.datasourceRepository.create({
        ...createDatasourceDto,
        webhookSecret,
        status: 'active',
      });

      return await this.datasourceRepository.save(datasource);
    } catch (error) {
      this.logger.error(`Failed to create datasource: ${error.message}`);
      throw new BadRequestException(`Failed to create datasource: ${error.message}`);
    }
  }

  async findAll(): Promise<Datasource[]> {
    const datasources = await this.datasourceRepository.find({
      order: { createdAt: 'DESC' },
    });

    // For each datasource, get the current running job if any
    const datasourcesWithJobStatus = await Promise.all(
      datasources.map(async (datasource) => {
        const runningJob = await this.syncJobRepository.findOne({
          where: {
            datasourceId: datasource.id,
            status: 'running',
          },
          order: { createdAt: 'DESC' },
        });

        // Add running job info to datasource
        return {
          ...datasource,
          currentJob: runningJob ? {
            id: runningJob.id,
            type: runningJob.type,
            status: runningJob.status,
            processedRecords: runningJob.processedRecords,
            totalRecords: runningJob.totalRecords,
            startedAt: runningJob.startedAt,
          } : null,
        };
      }),
    );

    return datasourcesWithJobStatus as any;
  }

  async findOne(id: string): Promise<Datasource> {
    const datasource = await this.datasourceRepository.findOne({ where: { id } });
    if (!datasource) {
      throw new NotFoundException(`Datasource with ID ${id} not found`);
    }
    return datasource;
  }

  async update(id: string, updateDatasourceDto: UpdateDatasourceDto): Promise<Datasource> {
    const datasource = await this.findOne(id);

    // If enabling webhook and no secret exists, generate one
    if (updateDatasourceDto.webhookEnabled && !datasource.webhookSecret) {
      updateDatasourceDto['webhookSecret'] = this.generateWebhookSecret();
    }

    Object.assign(datasource, updateDatasourceDto);
    return await this.datasourceRepository.save(datasource);
  }

  async remove(id: string): Promise<void> {
    const datasource = await this.findOne(id);
    await this.datasourceRepository.remove(datasource);
  }

  async testConnection(id: string): Promise<{ success: boolean; message: string; version?: string }> {
    const datasource = await this.findOne(id);
    const connector = this.getConnector(datasource.type);
    return await connector.testConnection(datasource.connectionConfig);
  }

  async testConnectionWithConfig(
    type: string,
    connectionConfig: any,
  ): Promise<{ success: boolean; message: string; version?: string }> {
    const connector = this.getConnector(type as any);
    return await connector.testConnection(connectionConfig);
  }

  async previewData(id: string, limit: number = 5): Promise<{ columns: string[]; rows: any[]; total: number }> {
    const datasource = await this.findOne(id);
    const connector = this.getConnector(datasource.type);

    try {
      // Execute query with offset 0 and provided limit
      const result = await connector.executeQuery(
        datasource.connectionConfig,
        datasource.queryTemplate,
        { offset: 0, limit },
      );

      // Execute count query to get total records
      const countQuery = this.buildCountQuery(datasource.queryTemplate);
      const countResult = await connector.executeQuery(datasource.connectionConfig, countQuery);

      const total = countResult.rows[0]?.total || result.rows.length;

      return {
        columns: result.columns,
        rows: result.rows,
        total: parseInt(total, 10),
      };
    } catch (error) {
      this.logger.error(`Failed to preview data: ${error.message}`);
      throw new BadRequestException(`Failed to preview data: ${error.message}`);
    }
  }

  async validateQuery(
    id: string,
    query?: string,
  ): Promise<{ valid: boolean; error?: string; columns?: string[] }> {
    const datasource = await this.findOne(id);
    const connector = this.getConnector(datasource.type);
    const queryToValidate = query || datasource.queryTemplate;

    try {
      // Try to execute query with limit 1
      const result = await connector.executeQuery(
        datasource.connectionConfig,
        queryToValidate,
        { offset: 0, limit: 1 },
      );

      return {
        valid: true,
        columns: result.columns,
      };
    } catch (error) {
      this.logger.error(`Query validation failed: ${error.message}`);
      return {
        valid: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute a custom query on a datasource
   * Useful for enrichment queries
   */
  async executeCustomQuery(datasourceId: string, query: string): Promise<any> {
    const datasource = await this.findOne(datasourceId);
    const connector = this.getConnector(datasource.type);

    try {
      const result = await connector.executeQuery(
        datasource.connectionConfig,
        query,
      );
      return result.rows || [];
    } catch (error) {
      this.logger.error(`Custom query execution failed: ${error.message}`);
      throw new BadRequestException(`Query execution failed: ${error.message}`);
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
        throw new BadRequestException(`Unsupported datasource type: ${type}`);
    }
  }

  private generateWebhookSecret(): string {
    return `wh_secret_${crypto.randomBytes(16).toString('hex')}`;
  }

  private buildCountQuery(queryTemplate: string): string {
    // Remove ORDER BY, OFFSET, and FETCH NEXT clauses as they're not needed for counting
    let cleanedQuery = queryTemplate
      .replace(/ORDER BY[\s\S]*?(?=OFFSET|FETCH|$)/gi, '')
      .replace(/OFFSET[\s\S]*?ROWS/gi, '')
      .replace(/FETCH NEXT[\s\S]*?ROWS ONLY/gi, '')
      .trim();

    // Check if query has CTE (starts with WITH)
    if (/^\s*WITH\s+/i.test(cleanedQuery)) {
      // For CTEs in MSSQL, we cannot wrap the entire query in a subquery
      // because WITH must be the first statement. Instead, we need to find
      // where the CTE ends and wrap only the final SELECT.

      // Find the last closing parenthesis before the main SELECT
      // This regex finds the pattern: ) SELECT after all CTE definitions
      const mainSelectMatch = cleanedQuery.match(/\)\s+(SELECT[\s\S]+)$/i);

      if (mainSelectMatch) {
        // Extract CTE part (everything before the main SELECT)
        const ctePart = cleanedQuery.substring(0, mainSelectMatch.index + 1);
        // Extract main SELECT part
        const selectPart = mainSelectMatch[1];

        // Rebuild query: keep CTE, wrap only the SELECT in a count subquery
        return `${ctePart}\nSELECT COUNT(*) as total FROM (\n${selectPart}\n) AS count_subquery`;
      }
    }

    // For non-CTE queries, wrap in subquery (original approach)
    return `SELECT COUNT(*) as total FROM (${cleanedQuery}) AS count_subquery`;
  }

  async regenerateWebhookSecret(id: string): Promise<Datasource> {
    const datasource = await this.findOne(id);
    datasource.webhookSecret = this.generateWebhookSecret();
    return await this.datasourceRepository.save(datasource);
  }

  async updateLastSyncTime(id: string): Promise<void> {
    await this.datasourceRepository.update(id, {
      lastSyncedAt: new Date(),
    });
    this.logger.log(`Updated lastSyncedAt for datasource ${id}`);
  }

  async getStats(id: string): Promise<any> {
    const datasource = await this.findOne(id);
    const connector = this.getConnector(datasource.type);

    try {
      // 1. Get source count
      const countQuery = this.buildCountQuery(datasource.queryTemplate);
      const countResult = await connector.executeQuery(datasource.connectionConfig, countQuery);
      const sourceCount = parseInt(countResult.rows[0]?.total || 0, 10);

      // 2. Get Qdrant collection count
      let destinationCount = 0;
      try {
        const collectionInfo = await this.qdrantService.getCollectionInfo(datasource.qdrantCollection);
        destinationCount = (collectionInfo as any).points_count || 0;
      } catch (error) {
        this.logger.warn(`Could not get Qdrant collection info: ${error.message}`);
      }

      // 3. Get last sync job stats
      const lastSyncJob = await this.syncJobRepository.findOne({
        where: { datasourceId: id },
        order: { createdAt: 'DESC' },
      });

      return {
        source: {
          totalRecords: sourceCount,
          host: datasource.connectionConfig.host,
          port: datasource.connectionConfig.port,
          database: datasource.connectionConfig.database,
        },
        destination: {
          totalPoints: destinationCount,
          collection: datasource.qdrantCollection,
          host: datasource.qdrantHost || 'localhost',
          port: datasource.qdrantPort || 6333,
        },
        lastSync: lastSyncJob ? {
          jobId: lastSyncJob.id,
          status: lastSyncJob.status,
          totalRecords: lastSyncJob.totalRecords,
          processedRecords: lastSyncJob.processedRecords,
          successfulRecords: lastSyncJob.successfulRecords,
          failedRecords: lastSyncJob.failedRecords,
          startedAt: lastSyncJob.startedAt,
          completedAt: lastSyncJob.completedAt,
          duration: lastSyncJob.completedAt && lastSyncJob.startedAt
            ? lastSyncJob.completedAt.getTime() - lastSyncJob.startedAt.getTime()
            : null,
        } : null,
      };
    } catch (error) {
      this.logger.error(`Failed to get stats: ${error.message}`);
      throw new BadRequestException(`Failed to get stats: ${error.message}`);
    }
  }

  async validateQueryWithAI(id: string, customQuery?: string): Promise<any> {
    try {
      const datasource = await this.findOne(id);
      const queryToValidate = customQuery || datasource.queryTemplate;

      this.logger.log(`Validating query with AI for datasource ${id}`);

      const validation = await this.aiErrorService.validateAndCorrectSQL(
        queryToValidate,
        datasource.type as any,
      );

      return {
        datasourceId: id,
        queryValidation: validation,
        originalQuery: queryToValidate,
      };
    } catch (error) {
      this.logger.error(`AI validation failed: ${error.message}`);
      throw new BadRequestException(`AI validation failed: ${error.message}`);
    }
  }

  async analyzeError(
    id: string,
    errorMessage: string,
    errorType: 'sql' | 'connection' | 'sync' = 'sql',
  ): Promise<any> {
    try {
      const datasource = await this.findOne(id);

      this.logger.log(`Analyzing ${errorType} error with AI for datasource ${id}`);

      let suggestion;

      if (errorType === 'sql') {
        suggestion = await this.aiErrorService.analyzeSQLError(
          datasource.queryTemplate,
          errorMessage,
          datasource.type as any,
        );
      } else if (errorType === 'connection') {
        suggestion = await this.aiErrorService.analyzeConnectionError(
          errorMessage,
          datasource.connectionConfig,
          datasource.type,
        );
      } else {
        suggestion = await this.aiErrorService.analyzeSyncError(errorMessage, {
          datasourceName: datasource.name,
          phase: 'fetch',
        });
      }

      return {
        datasourceId: id,
        errorType,
        suggestion,
      };
    } catch (error) {
      this.logger.error(`AI error analysis failed: ${error.message}`);
      throw new BadRequestException(`AI error analysis failed: ${error.message}`);
    }
  }

  async previewDataWithAI(id: string, limit: number = 5): Promise<any> {
    const datasource = await this.findOne(id);
    const connector = this.getConnector(datasource.type);

    try {
      // Try normal preview first
      const result = await connector.executeQuery(
        datasource.connectionConfig,
        datasource.queryTemplate,
        { offset: 0, limit },
      );

      const countQuery = this.buildCountQuery(datasource.queryTemplate);
      const countResult = await connector.executeQuery(datasource.connectionConfig, countQuery);
      const total = countResult.rows[0]?.total || result.rows.length;

      return {
        success: true,
        columns: result.columns,
        rows: result.rows,
        total: parseInt(total, 10),
        aiCorrectionUsed: false,
      };
    } catch (error) {
      this.logger.warn(`Preview failed, attempting AI correction: ${error.message}`);

      try {
        // Analyze error with AI
        const suggestion = await this.aiErrorService.analyzeSQLError(
          datasource.queryTemplate,
          error.message,
          datasource.type as any,
        );

        if (!suggestion.correctedCode || suggestion.confidence === 'low') {
          throw new BadRequestException({
            message: 'Failed to preview data',
            originalError: error.message,
            aiSuggestion: suggestion,
            note: 'AI correction was unsuccessful or has low confidence',
          });
        }

        // Try with corrected query
        this.logger.log('Attempting preview with AI-corrected query');

        const correctedResult = await connector.executeQuery(
          datasource.connectionConfig,
          suggestion.correctedCode,
          { offset: 0, limit },
        );

        const correctedCountQuery = this.buildCountQuery(suggestion.correctedCode);
        const correctedCountResult = await connector.executeQuery(
          datasource.connectionConfig,
          correctedCountQuery,
        );
        const correctedTotal = correctedCountResult.rows[0]?.total || correctedResult.rows.length;

        return {
          success: true,
          columns: correctedResult.columns,
          rows: correctedResult.rows,
          total: parseInt(correctedTotal, 10),
          aiCorrectionUsed: true,
          originalError: error.message,
          aiSuggestion: suggestion,
          correctedQuery: suggestion.correctedCode,
        };
      } catch (aiError) {
        this.logger.error(`Preview with AI correction also failed: ${aiError.message}`);
        throw new BadRequestException({
          message: 'Failed to preview data even with AI correction',
          originalError: error.message,
          aiError: aiError.message,
        });
      }
    }
  }
}
