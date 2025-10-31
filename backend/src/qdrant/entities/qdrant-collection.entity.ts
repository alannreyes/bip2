import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Datasource } from '../../datasources/entities/datasource.entity';

@Entity('qdrant_collections')
export class QdrantCollection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  name: string;

  @Column({ type: 'int' })
  vectorSize: number;

  @Column({ type: 'varchar', length: 50 })
  distance: string;

  @Column({ type: 'bigint', default: 0 })
  totalPoints: number;

  @Column({ type: 'uuid', nullable: true })
  datasourceId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  lastSyncedAt: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Datasource, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'datasourceId' })
  datasource: Datasource | null;
}
