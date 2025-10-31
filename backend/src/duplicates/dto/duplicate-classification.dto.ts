import { IsOptional, IsBoolean, IsObject } from 'class-validator';

export class DetectDuplicatesDto {
  collection: string;

  @IsOptional()
  similarityThreshold?: number;

  @IsOptional()
  limit?: number;

  @IsOptional()
  @IsBoolean()
  useAiClassification?: boolean; // Nueva opción para activar clasificación con IA

  @IsOptional()
  @IsObject()
  filters?: Record<string, string | string[]>; // Filtros opcionales por campos del payload
}

export class DuplicateClassificationDto {
  category: 'real_duplicate' | 'size_variant' | 'color_variant' | 'model_variant' | 'description_variant' | 'review_needed';
  confidence: number;
  reason: string;
  differences: string[];
  recommendation: 'merge' | 'keep_both' | 'review';
}

export class DuplicateGroupDto {
  products: any[];
  avgSimilarity: number;
  recommended: any;
  duplicateIds: string[];

  // Nueva información de clasificación AI
  aiClassification?: DuplicateClassificationDto;
}

export class DuplicateReportDto {
  totalGroups: number;
  totalDuplicates: number;
  estimatedSavings: number;
  groups: DuplicateGroupDto[];

  // Estadísticas por categoría
  categorySummary?: {
    real_duplicates: number;
    size_variants: number;
    color_variants: number;
    model_variants: number;
    description_variants: number;
    review_needed: number;
  };
}

export class ValidateProductExistsDto {
  collection: string;
  descripcion: string;
  marca?: string;
  modelo?: string;
  similarityThreshold?: number; // Default 0.90
}

export class ExistingProductDto {
  id: string;
  descripcion: string;
  marca?: string;
  modelo?: string;
  similarity: number;
  payload: any;
}

export class ValidateProductExistsResponseDto {
  exists: boolean;
  reason: string;
  confidence: number;
  matchedProducts: ExistingProductDto[];
  isExactMatch: boolean; // True si es el mismo producto
  isVariant: boolean; // True si es una variante (talla/color diferente)
  recommendation: 'reject' | 'accept' | 'review'; // reject = ya existe, accept = es nuevo, review = revisar manualmente
}
