import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Datasource } from '../../datasources/entities/datasource.entity';
import { SyncError } from './sync-error.entity';

export type SyncJobType = 'full' | 'incremental' | 'webhook';
export type SyncJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

@Entity('sync_jobs')
export class SyncJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  datasourceId: string;

  @Column({ type: 'varchar', length: 50 })
  type: SyncJobType;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: SyncJobStatus;

  @Column({ type: 'int', nullable: true })
  totalRecords: number | null;

  @Column({ type: 'int', default: 0 })
  processedRecords: number;

  @Column({ type: 'int', default: 0 })
  successfulRecords: number;

  @Column({ type: 'int', default: 0 })
  failedRecords: number;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => Datasource, (datasource) => datasource.syncJobs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'datasourceId' })
  datasource: Datasource;

  @OneToMany(() => SyncError, (syncError) => syncError.syncJob)
  errors: SyncError[];
}
