import { IsBoolean, IsString, IsArray, IsObject, IsOptional, IsNumber } from 'class-validator';

export class ColorWordsDto {
  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  words: string[];
}

export class VariantTypeWordsDto {
  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  words: string[];
}

export class PatternConfigDto {
  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  regex?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  patterns?: string[];
}

export class PatternsDto {
  @IsOptional()
  @IsObject()
  removeConSin?: PatternConfigDto;

  @IsOptional()
  @IsObject()
  removeMaterialGrades?: PatternConfigDto;

  @IsOptional()
  @IsObject()
  removeThreadTypes?: PatternConfigDto;

  @IsOptional()
  @IsObject()
  removeProductTypes?: PatternConfigDto;

  @IsOptional()
  @IsObject()
  removeModelVariations?: PatternConfigDto;

  @IsOptional()
  @IsObject()
  removeShoeWidths?: PatternConfigDto;

  @IsOptional()
  @IsObject()
  removeQuantityUnits?: PatternConfigDto;

  @IsOptional()
  @IsObject()
  removeSerialNumbers?: PatternConfigDto;

  @IsOptional()
  @IsObject()
  removeAccessories?: PatternConfigDto;

  @IsOptional()
  @IsObject()
  removeUsageLabels?: PatternConfigDto;

  @IsOptional()
  @IsObject()
  removeSizesTalla?: PatternConfigDto;

  @IsOptional()
  @IsObject()
  removePackagingQuantities?: PatternConfigDto;
}

export class CustomPatternDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsString()
  regex: string;

  @IsString()
  replacement: string;

  @IsBoolean()
  enabled: boolean;
}

export class StrategyDto {
  @IsBoolean()
  useManufacturerCode: boolean;

  @IsBoolean()
  useDescriptionNormalization: boolean;

  @IsNumber()
  minNormalizedLength: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateDuplicateRulesDto {
  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  colorWords?: ColorWordsDto;

  @IsOptional()
  @IsObject()
  variantTypeWords?: VariantTypeWordsDto;

  @IsOptional()
  @IsObject()
  patterns?: PatternsDto;

  @IsOptional()
  @IsArray()
  customPatterns?: CustomPatternDto[];

  @IsOptional()
  @IsObject()
  strategy?: StrategyDto;
}

export class DuplicateRulesResponseDto {
  version: string;
  collectionName: string;
  description?: string;
  updatedAt: string;
  colorWords: ColorWordsDto;
  variantTypeWords: VariantTypeWordsDto;
  patterns: PatternsDto;
  customPatterns: CustomPatternDto[];
  strategy: StrategyDto;
}
