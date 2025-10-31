export interface ConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface QueryResult {
  rows: any[];
  columns: string[];
  totalCount?: number;
}

export interface IBaseConnector {
  testConnection(config: ConnectionConfig): Promise<{ success: boolean; message: string; version?: string }>;
  executeQuery(config: ConnectionConfig, query: string, params?: Record<string, any>): Promise<QueryResult>;
  disconnect(): Promise<void>;
}
