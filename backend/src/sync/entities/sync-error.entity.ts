import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SyncJob } from './sync-job.entity';

@Entity('sync_errors')
export class SyncError {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  syncJobId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  recordIdentifier: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  errorType: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'jsonb', nullable: true })
  recordData: Record<string, any> | null;

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @Column({ type: 'boolean', default: false })
  resolved: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => SyncJob, (syncJob) => syncJob.errors, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'syncJobId' })
  syncJob: SyncJob;
}
