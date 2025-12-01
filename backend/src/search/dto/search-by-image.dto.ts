import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class SearchByImageDto {
  @IsString()
  collection: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(100)
  limit?: number = 3; // Default 3 for precision-focused results

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
  scoreThreshold?: number = 0.5;
}
