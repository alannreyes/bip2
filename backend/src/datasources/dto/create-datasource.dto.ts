import {
  IsString,
  IsEnum,
  IsObject,
  IsArray,
  IsOptional,
  IsBoolean,
  IsNumber,
  ValidateNested,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

class ConnectionConfigDto {
  @IsString()
  host: string;

  @IsNumber()
  port: number;

  @IsString()
  user: string;

  @IsString()
  password: string;

  @IsString()
  database: string;

  @IsOptional()
  @IsObject()
  options?: Record<string, any>;
}

// DTO específico para test de conexión
export class TestConnectionDto {
  @IsEnum(['mssql', 'mysql', 'postgresql', 'api'])
  type: 'mssql' | 'mysql' | 'postgresql' | 'api';

  @IsObject()
  @ValidateNested()
  @Type(() => ConnectionConfigDto)
  connectionConfig: ConnectionConfigDto;
}

export class CreateDatasourceDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  name: string;

  @IsEnum(['mssql', 'mysql', 'postgresql', 'api'])
  type: 'mssql' | 'mysql' | 'postgresql' | 'api';

  @IsObject()
  @ValidateNested()
  @Type(() => ConnectionConfigDto)
  connectionConfig: ConnectionConfigDto;

  @IsString()
  queryTemplate: string;

  @IsObject()
  fieldMapping: Record<string, string>;

  @IsString()
  idField: string;

  @IsArray()
  @IsString({ each: true })
  embeddingFields: string[];

  @IsString()
  qdrantCollection: string;

  @IsOptional()
  @IsString()
  qdrantHost?: string;

  @IsOptional()
  @IsNumber()
  qdrantPort?: number;

  @IsOptional()
  @IsNumber()
  batchSize?: number;

  @IsOptional()
  @IsNumber()
  batchDelay?: number;

  @IsOptional()
  @IsString()
  syncSchedule?: string;

  @IsOptional()
  @IsBoolean()
  webhookEnabled?: boolean;

  @IsOptional()
  @IsString()
  description?: string;
}
