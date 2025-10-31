import { IsString, IsObject, IsOptional } from 'class-validator';
import { UpdateDuplicateRulesDto } from './duplicate-rules.dto';

export class TestRulesDto {
  @IsString()
  productId1: string;

  @IsString()
  productId2: string;

  @IsString()
  collection: string;

  @IsOptional()
  @IsObject()
  rules?: UpdateDuplicateRulesDto;
}

export class TestRulesResponseDto {
  product1: {
    id: string;
    description: string;
    normalized: string;
    steps: Array<{
      step: string;
      result: string;
    }>;
  };
  product2: {
    id: string;
    description: string;
    normalized: string;
    steps: Array<{
      step: string;
      result: string;
    }>;
  };
  areVariants: boolean;
  reason: string;
}
