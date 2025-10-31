import { Injectable, Logger } from '@nestjs/common';
import { QdrantService } from '../qdrant/qdrant.service';
import { GeminiEmbeddingService } from '../embeddings/gemini-embedding.service';
import { DuplicateRulesService } from './duplicate-rules.service';
import { DuplicateRulesResponseDto } from './dto/duplicate-rules.dto';

export interface DuplicateClassification {
  category: 'real_duplicate' | 'size_variant' | 'color_variant' | 'model_variant' | 'description_variant' | 'review_needed';
  confidence: number;
  reason: string;
  differences: string[];
  recommendation: 'merge' | 'keep_both' | 'review';
}

export interface DuplicateGroup {
  products: any[];
  avgSimilarity: number;
  recommended: any; // El producto recomendado para mantener
  duplicateIds: string[];
  aiClassification?: DuplicateClassification;
}

export interface DuplicateReport {
  totalGroups: number;
  totalDuplicates: number;
  estimatedSavings: number;
  groups: DuplicateGroup[];
  categorySummary?: {
    real_duplicates: number;
    size_variants: number;
    color_variants: number;
    model_variants: number;
    description_variants: number;
    review_needed: number;
  };
}

@Injectable()
export class DuplicatesService {
  private readonly logger = new Logger(DuplicatesService.name);

  constructor(
    private readonly qdrantService: QdrantService,
    private readonly geminiService: GeminiEmbeddingService,
    private readonly rulesService: DuplicateRulesService,
  ) {}

  /**
   * Detect duplicate products in a collection using vector similarity
   */
  async detectDuplicates(
    collectionName: string,
    similarityThreshold: number = 0.95,
    maxGroups: number = 50,
    customRules?: DuplicateRulesResponseDto,
    useAiClassification: boolean = false,
    filters?: Record<string, string | string[]>,
  ): Promise<DuplicateReport> {
    this.logger.log(
      `Detecting duplicates in ${collectionName} with threshold ${similarityThreshold}`,
    );

    if (filters && Object.keys(filters).length > 0) {
      this.logger.log(`Applying filters: ${JSON.stringify(filters)}`);
    }

    const startTime = Date.now();

    // Load rules for this collection
    const rules = customRules || (await this.rulesService.getRules(collectionName));

    // Get collection info to know how many products we have
    const collectionInfo = await this.qdrantService.getCollectionInfo(collectionName);
    const totalPoints = (collectionInfo as any).points_count || 0;

    this.logger.log(`Collection has ${totalPoints} products`);

    // For large collections, we'll use a sampling approach
    // Get a sample of products to analyze
    const sampleSize = Math.min(1000, totalPoints);
    const client = this.qdrantService.getClient();

    // Build Qdrant filter from payload filters
    const qdrantFilter = this.buildQdrantFilter(filters);

    // Scroll through products to get a sample
    const scrollResult = await client.scroll(collectionName, {
      limit: sampleSize,
      with_payload: true,
      with_vector: false,
      filter: qdrantFilter,
    });

    const products = scrollResult.points;
    this.logger.log(`Analyzing ${products.length} products for duplicates`);

    // Track which products we've already grouped
    const processedIds = new Set<string>();
    const duplicateGroups: DuplicateGroup[] = [];

    // For each product, find similar products
    for (const product of products) {
      const productId = String(product.id);

      if (processedIds.has(productId)) {
        continue; // Already in a group
      }

      // Use recommend API to find similar products (using this product as positive example)
      try {
        const similar = await this.qdrantService.recommend(
          collectionName,
          [productId],
          [],
          20, // Get top 20 similar
        );

        // Filter by similarity threshold AND exclude size/talla variants
        const highSimilarity = similar.filter((s) => {
          if (s.score < similarityThreshold || s.id === product.id) {
            return false;
          }

          // Check if products only differ in variants (size/color/accessories)
          if (this.areVariants(product.payload, s.payload, rules)) {
            this.logger.debug(`Skipping ${s.id} - is a variant of ${productId}`);
            return false;
          }

          return true;
        });

        if (highSimilarity.length > 0) {
          // Found potential duplicates!
          const groupProducts = [
            { id: product.id, score: 1.0, payload: product.payload },
            ...highSimilarity,
          ];

          // Mark all as processed
          groupProducts.forEach((p) => processedIds.add(String(p.id)));

          // Calculate average similarity
          const avgSimilarity =
            groupProducts.reduce((sum, p) => sum + p.score, 0) / groupProducts.length;

          // Determine which product to keep
          const recommended = this.selectBestProduct(groupProducts);

          // Get IDs of duplicates (all except recommended)
          const duplicateIds = groupProducts
            .filter((p) => p.id !== recommended.id)
            .map((p) => String(p.id));

          duplicateGroups.push({
            products: groupProducts,
            avgSimilarity,
            recommended,
            duplicateIds,
          });

          if (duplicateGroups.length >= maxGroups) {
            break; // Stop after finding enough groups
          }
        }
      } catch (error) {
        this.logger.error(`Failed to find similar for product ${productId}: ${error.message}`);
        this.logger.error(`Error details: ${JSON.stringify(error.response?.data || error)}`);
        continue; // Skip this product and continue with next
      }
    }

    const duration = Date.now() - startTime;
    const totalDuplicates = duplicateGroups.reduce(
      (sum, g) => sum + g.duplicateIds.length,
      0,
    );

    this.logger.log(
      `Found ${duplicateGroups.length} duplicate groups with ${totalDuplicates} duplicates in ${duration}ms`,
    );

    // Apply AI classification if requested
    let categorySummary = undefined;
    if (useAiClassification && duplicateGroups.length > 0) {
      this.logger.log('Applying AI classification to duplicate groups...');

      try {
        // Prepare groups for classification
        const groupsForClassification = duplicateGroups.map(group => ({
          products: group.products.map(p => ({
            id: String(p.payload?.id || p.id),
            description: String(p.payload?.descripcion || p.payload?.description || ''),
            score: p.score,
          })),
          avgSimilarity: group.avgSimilarity,
        }));

        // Classify groups
        const classifications = await this.geminiService.classifyDuplicateGroups(groupsForClassification);

        // Add classifications to groups
        classifications.forEach((classification) => {
          if (classification.groupIndex < duplicateGroups.length) {
            duplicateGroups[classification.groupIndex].aiClassification = {
              category: classification.category as any,
              confidence: classification.confidence,
              reason: classification.reason,
              differences: classification.differences,
              recommendation: classification.recommendation as any,
            };
          }
        });

        // Calculate category summary
        const categoryCounts = {
          real_duplicates: 0,
          size_variants: 0,
          color_variants: 0,
          model_variants: 0,
          description_variants: 0,
          review_needed: 0,
        };

        duplicateGroups.forEach((group) => {
          const category = group.aiClassification?.category || 'review_needed';
          if (category === 'real_duplicate') categoryCounts.real_duplicates++;
          else if (category === 'size_variant') categoryCounts.size_variants++;
          else if (category === 'color_variant') categoryCounts.color_variants++;
          else if (category === 'model_variant') categoryCounts.model_variants++;
          else if (category === 'description_variant') categoryCounts.description_variants++;
          else categoryCounts.review_needed++;
        });

        categorySummary = categoryCounts;
        this.logger.log(`AI classification complete: ${JSON.stringify(categorySummary)}`);
      } catch (error) {
        this.logger.error(`Failed to apply AI classification: ${error.message}`);
        // Continue without classification
      }
    }

    return {
      totalGroups: duplicateGroups.length,
      totalDuplicates,
      estimatedSavings: totalDuplicates,
      groups: duplicateGroups,
      categorySummary,
    };
  }

  /**
   * Find similar products to a specific product ID
   */
  async findSimilarProducts(
    collectionName: string,
    productId: string,
    similarityThreshold: number = 0.90,
  ): Promise<any> {
    this.logger.log(`Finding similar products to ${productId}`);

    // Use recommend to find similar products
    const similar = await this.qdrantService.recommend(
      collectionName,
      [productId],
      [],
      50,
    );

    // Filter by threshold
    const potentialDuplicates = similar.filter(
      (s) => s.score >= similarityThreshold,
    );

    // Get the original product
    const client = this.qdrantService.getClient();
    const original = await client.retrieve(collectionName, {
      ids: [productId],
      with_payload: true,
    });

    if (original.length === 0) {
      throw new Error(`Product ${productId} not found`);
    }

    const allProducts = [
      { id: productId, score: 1.0, payload: original[0].payload },
      ...potentialDuplicates,
    ];

    const recommended = this.selectBestProduct(allProducts);

    return {
      originalProduct: original[0],
      similarProducts: potentialDuplicates,
      recommended,
      totalSimilar: potentialDuplicates.length,
    };
  }

  /**
   * Generate a comprehensive duplicate report
   */
  async generateDuplicateReport(collectionName: string): Promise<any> {
    const report = await this.detectDuplicates(collectionName, 0.95, 100);

    // Group by categories for better analysis
    const byCategory = new Map<string, DuplicateGroup[]>();

    report.groups.forEach((group) => {
      const category =
        group.products[0]?.payload?.categoria || 'Sin categoría';
      if (!byCategory.has(category)) {
        byCategory.set(category, []);
      }
      byCategory.get(category).push(group);
    });

    const categoryStats = Array.from(byCategory.entries()).map(
      ([category, groups]) => ({
        category,
        groupCount: groups.length,
        duplicateCount: groups.reduce((sum, g) => sum + g.duplicateIds.length, 0),
      }),
    );

    return {
      summary: {
        totalGroups: report.totalGroups,
        totalDuplicates: report.totalDuplicates,
        estimatedSavings: report.estimatedSavings,
      },
      byCategory: categoryStats,
      topGroups: report.groups.slice(0, 20), // Top 20 groups
    };
  }

  /**
   * Select the best product to keep from a group of duplicates
   * Based on: sales, last sale date, stock, price list
   */
  private selectBestProduct(products: any[]): any {
    let best = products[0];
    let bestScore = this.calculateProductScore(best);

    for (const product of products) {
      const score = this.calculateProductScore(product);
      if (score > bestScore) {
        best = product;
        bestScore = score;
      }
    }

    return best;
  }


  /**
   * Calculate a score for a product based on business criteria
   */
  private calculateProductScore(product: any): number {
    let score = 0;
    const payload = product.payload || {};

    // Sales volume (higher is better)
    const sales = parseInt(payload.ventas_3_anios || '0') || 0;
    score += sales * 10; // Weight sales heavily

    // Last sale date (more recent is better)
    if (payload.fecha_ultima_venta) {
      try {
        const lastSale = new Date(payload.fecha_ultima_venta);
        const now = new Date();
        const daysSince = Math.floor(
          (now.getTime() - lastSale.getTime()) / (1000 * 60 * 60 * 24),
        );

        // More recent = higher score
        if (daysSince <= 30) {
          score += 100; // Very recent
        } else if (daysSince <= 90) {
          score += 50; // Recent
        } else if (daysSince <= 180) {
          score += 25; // Moderately recent
        } else if (daysSince <= 365) {
          score += 10; // Within last year
        }
      } catch (e) {
        // Invalid date
      }
    }

    // In stock (available is better)
    if (payload.en_stock === true || payload.en_stock === 'true') {
      score += 50;
    }

    // Has price list (active product)
    if (payload.precio_lista === true || payload.precio_lista === 'true') {
      score += 30;
    }

    // Has manufacturer code (more complete info)
    if (payload.codigo_fabricante && payload.codigo_fabricante.length > 0) {
      score += 20;
    }

    // More recent updated_at
    if (payload.updated_at) {
      try {
        const updated = new Date(payload.updated_at);
        const now = new Date();
        const daysSince = Math.floor(
          (now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (daysSince <= 30) {
          score += 15;
        } else if (daysSince <= 90) {
          score += 10;
        }
      } catch (e) {
        // Invalid date
      }
    }

    return score;
  }

  /**
   * Check if two products are variants using configurable rules
   * Returns true if they only differ in variant properties (colors, sizes, etc.)
   */
  private areVariants(
    payload1: any,
    payload2: any,
    rules: DuplicateRulesResponseDto,
  ): boolean {
    // Strategy 1: Check manufacturer code + part number (if enabled)
    if (rules.strategy.useManufacturerCode) {
      const codigoFab1 = payload1?.codigo_fabricante || '';
      const codigoFab2 = payload2?.codigo_fabricante || '';
      const numeroParte1 = payload1?.numero_parte || payload1?.part_number || '';
      const numeroParte2 = payload2?.numero_parte || payload2?.part_number || '';

      if (codigoFab1 && codigoFab2 && codigoFab1 === codigoFab2) {
        if (numeroParte1 && numeroParte2 && numeroParte1 !== numeroParte2) {
          return true; // Same manufacturer, different part = variants
        }
      }
    }

    // Strategy 2: Check description normalization (if enabled)
    if (rules.strategy.useDescriptionNormalization) {
      const id1 = payload1?.id || '';
      const id2 = payload2?.id || '';

      if (id1 && id2 && id1 !== id2) {
        const desc1 = payload1?.descripcion || payload1?.description || payload1?.nombre || '';
        const desc2 = payload2?.descripcion || payload2?.description || payload2?.nombre || '';

        if (desc1 && desc2) {
          const normalized1 = this.normalizeDescription(desc1, rules);
          const normalized2 = this.normalizeDescription(desc2, rules);

          const minLength = rules.strategy.minNormalizedLength || 10;
          if (normalized1 === normalized2 && normalized1.length > minLength) {
            return true; // Descriptions are identical after normalization = variants
          }
        }
      }
    }

    return false; // Not variants
  }

  /**
   * Normalize product description using configurable rules
   */
  private normalizeDescription(text: string, rules: DuplicateRulesResponseDto): string {
    let normalized = String(text).toLowerCase();

    // Apply color words removal
    if (rules.colorWords?.enabled && rules.colorWords.words) {
      rules.colorWords.words.forEach((color) => {
        const regex = new RegExp(`\\b${color}\\b`, 'gi');
        normalized = normalized.replace(regex, ' ');
      });
    }

    // Apply variant type words removal
    if (rules.variantTypeWords?.enabled && rules.variantTypeWords.words) {
      rules.variantTypeWords.words.forEach((word) => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        normalized = normalized.replace(regex, ' ');
      });
    }

    // Apply pattern rules
    const patterns = rules.patterns || {};

    if (patterns.removeConSin?.enabled && patterns.removeConSin.regex) {
      normalized = normalized.replace(new RegExp(patterns.removeConSin.regex, 'gi'), ' ');
    }

    if (patterns.removeMaterialGrades?.enabled && patterns.removeMaterialGrades.regex) {
      normalized = normalized.replace(new RegExp(patterns.removeMaterialGrades.regex, 'gi'), ' ');
    }

    if (patterns.removeThreadTypes?.enabled && patterns.removeThreadTypes.patterns) {
      patterns.removeThreadTypes.patterns.forEach((pattern) => {
        normalized = normalized.replace(new RegExp(pattern, 'gi'), ' ');
      });
    }

    if (patterns.removeProductTypes?.enabled && patterns.removeProductTypes.patterns) {
      patterns.removeProductTypes.patterns.forEach((pattern) => {
        normalized = normalized.replace(new RegExp(pattern, 'gi'), ' ');
      });
    }

    if (patterns.removeModelVariations?.enabled && patterns.removeModelVariations.patterns) {
      patterns.removeModelVariations.patterns.forEach((pattern) => {
        normalized = normalized.replace(new RegExp(pattern, 'gi'), 'modelo ');
      });
    }

    if (patterns.removeShoeWidths?.enabled && patterns.removeShoeWidths.regex) {
      normalized = normalized.replace(new RegExp(patterns.removeShoeWidths.regex, 'gi'), ' ');
    }

    if (patterns.removeQuantityUnits?.enabled && patterns.removeQuantityUnits.regex) {
      normalized = normalized.replace(new RegExp(patterns.removeQuantityUnits.regex, 'gi'), ' ');
    }

    if (patterns.removeSerialNumbers?.enabled && patterns.removeSerialNumbers.regex) {
      normalized = normalized.replace(new RegExp(patterns.removeSerialNumbers.regex, 'gi'), ' ');
    }

    if (patterns.removeAccessories?.enabled && patterns.removeAccessories.patterns) {
      patterns.removeAccessories.patterns.forEach((pattern) => {
        normalized = normalized.replace(new RegExp(pattern, 'gi'), ' ');
      });
    }

    if (patterns.removeUsageLabels?.enabled && patterns.removeUsageLabels.regex) {
      normalized = normalized.replace(new RegExp(patterns.removeUsageLabels.regex, 'gi'), ' ');
    }

    if (patterns.removeSizesTalla?.enabled && patterns.removeSizesTalla.regex) {
      normalized = normalized.replace(new RegExp(patterns.removeSizesTalla.regex, 'gi'), 'talla ');
    }

    if (patterns.removePackagingQuantities?.enabled && patterns.removePackagingQuantities.regex) {
      normalized = normalized.replace(new RegExp(patterns.removePackagingQuantities.regex, 'gi'), ' ');
    }

    // Apply custom patterns
    if (rules.customPatterns) {
      rules.customPatterns.forEach((custom) => {
        if (custom.enabled) {
          normalized = normalized.replace(
            new RegExp(custom.regex, 'gi'),
            custom.replacement || ' ',
          );
        }
      });
    }

    // Final cleanup
    normalized = normalized
      .replace(/\s+/g, ' ') // Normalize spaces
      .replace(/[""'']/g, '"') // Normalize quotes
      .trim();

    return normalized;
  }

  /**
   * Build Qdrant filter from payload filters
   */
  private buildQdrantFilter(filters?: Record<string, string | string[]>): any {
    if (!filters || Object.keys(filters).length === 0) {
      return undefined;
    }

    const must: any[] = [];

    for (const [key, value] of Object.entries(filters)) {
      if (Array.isArray(value) && value.length > 0) {
        // Multiple values: use should (OR)
        must.push({
          key,
          match: { any: value },
        });
      } else if (typeof value === 'string' && value.length > 0) {
        // Single value
        must.push({
          key,
          match: { value },
        });
      }
    }

    if (must.length === 0) {
      return undefined;
    }

    return { must };
  }

  /**
   * Get unique values for filter fields in a collection
   */
  async getFilterValues(collectionName: string, fields: string[]): Promise<Record<string, string[]>> {
    this.logger.log(`Getting filter values for ${collectionName}: ${fields.join(', ')}`);

    const client = this.qdrantService.getClient();
    const result: Record<string, Set<string>> = {};

    // Initialize sets for each field
    fields.forEach(field => {
      result[field] = new Set<string>();
    });

    let offset: string | number | Record<string, unknown> | undefined = undefined;
    let hasMore = true;

    // Scroll through all products to collect unique values
    while (hasMore) {
      const scrollResult = await client.scroll(collectionName, {
        limit: 100,
        offset,
        with_payload: true,
        with_vector: false,
      });

      scrollResult.points.forEach((point) => {
        const payload = point.payload || {};

        fields.forEach(field => {
          const value = payload[field];
          if (value && typeof value === 'string' && value.trim() !== '') {
            result[field].add(value.trim());
          }
        });
      });

      offset = scrollResult.next_page_offset;
      hasMore = !!offset;

      // Safety limit: stop after 10000 products
      if (!hasMore || scrollResult.points.length === 0) {
        break;
      }
    }

    // Convert sets to sorted arrays
    const finalResult: Record<string, string[]> = {};
    Object.entries(result).forEach(([field, valueSet]) => {
      finalResult[field] = Array.from(valueSet).sort();
    });

    this.logger.log(`Found filter values: ${JSON.stringify(
      Object.entries(finalResult).map(([k, v]) => `${k}:${v.length}`)
    )}`);

    return finalResult;
  }

  /**
   * Validate if a product already exists in the database
   * Uses semantic search + AI to detect exact matches and variants
   */
  async validateProductExists(
    collectionName: string,
    descripcion: string,
    marca?: string,
    modelo?: string,
    similarityThreshold: number = 0.90,
  ): Promise<{
    exists: boolean;
    isExactMatch: boolean;
    isVariant: boolean;
    reason: string;
    confidence: number;
    matchedProducts: Array<{
      id: string;
      descripcion: string;
      marca?: string;
      modelo?: string;
      similarity: number;
      payload: any;
    }>;
    recommendation: 'reject' | 'accept' | 'review';
  }> {
    this.logger.log(`Validating if product exists: ${descripcion}`);

    try {
      // Step 1: Generate embedding for the product description
      const embedding = await this.geminiService.generateEmbedding(descripcion);

      // Step 2: Search for similar products in Qdrant
      const searchResults = await this.qdrantService.search(
        collectionName,
        embedding,
        20, // Get top 20 similar products
        similarityThreshold,
      );

      this.logger.log(`Found ${searchResults.length} similar products above threshold ${similarityThreshold}`);

      // If no similar products found, it's a new product
      if (searchResults.length === 0) {
        return {
          exists: false,
          isExactMatch: false,
          isVariant: false,
          reason: 'No se encontraron productos similares en la base de datos',
          confidence: 1.0,
          matchedProducts: [],
          recommendation: 'accept',
        };
      }

      // Step 3: Prepare matched products for AI validation
      const matchedProducts = searchResults.map((result) => ({
        id: String(result.id),
        descripcion: String(result.payload?.descripcion || result.payload?.description || ''),
        marca: result.payload?.marca,
        modelo: result.payload?.modelo,
        similarity: result.score,
        payload: result.payload,
      }));

      // Step 4: Use AI to validate if the product exists
      const validation = await this.geminiService.validateProductExists(
        { descripcion, marca, modelo },
        matchedProducts,
      );

      this.logger.log(`AI validation result: ${JSON.stringify({
        exists: validation.exists,
        recommendation: validation.recommendation,
        confidence: validation.confidence,
      })}`);

      // Return complete validation result
      return {
        exists: validation.exists,
        isExactMatch: validation.isExactMatch,
        isVariant: validation.isVariant,
        reason: validation.reason,
        confidence: validation.confidence,
        matchedProducts,
        recommendation: validation.recommendation,
      };
    } catch (error) {
      this.logger.error(`Error validating product existence: ${error.message}`);
      throw new Error(`Failed to validate product: ${error.message}`);
    }
  }
}
