import { IsString, IsOptional, IsInt, Min, Max, IsArray, ArrayMinSize, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchByTextDto {
  @IsString()
  query: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one collection must be selected' })
  @IsString({ each: true })
  collections: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number; // Default handled by controller (3 for precision)

  @IsOptional()
  @IsString()
  marca?: string;

  @IsOptional()
  @IsString()
  cliente?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeInternetSearch?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  useLLMFilter?: boolean = false; // Default: false - trust embeddings

  @IsOptional()
  @Type(() => Number)
  minRelevancia?: number = 0.50; // Default: 0.50 (MISMA_CATEGORIA or better)
  // Score RTI (Relevancia Técnica Industrial):
  // 1.00: EXACTO - Mismo producto exacto
  // 0.95: EQUIVALENTE - Nomenclatura diferente (6"=152mm)
  // 0.85: SUSTITUTO_PERFECTO - Marca diferente, mismas specs
  // 0.70: SUSTITUTO_VALIDO - Specs compatibles
  // 0.50: MISMA_CATEGORIA - Mismo tipo, specs diferentes
  // 0.30: RELACIONADO - Complementario o accesorio
  // 0.10: IRRELEVANTE - Sin relación funcional

  @IsOptional()
  payloadFilters?: {
    // Examples:
    // { "ventas_3_anios": { "gte": 1 } } - Products with 1+ sales in last 3 years
    // { "en_stock": true } - Only in-stock products
    // { "ventas_3_anios": { "range": { "gte": 50 } } } - Very popular products (50+ sales)
    [key: string]: any;
  };
}
