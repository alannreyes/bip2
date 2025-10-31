import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('duplicate_rules')
@Index(['collectionName'], { unique: true })
export class DuplicateRules {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  collectionName: string;

  @Column({ type: 'varchar', length: 50, default: '1.0.0' })
  version: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  // Color words
  @Column({ type: 'boolean', default: true })
  colorWordsEnabled: boolean;

  @Column({ type: 'json' })
  colorWords: string[];

  // Variant type words
  @Column({ type: 'boolean', default: true })
  variantTypeWordsEnabled: boolean;

  @Column({ type: 'json' })
  variantTypeWords: string[];

  // Patterns
  @Column({ type: 'json' })
  patterns: {
    removeConSin?: { enabled: boolean; description?: string; regex?: string };
    removeMaterialGrades?: { enabled: boolean; description?: string; regex?: string };
    removeThreadTypes?: { enabled: boolean; description?: string; patterns?: string[] };
    removeProductTypes?: { enabled: boolean; description?: string; patterns?: string[] };
    removeModelVariations?: { enabled: boolean; description?: string; patterns?: string[] };
    removeShoeWidths?: { enabled: boolean; description?: string; regex?: string };
    removeQuantityUnits?: { enabled: boolean; description?: string; regex?: string };
    removeSerialNumbers?: { enabled: boolean; description?: string; regex?: string };
    removeAccessories?: { enabled: boolean; description?: string; patterns?: string[] };
    removeUsageLabels?: { enabled: boolean; description?: string; regex?: string };
    removeSizesTalla?: { enabled: boolean; description?: string; regex?: string };
    removePackagingQuantities?: { enabled: boolean; description?: string; regex?: string };
  };

  // Custom patterns
  @Column({ type: 'json', default: [] })
  customPatterns: Array<{
    name: string;
    description: string;
    regex: string;
    replacement: string;
    enabled: boolean;
  }>;

  // Strategy
  @Column({ type: 'json' })
  strategy: {
    useManufacturerCode: boolean;
    useDescriptionNormalization: boolean;
    minNormalizedLength: number;
    description?: string;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
