import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { IBaseConnector, ConnectionConfig, QueryResult } from './base-connector.interface';

@Injectable()
export class PostgresqlConnector implements IBaseConnector {
  private readonly logger = new Logger(PostgresqlConnector.name);
  private pool: Pool | null = null;

  async testConnection(config: ConnectionConfig): Promise<{ success: boolean; message: string; version?: string }> {
    let client;
    try {
      const pool = new Pool({
        host: config.host,
        port: config.port || 5432,
        user: config.user,
        password: config.password,
        database: config.database,
        connectionTimeoutMillis: 10000,
      });

      client = await pool.connect();
      const result = await client.query('SELECT version()');
      const version = result.rows[0]?.version || 'Unknown';

      await pool.end();

      return {
        success: true,
        message: 'Connection successful',
        version: version.split(',')[0], // First part contains version
      };
    } catch (error) {
      this.logger.error(`PostgreSQL connection test failed: ${error.message}`);
      return {
        success: false,
        message: error.message,
      };
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  async executeQuery(config: ConnectionConfig, query: string, params?: Record<string, any>): Promise<QueryResult> {
    let pool: Pool | null = null;
    let client;

    try {
      // Replace placeholders {{key}} with actual values
      let processedQuery = query;
      if (params) {
        Object.keys(params).forEach((key) => {
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
          processedQuery = processedQuery.replace(regex, params[key].toString());
        });
      }

      this.logger.debug(`Executing PostgreSQL query: ${processedQuery.substring(0, 200)}...`);

      pool = new Pool({
        host: config.host,
        port: config.port || 5432,
        user: config.user,
        password: config.password,
        database: config.database,
        connectionTimeoutMillis: 30000,
        query_timeout: 60000,
      });

      client = await pool.connect();
      const result = await client.query(processedQuery);

      const rows = result.rows || [];
      const columns = result.fields ? result.fields.map((field) => field.name) : [];

      return {
        rows,
        columns,
      };
    } catch (error) {
      this.logger.error(`PostgreSQL query execution failed: ${error.message}`);
      throw new Error(`PostgreSQL query failed: ${error.message}`);
    } finally {
      if (client) {
        client.release();
      }
      if (pool) {
        await pool.end();
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
