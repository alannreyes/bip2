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
  limit?: number = 10;

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
  payloadFilters?: {
    // Examples:
    // { "ventas_3_anios": { "gte": 1 } } - Products with 1+ sales in last 3 years
    // { "en_stock": true } - Only in-stock products
    // { "ventas_3_anios": { "range": { "gte": 50 } } } - Very popular products (50+ sales)
    [key: string]: any;
  };
}
