import { IsString, IsArray, IsOptional, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class TestProductDto {
  @IsString()
  id: string;

  @IsString()
  descripcion: string;

  @IsOptional()
  @IsString()
  marca?: string;

  @IsOptional()
  @IsNumber()
  score?: number;
}

export class TestPromptDto {
  @IsString()
  query: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestProductDto)
  products: TestProductDto[];
}

export class TestPromptResponseDto {
  success: boolean;
  duration_ms: number;
  input: {
    query: string;
    products_count: number;
  };
  output: {
    results: any[];
    raw_response?: string;
  };
  validation: {
    is_valid_json: boolean;
    has_required_fields: boolean;
    errors: string[];
  };
}
