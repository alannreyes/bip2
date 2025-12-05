import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * API Key para autenticación de aplicaciones externas
 * Las API Keys no expiran (o tienen expiración muy larga)
 * Cada aplicación tiene su propia key que puede ser revocada independientemente
 */
@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string; // Nombre de la aplicación: "App Ventas", "Sistema ERP", etc.

  @Column({ length: 500, nullable: true })
  description: string;

  @Index({ unique: true })
  @Column({ length: 64 })
  keyHash: string; // Hash SHA-256 de la API Key (nunca guardamos la key en texto plano)

  @Column({ length: 8 })
  keyPrefix: string; // Primeros 8 caracteres para identificación: "bip2_abc1..."

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'simple-array', nullable: true })
  allowedIps: string[]; // IPs permitidas (null = todas)

  @Column({ type: 'simple-array', nullable: true })
  allowedEndpoints: string[]; // Endpoints permitidos (null = todos)

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null; // null = nunca expira

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date | null;

  @Column({ default: 0 })
  usageCount: number;

  @Column({ length: 100, nullable: true })
  createdBy: string; // Usuario admin que creó la key

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
