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
}
