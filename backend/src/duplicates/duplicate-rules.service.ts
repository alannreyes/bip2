import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DuplicateRules } from './entities/duplicate-rules.entity';
import { UpdateDuplicateRulesDto, DuplicateRulesResponseDto } from './dto/duplicate-rules.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DuplicateRulesService {
  private readonly logger = new Logger(DuplicateRulesService.name);
  private rulesCache: Map<string, DuplicateRulesResponseDto> = new Map();
  private defaultRules: any;

  constructor(
    @InjectRepository(DuplicateRules)
    private rulesRepository: Repository<DuplicateRules>,
  ) {
    this.loadDefaultRules();
  }

  /**
   * Load default rules from JSON file
   */
  private loadDefaultRules() {
    try {
      const configPath = path.join(process.cwd(), 'config', 'duplicate-detection-rules.json');
      const content = fs.readFileSync(configPath, 'utf-8');
      this.defaultRules = JSON.parse(content);
      this.logger.log('Default rules loaded from config file');
    } catch (error) {
      this.logger.error(`Failed to load default rules: ${error.message}`);
      // Fallback to hardcoded defaults
      this.defaultRules = this.getHardcodedDefaults();
    }
  }

  /**
   * Get hardcoded defaults as fallback
   */
  private getHardcodedDefaults(): any {
    return {
      version: '1.0.0',
      collectionName: 'global',
      description: 'Reglas por defecto para detección de duplicados',
      colorWords: {
        enabled: true,
        words: ['negro', 'blanco', 'rojo', 'azul', 'amarillo', 'verde'],
      },
      variantTypeWords: {
        enabled: true,
        words: ['macho', 'hembra', 'fijo', 'giratorio'],
      },
      patterns: {},
      customPatterns: [],
      strategy: {
        useManufacturerCode: true,
        useDescriptionNormalization: true,
        minNormalizedLength: 10,
      },
    };
  }

  /**
   * Get rules for a collection (from DB or defaults)
   */
  async getRules(collectionName: string): Promise<DuplicateRulesResponseDto> {
    // Check cache first
    if (this.rulesCache.has(collectionName)) {
      return this.rulesCache.get(collectionName);
    }

    // Try to get from database
    const dbRules = await this.rulesRepository.findOne({
      where: { collectionName },
    });

    if (dbRules) {
      const response = this.entityToDto(dbRules);
      this.rulesCache.set(collectionName, response);
      return response;
    }

    // Return defaults
    const defaultResponse: DuplicateRulesResponseDto = {
      version: this.defaultRules.version,
      collectionName: collectionName,
      description: this.defaultRules.description,
      updatedAt: new Date().toISOString(),
      colorWords: this.defaultRules.colorWords,
      variantTypeWords: this.defaultRules.variantTypeWords,
      patterns: this.defaultRules.patterns,
      customPatterns: this.defaultRules.customPatterns || [],
      strategy: this.defaultRules.strategy,
    };

    this.rulesCache.set(collectionName, defaultResponse);
    return defaultResponse;
  }

  /**
   * Update rules for a collection
   */
  async updateRules(
    collectionName: string,
    dto: UpdateDuplicateRulesDto,
  ): Promise<DuplicateRulesResponseDto> {
    this.logger.log(`Updating rules for collection: ${collectionName}`);

    // Get existing or create new
    let rules = await this.rulesRepository.findOne({
      where: { collectionName },
    });

    if (!rules) {
      rules = this.rulesRepository.create({
        collectionName,
        version: dto.version || '1.0.0',
        description: dto.description,
        colorWordsEnabled: dto.colorWords?.enabled ?? true,
        colorWords: dto.colorWords?.words || this.defaultRules.colorWords.words,
        variantTypeWordsEnabled: dto.variantTypeWords?.enabled ?? true,
        variantTypeWords: dto.variantTypeWords?.words || this.defaultRules.variantTypeWords.words,
        patterns: dto.patterns || this.defaultRules.patterns,
        customPatterns: dto.customPatterns || [],
        strategy: dto.strategy || this.defaultRules.strategy,
      });
    } else {
      // Update existing
      if (dto.version) rules.version = dto.version;
      if (dto.description !== undefined) rules.description = dto.description;
      if (dto.colorWords) {
        rules.colorWordsEnabled = dto.colorWords.enabled;
        rules.colorWords = dto.colorWords.words;
      }
      if (dto.variantTypeWords) {
        rules.variantTypeWordsEnabled = dto.variantTypeWords.enabled;
        rules.variantTypeWords = dto.variantTypeWords.words;
      }
      if (dto.patterns) rules.patterns = { ...rules.patterns, ...dto.patterns };
      if (dto.customPatterns) rules.customPatterns = dto.customPatterns;
      if (dto.strategy) rules.strategy = { ...rules.strategy, ...dto.strategy };
    }

    rules = await this.rulesRepository.save(rules);

    // Clear cache
    this.rulesCache.delete(collectionName);

    const response = this.entityToDto(rules);
    this.rulesCache.set(collectionName, response);

    return response;
  }

  /**
   * Delete rules for a collection (revert to defaults)
   */
  async deleteRules(collectionName: string): Promise<void> {
    this.logger.log(`Deleting rules for collection: ${collectionName}`);

    const rules = await this.rulesRepository.findOne({
      where: { collectionName },
    });

    if (rules) {
      await this.rulesRepository.remove(rules);
    }

    // Clear cache
    this.rulesCache.delete(collectionName);
  }

  /**
   * Export rules as JSON
   */
  async exportRules(collectionName: string): Promise<any> {
    const rules = await this.getRules(collectionName);
    return rules;
  }

  /**
   * Import rules from JSON
   */
  async importRules(collectionName: string, rulesJson: any): Promise<DuplicateRulesResponseDto> {
    this.logger.log(`Importing rules for collection: ${collectionName}`);

    const dto: UpdateDuplicateRulesDto = {
      version: rulesJson.version,
      description: rulesJson.description,
      colorWords: rulesJson.colorWords,
      variantTypeWords: rulesJson.variantTypeWords,
      patterns: rulesJson.patterns,
      customPatterns: rulesJson.customPatterns,
      strategy: rulesJson.strategy,
    };

    return await this.updateRules(collectionName, dto);
  }

  /**
   * Convert entity to DTO
   */
  private entityToDto(entity: DuplicateRules): DuplicateRulesResponseDto {
    return {
      version: entity.version,
      collectionName: entity.collectionName,
      description: entity.description,
      updatedAt: entity.updatedAt.toISOString(),
      colorWords: {
        enabled: entity.colorWordsEnabled,
        words: entity.colorWords,
      },
      variantTypeWords: {
        enabled: entity.variantTypeWordsEnabled,
        words: entity.variantTypeWords,
      },
      patterns: entity.patterns,
      customPatterns: entity.customPatterns,
      strategy: entity.strategy,
    };
  }

  /**
   * Clear cache (useful for testing)
   */
  clearCache() {
    this.rulesCache.clear();
  }
}
