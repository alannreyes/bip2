import {
  Controller,
  Get,
  Put,
  Delete,
  Post,
  Param,
  Body,
  Query,
  Logger,
} from '@nestjs/common';
import { DuplicateRulesService } from './duplicate-rules.service';
import { DuplicatesService } from './duplicates.service';
import { QdrantService } from '../qdrant/qdrant.service';
import {
  UpdateDuplicateRulesDto,
  DuplicateRulesResponseDto,
} from './dto/duplicate-rules.dto';
import { TestRulesDto, TestRulesResponseDto } from './dto/test-rules.dto';

@Controller('duplicates/rules')
export class DuplicateRulesController {
  private readonly logger = new Logger(DuplicateRulesController.name);

  constructor(
    private readonly rulesService: DuplicateRulesService,
    private readonly duplicatesService: DuplicatesService,
    private readonly qdrantService: QdrantService,
  ) {}

  /**
   * Get rules for a collection
   */
  @Get(':collection')
  async getRules(@Param('collection') collection: string): Promise<DuplicateRulesResponseDto> {
    this.logger.log(`GET /duplicates/rules/${collection}`);
    return await this.rulesService.getRules(collection);
  }

  /**
   * Update rules for a collection
   */
  @Put(':collection')
  async updateRules(
    @Param('collection') collection: string,
    @Body() dto: UpdateDuplicateRulesDto,
  ): Promise<DuplicateRulesResponseDto> {
    this.logger.log(`PUT /duplicates/rules/${collection}`);
    return await this.rulesService.updateRules(collection, dto);
  }

  /**
   * Delete rules for a collection (revert to defaults)
   */
  @Delete(':collection')
  async deleteRules(@Param('collection') collection: string): Promise<{ message: string }> {
    this.logger.log(`DELETE /duplicates/rules/${collection}`);
    await this.rulesService.deleteRules(collection);
    return { message: `Rules for collection '${collection}' deleted successfully. Reverted to defaults.` };
  }

  /**
   * Export rules as JSON
   */
  @Get(':collection/export')
  async exportRules(@Param('collection') collection: string): Promise<any> {
    this.logger.log(`GET /duplicates/rules/${collection}/export`);
    return await this.rulesService.exportRules(collection);
  }

  /**
   * Import rules from JSON
   */
  @Post(':collection/import')
  async importRules(
    @Param('collection') collection: string,
    @Body() rulesJson: any,
  ): Promise<DuplicateRulesResponseDto> {
    this.logger.log(`POST /duplicates/rules/${collection}/import`);
    return await this.rulesService.importRules(collection, rulesJson);
  }

  /**
   * Test rules with two products
   */
  @Post('test')
  async testRules(@Body() dto: TestRulesDto): Promise<TestRulesResponseDto> {
    this.logger.log(`POST /duplicates/rules/test - Testing products ${dto.productId1} and ${dto.productId2}`);

    const client = this.qdrantService.getClient();

    // Search for products by their payload ID (codigo)
    const searchProduct1 = await client.scroll(dto.collection, {
      filter: {
        must: [{ key: 'id', match: { value: dto.productId1 } }],
      },
      limit: 1,
      with_payload: true,
      with_vector: false,
    });

    const searchProduct2 = await client.scroll(dto.collection, {
      filter: {
        must: [{ key: 'id', match: { value: dto.productId2 } }],
      },
      limit: 1,
      with_payload: true,
      with_vector: false,
    });

    if (searchProduct1.points.length === 0 || searchProduct2.points.length === 0) {
      throw new Error('One or both products not found');
    }

    const product1 = searchProduct1.points[0];
    const product2 = searchProduct2.points[0];

    if (!product1 || !product2) {
      throw new Error('One or both products not found');
    }

    // Get rules (custom or from collection)
    const rules = dto.rules
      ? await this.rulesService.updateRules('__test__', dto.rules)
      : await this.rulesService.getRules(dto.collection);

    // Test normalization
    const desc1 = String(product1.payload?.descripcion || product1.payload?.description || '');
    const desc2 = String(product2.payload?.descripcion || product2.payload?.description || '');

    const normalized1 = this.normalizeWithSteps(desc1, rules);
    const normalized2 = this.normalizeWithSteps(desc2, rules);

    // Check if they are variants
    const areVariants = normalized1.final === normalized2.final && normalized1.final.length > 10;

    let reason = '';
    if (areVariants) {
      reason = 'Las descripciones son idénticas después de normalizar, por lo tanto son variantes (NO duplicados).';
    } else {
      reason = 'Las descripciones son diferentes después de normalizar, por lo tanto NO son variantes y podrían ser duplicados.';
    }

    // Clean up test rules if used
    if (dto.rules) {
      await this.rulesService.deleteRules('__test__');
    }

    return {
      product1: {
        id: dto.productId1,
        description: desc1,
        normalized: normalized1.final,
        steps: normalized1.steps,
      },
      product2: {
        id: dto.productId2,
        description: desc2,
        normalized: normalized2.final,
        steps: normalized2.steps,
      },
      areVariants,
      reason,
    };
  }

  /**
   * Normalize description with step-by-step tracking
   */
  private normalizeWithSteps(text: string, rules: DuplicateRulesResponseDto): { final: string; steps: Array<{ step: string; result: string }> } {
    const steps: Array<{ step: string; result: string }> = [];
    let normalized = String(text).toLowerCase();

    steps.push({ step: '0. Original (lowercase)', result: normalized });

    // Apply color words removal
    if (rules.colorWords?.enabled && rules.colorWords.words && rules.colorWords.words.length > 0) {
      const before = normalized;
      rules.colorWords.words.forEach((color) => {
        const regex = new RegExp(`\\b${color}\\b`, 'gi');
        normalized = normalized.replace(regex, ' ');
      });
      if (before !== normalized) {
        steps.push({ step: '1. Remove colors', result: normalized });
      }
    }

    // Apply variant type words removal
    if (rules.variantTypeWords?.enabled && rules.variantTypeWords.words && rules.variantTypeWords.words.length > 0) {
      const before = normalized;
      rules.variantTypeWords.words.forEach((word) => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        normalized = normalized.replace(regex, ' ');
      });
      if (before !== normalized) {
        steps.push({ step: '2. Remove variant types', result: normalized });
      }
    }

    // Apply pattern rules (simplified for brevity)
    const patterns = rules.patterns || {};
    let stepNum = 3;

    if (patterns.removeConSin?.enabled) {
      const before = normalized;
      normalized = normalized.replace(/\b[cs]\//gi, ' ');
      if (before !== normalized) {
        steps.push({ step: `${stepNum++}. Remove con/sin`, result: normalized });
      }
    }

    if (patterns.removeSizesTalla?.enabled) {
      const before = normalized;
      normalized = normalized.replace(/talla\s*["']?\s*([smlx]{1,4})["']?/gi, 'talla ');
      if (before !== normalized) {
        steps.push({ step: `${stepNum++}. Remove sizes/talla`, result: normalized });
      }
    }

    // Final cleanup
    normalized = normalized
      .replace(/\s+/g, ' ')
      .replace(/[""'']/g, '"')
      .trim();

    steps.push({ step: `${stepNum}. Final cleanup`, result: normalized });

    return { final: normalized, steps };
  }
}
