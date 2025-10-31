import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { SyncJob } from '../../sync/entities/sync-job.entity';

export type DatasourceType = 'mssql' | 'mysql' | 'postgresql' | 'api';
export type DatasourceStatus = 'active' | 'paused' | 'error';

@Entity('datasources')
export class Datasource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  name: string;

  @Column({ type: 'varchar', length: 50 })
  type: DatasourceType;

  @Column({ type: 'jsonb' })
  connectionConfig: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };

  @Column({ type: 'text' })
  queryTemplate: string;

  @Column({ type: 'jsonb' })
  fieldMapping: Record<string, string>;

  @Column({ type: 'varchar', length: 255 })
  idField: string;

  @Column({ type: 'text', array: true })
  embeddingFields: string[];

  @Column({ type: 'varchar', length: 255 })
  qdrantCollection: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  qdrantHost: string | null;

  @Column({ type: 'int', nullable: true })
  qdrantPort: number | null;

  @Column({ type: 'int', nullable: true, default: 100 })
  batchSize: number | null;

  @Column({ type: 'int', nullable: true, default: 1000 })
  batchDelay: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  syncSchedule: string | null;

  @Column({ type: 'boolean', default: false })
  webhookEnabled: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  webhookSecret: string | null;

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status: DatasourceStatus;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'timestamp', nullable: true })
  lastSyncedAt: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  // Relations
  @OneToMany(() => SyncJob, (syncJob) => syncJob.datasource)
  syncJobs: SyncJob[];
}
