import { Injectable, Logger } from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { IBaseConnector, ConnectionConfig, QueryResult } from './base-connector.interface';

@Injectable()
export class MysqlConnector implements IBaseConnector {
  private readonly logger = new Logger(MysqlConnector.name);
  private connection: mysql.Connection | null = null;

  async testConnection(config: ConnectionConfig): Promise<{ success: boolean; message: string; version?: string }> {
    try {
      const connection = await mysql.createConnection({
        host: config.host,
        port: config.port || 3306,
        user: config.user,
        password: config.password,
        database: config.database,
        connectTimeout: 10000,
      });

      const [rows] = await connection.execute('SELECT VERSION() AS version');
      const version = (rows as any)[0]?.version || 'Unknown';

      await connection.end();

      return {
        success: true,
        message: 'Connection successful',
        version,
      };
    } catch (error) {
      this.logger.error(`MySQL connection test failed: ${error.message}`);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async executeQuery(config: ConnectionConfig, query: string, params?: Record<string, any>): Promise<QueryResult> {
    let connection: mysql.Connection | null = null;

    try {
      // Replace placeholders {{key}} with actual values
      let processedQuery = query;
      if (params) {
        Object.keys(params).forEach((key) => {
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
          processedQuery = processedQuery.replace(regex, params[key].toString());
        });
      }

      this.logger.debug(`Executing MySQL query: ${processedQuery.substring(0, 200)}...`);

      connection = await mysql.createConnection({
        host: config.host,
        port: config.port || 3306,
        user: config.user,
        password: config.password,
        database: config.database,
        connectTimeout: 30000,
      });

      const [rows, fields] = await connection.execute(processedQuery);

      const columns = fields ? fields.map((field) => field.name) : [];

      return {
        rows: rows as any[],
        columns,
      };
    } catch (error) {
      this.logger.error(`MySQL query execution failed: ${error.message}`);
      throw new Error(`MySQL query failed: ${error.message}`);
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }
  }
}
