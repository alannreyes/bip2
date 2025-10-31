import { Injectable, Logger } from '@nestjs/common';
import * as mssql from 'mssql';
import { IBaseConnector, ConnectionConfig, QueryResult } from './base-connector.interface';

@Injectable()
export class MssqlConnector implements IBaseConnector {
  private readonly logger = new Logger(MssqlConnector.name);
  private pool: mssql.ConnectionPool | null = null;

  async testConnection(config: ConnectionConfig): Promise<{ success: boolean; message: string; version?: string }> {
    try {
      const pool = new mssql.ConnectionPool({
        server: config.host,
        port: config.port || 1433,
        user: config.user,
        password: config.password,
        database: config.database,
        options: {
          encrypt: false,
          trustServerCertificate: true,
        },
        connectionTimeout: 10000,
        requestTimeout: 10000,
      });

      await pool.connect();

      // Get SQL Server version
      const result = await pool.request().query('SELECT @@VERSION AS version');
      const version = result.recordset[0]?.version || 'Unknown';

      await pool.close();

      return {
        success: true,
        message: 'Connection successful',
        version: version.split('\n')[0], // First line contains version info
      };
    } catch (error) {
      this.logger.error(`MSSQL connection test failed: ${error.message}`);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async executeQuery(config: ConnectionConfig, query: string, params?: Record<string, any>): Promise<QueryResult> {
    let pool: mssql.ConnectionPool | null = null;

    try {
      // Replace placeholders {{key}} with actual values
      let processedQuery = query;
      if (params) {
        Object.keys(params).forEach((key) => {
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
          processedQuery = processedQuery.replace(regex, params[key].toString());
        });
      }

      this.logger.debug(`Executing MSSQL query: ${processedQuery.substring(0, 200)}...`);

      pool = new mssql.ConnectionPool({
        server: config.host,
        port: config.port || 1433,
        user: config.user,
        password: config.password,
        database: config.database,
        options: {
          encrypt: false,
          trustServerCertificate: true,
        },
        connectionTimeout: 30000,
        requestTimeout: 60000,
      });

      await pool.connect();

      const result = await pool.request().query(processedQuery);

      const rows = result.recordset || [];
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

      return {
        rows,
        columns,
      };
    } catch (error) {
      this.logger.error(`MSSQL query execution failed: ${error.message}`);
      throw new Error(`MSSQL query failed: ${error.message}`);
    } finally {
      if (pool) {
        await pool.close();
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }
}
