import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { DuplicatesService } from './duplicates.service';

@Controller('duplicates')
export class DuplicatesController {
  constructor(private readonly duplicatesService: DuplicatesService) {}

  @Post('detect')
  async detectDuplicates(
    @Body('collection') collection: string,
    @Body('similarityThreshold') similarityThreshold?: number,
    @Body('limit') limit?: number,
    @Body('useAiClassification') useAiClassification?: boolean,
    @Body('filters') filters?: Record<string, string | string[]>,
  ) {
    if (!collection) {
      throw new Error('Collection name is required');
    }

    const threshold = similarityThreshold || 0.95; // 95% similarity by default
    const maxGroups = limit || 50;
    const useAi = useAiClassification === true; // Default false

    return await this.duplicatesService.detectDuplicates(
      collection,
      threshold,
      maxGroups,
      undefined, // customRules
      useAi,
      filters,
    );
  }

  @Post('analyze-product')
  async analyzeProductDuplicates(
    @Body('collection') collection: string,
    @Body('productId') productId: string,
    @Body('similarityThreshold') similarityThreshold?: number,
  ) {
    if (!collection || !productId) {
      throw new Error('Collection and productId are required');
    }

    const threshold = similarityThreshold || 0.90;

    return await this.duplicatesService.findSimilarProducts(
      collection,
      productId,
      threshold,
    );
  }

  @Get('report')
  async getDuplicateReport(@Query('collection') collection: string) {
    if (!collection) {
      throw new Error('Collection name is required');
    }

    return await this.duplicatesService.generateDuplicateReport(collection);
  }

  @Get('filter-values')
  async getFilterValues(@Query('collection') collection: string) {
    if (!collection) {
      throw new Error('Collection name is required');
    }

    // Get unique values for common filter fields
    const fields = ['linea', 'familia', 'sub_familia', 'categoria'];
    return await this.duplicatesService.getFilterValues(collection, fields);
  }

  @Post('validate-exists')
  async validateProductExists(
    @Body('collection') collection: string,
    @Body('descripcion') descripcion: string,
    @Body('marca') marca?: string,
    @Body('modelo') modelo?: string,
    @Body('similarityThreshold') similarityThreshold?: number,
  ) {
    if (!collection || !descripcion) {
      throw new Error('Collection and descripcion are required');
    }

    const threshold = similarityThreshold || 0.90;

    return await this.duplicatesService.validateProductExists(
      collection,
      descripcion,
      marca,
      modelo,
      threshold,
    );
  }
}
