import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

export type PromptStatus = 'draft' | 'active' | 'archived';

@Entity('prompt_configs')
@Index(['name', 'status'])
export class PromptConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  @Index()
  name: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  @Index()
  status: PromptStatus;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ name: 'created_by', type: 'varchar', length: 100, nullable: true })
  createdBy: string;

  @Column({ name: 'change_description', type: 'text', nullable: true })
  changeDescription: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'rollback_to', type: 'uuid', nullable: true })
  rollbackTo: string;

  @ManyToOne(() => PromptConfig, { nullable: true })
  @JoinColumn({ name: 'rollback_to' })
  rollbackToPrompt: PromptConfig;

  @Column({ name: 'last_tested_at', type: 'timestamp', nullable: true })
  lastTestedAt: Date;

  @Column({ name: 'last_test_success', type: 'boolean', nullable: true })
  lastTestSuccess: boolean;

  @Column({ name: 'test_results', type: 'jsonb', nullable: true })
  testResults: any;
}
