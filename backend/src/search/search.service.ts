import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { GeminiEmbeddingService } from '../embeddings/gemini-embedding.service';
import { QdrantService } from '../qdrant/qdrant.service';
import { DatasourcesService } from '../datasources/datasources.service';
import { v5 as uuidv5 } from 'uuid';

const PRODUCT_CODE_NAMESPACE = 'b3c3e1c0-4d3e-4b3a-9c3e-1c0d3e4b3a9c';
import {
  TokenUsage,
  CostBreakdown,
  SearchCostTracking,
  calculateCost,
  aggregateCosts,
} from '../common/cost-tracking';

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching of brand names (stenli → STANLEY)
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Mapeo de campos del payload - adapta nombres genéricos a los campos reales del catálogo
 * Esto permite que el código funcione con diferentes estructuras de datos
 */
const PAYLOAD_FIELDS = {
  // Campos de producto
  descripcion: ['Articulo_Descripcion', 'descripcion', 'description', 'nombre'],
  marca: ['Marca_Descripcion', 'marca', 'brand'],
  categoria: ['Categoria_Descripcion', 'categoria', 'category'],
  familia: ['Familia_Descripcion', 'familia'],
  subfamilia: ['Sub_Familia_Descripcion', 'subfamilia'],
  codigo: ['Articulo_Codigo', 'codigo', 'sku'],
  modelo: ['Articulo_Numero_Parte', 'modelo', 'model'],

  // Campos comerciales
  en_stock: ['Articulo_De_Stock', 'en_stock', 'in_stock'],
  precio_lista: ['Articulo_Lista_Costo', 'precio_lista', 'has_price'],
  ventas_3_anios: ['Cantidad_Ventas_Ultimos_3_Anios', 'ventas_3_anios', 'sales'],
  fecha_ultima_venta: ['Fecha_Ultima_Venta', 'fecha_ultima_venta', 'last_sale'],
};

/**
 * Helper para obtener un campo del payload usando el mapeo
 */
function getPayloadField(payload: any, fieldName: keyof typeof PAYLOAD_FIELDS, defaultValue: any = ''): any {
  if (!payload) return defaultValue;
  const possibleFields = PAYLOAD_FIELDS[fieldName];
  for (const field of possibleFields) {
    if (payload[field] !== undefined && payload[field] !== null) {
      return payload[field];
    }
  }
  return defaultValue;
}

/**
 * Infiere la categoría RTI desde un score vectorial (usado cuando LLM está deshabilitado)
 */
function inferRtiFromScore(score: number): { categoria: string; score_rti: number } {
  if (score >= 0.95) return { categoria: 'EXACTO', score_rti: 1.00 };
  if (score >= 0.90) return { categoria: 'EQUIVALENTE', score_rti: 0.95 };
  if (score >= 0.80) return { categoria: 'SUSTITUTO_PERFECTO', score_rti: 0.85 };
  if (score >= 0.65) return { categoria: 'SUSTITUTO_VALIDO', score_rti: 0.70 };
  if (score >= 0.45) return { categoria: 'MISMA_CATEGORIA', score_rti: 0.50 };
  if (score >= 0.25) return { categoria: 'RELACIONADO', score_rti: 0.30 };
  if (score >= 0.10) return { categoria: 'IRRELEVANTE', score_rti: 0.10 };
  return { categoria: 'RECHAZADO', score_rti: 0.00 };
}

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);

  // Cache of known brands per collection for fuzzy matching
  private brandCache: Map<string, Set<string>> = new Map();
  private brandCacheExpiry: Map<string, number> = new Map();
  private readonly BRAND_CACHE_TTL = 1000 * 60 * 60; // 1 hour

  constructor(
    private readonly geminiService: GeminiEmbeddingService,
    private readonly qdrantService: QdrantService,
    private readonly datasourcesService: DatasourcesService,
  ) {}

  async onModuleInit() {
    // Pre-load brands for common collections on startup
    this.logger.log('Pre-loading brand cache for fuzzy matching...');
    try {
      await this.loadBrandsForCollection('catalogo_stock');
      await this.loadBrandsForCollection('catalogo_efc');
    } catch (error) {
      this.logger.warn(`Failed to pre-load brand cache: ${error.message}`);
    }
  }

  /**
   * Load unique brands from a collection into cache
   */
  private async loadBrandsForCollection(collectionName: string): Promise<Set<string>> {
    const now = Date.now();
    const expiry = this.brandCacheExpiry.get(collectionName);

    // Return cached if not expired
    if (expiry && expiry > now && this.brandCache.has(collectionName)) {
      return this.brandCache.get(collectionName)!;
    }

    try {
      // Scroll through collection to get unique brands
      const brands = new Set<string>();
      let offset: string | null = null;
      const batchSize = 1000;
      let totalPoints = 0;

      do {
        const response = await this.qdrantService.scroll(
          collectionName,
          batchSize,
          offset,
          { include: ['Marca_Descripcion'] }
        );

        for (const point of response.points) {
          const marca = point.payload?.Marca_Descripcion;
          if (marca && typeof marca === 'string' && marca.trim()) {
            brands.add(marca.trim().toUpperCase());
          }
        }

        totalPoints += response.points.length;
        offset = response.next_page_offset;
      } while (offset);

      this.brandCache.set(collectionName, brands);
      this.brandCacheExpiry.set(collectionName, now + this.BRAND_CACHE_TTL);

      this.logger.log(`Loaded ${brands.size} unique brands from ${collectionName} (${totalPoints} points scanned)`);
      return brands;
    } catch (error) {
      this.logger.error(`Failed to load brands from ${collectionName}: ${error.message}`);
      return new Set();
    }
  }

  /**
   * Find the closest matching brand using fuzzy matching (Levenshtein distance)
   * Returns the corrected brand name if a close match is found, otherwise returns the original
   *
   * @param inputBrand - The brand name to match (e.g., "stenli", "stanly")
   * @param collectionName - The collection to search brands in
   * @returns Object with corrected brand and whether it was auto-corrected
   */
  private async fuzzyMatchBrand(
    inputBrand: string,
    collectionName: string
  ): Promise<{ brand: string; corrected: boolean; originalInput: string; similarity: number }> {
    const normalizedInput = inputBrand.toUpperCase().trim();
    const brands = await this.loadBrandsForCollection(collectionName);

    // If exact match exists, return it
    if (brands.has(normalizedInput)) {
      return { brand: normalizedInput, corrected: false, originalInput: inputBrand, similarity: 1.0 };
    }

    // Find closest match using Levenshtein distance
    let bestMatch = normalizedInput;
    let bestDistance = Infinity;
    let bestSimilarity = 0;

    for (const knownBrand of brands) {
      const distance = levenshteinDistance(normalizedInput, knownBrand);

      // Calculate similarity as percentage (1 - distance/maxLength)
      const maxLen = Math.max(normalizedInput.length, knownBrand.length);
      const similarity = 1 - (distance / maxLen);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = knownBrand;
        bestSimilarity = similarity;
      }
    }

    // Auto-correct if:
    // 1. Distance is <= 2 characters for short brands (allows "bosh" → "BOSCH")
    // 2. Distance is <= 3 for longer brands (allows "stenli" → "STANLEY")
    // 3. OR similarity is >= 55% (allows phonetic typos like stenli/stanley)
    // 4. The match must have at least 50% similarity to avoid wild corrections
    const maxAllowedDistance = normalizedInput.length <= 5 ? 2 : 3;
    const shouldCorrect = (
      (bestDistance <= maxAllowedDistance && bestSimilarity >= 0.50) ||
      (bestSimilarity >= 0.55 && normalizedInput.length >= 4)
    );

    if (shouldCorrect && bestMatch !== normalizedInput) {
      this.logger.log(
        `🔧 Brand fuzzy match: "${inputBrand}" → "${bestMatch}" ` +
        `(distance: ${bestDistance}, similarity: ${(bestSimilarity * 100).toFixed(0)}%)`
      );
      return { brand: bestMatch, corrected: true, originalInput: inputBrand, similarity: bestSimilarity };
    }

    // No good match found, return original (will trigger fallback later)
    this.logger.debug(
      `No fuzzy match for "${inputBrand}": best="${bestMatch}", ` +
      `distance=${bestDistance}, similarity=${(bestSimilarity * 100).toFixed(0)}%`
    );
    return { brand: normalizedInput, corrected: false, originalInput: inputBrand, similarity: bestSimilarity };
  }

  async searchByText(
    query: string,
    collectionName: string,
    limit: number = 3, // Default reduced to 3 for precision-focused results
    marca?: string,
    cliente?: string,
    useLLMFilter: boolean = false,
    payloadFilters?: { [key: string]: any },
    minRelevancia?: number, // Dynamic default based on useLLMFilter
  ): Promise<any> {
    // Dynamic threshold logic:
    // - If user specifies minRelevancia explicitly, use that value
    // - If useLLMFilter=true: use 0.65 (LLM filters noise, lower threshold OK)
    // - If useLLMFilter=false: use 0.70 (higher threshold compensates for no LLM filtering)
    const effectiveMinRelevancia = minRelevancia !== undefined
      ? minRelevancia
      : useLLMFilter
        ? 0.65  // With LLM: lower threshold, LLM will filter noise
        : 0.70; // Without LLM: higher threshold to reduce noise (filters irrelevant results like 68%)

    this.logger.log(`Searching by text in collection: ${collectionName}`);
    this.logger.debug(`Query: ${query}${marca ? `, Marca: ${marca}` : ''}${cliente ? `, Cliente: ${cliente}` : ''}${payloadFilters ? `, Payload Filters: ${JSON.stringify(payloadFilters)}` : ''} | LLM Filter: ${useLLMFilter ? 'ON' : 'OFF'} | minRelevancia: ${effectiveMinRelevancia}${minRelevancia === undefined ? ' (auto)' : ''}`);

    const startTime = Date.now();

    try {
      // Step 1: Normalize and fuzzy-match marca for case-insensitive and typo-tolerant matching
      // The database stores brands in uppercase (STANLEY, TRUPER, etc.)
      // Fuzzy matching handles typos like "stenli" → "STANLEY", "trupper" → "TRUPER"
      let normalizedMarca: string | undefined;
      let marcaCorrected = false;
      let marcaOriginalInput: string | undefined;

      if (marca) {
        const fuzzyResult = await this.fuzzyMatchBrand(marca, collectionName);
        normalizedMarca = fuzzyResult.brand;
        marcaCorrected = fuzzyResult.corrected;
        marcaOriginalInput = fuzzyResult.originalInput;

        if (marcaCorrected) {
          this.logger.log(`Brand auto-corrected: "${marcaOriginalInput}" → "${normalizedMarca}"`);
        }
      }

      // Step 1b: Convert marca parameter to payload filter for hard filtering
      if (normalizedMarca && (!payloadFilters || !payloadFilters['marca'])) {
        payloadFilters = payloadFilters || {};
        payloadFilters['marca'] = normalizedMarca;
        this.logger.log(`Converting marca parameter to payload filter: ${normalizedMarca}${marcaCorrected ? ` (corrected from: ${marcaOriginalInput})` : ` (original: ${marca})`}`);
      }

      // Step 2: Extract keywords from query for attention mechanism
      let enhancedQuery = query;
      const keywords = this.extractKeywords(query);

      if (normalizedMarca) {
        enhancedQuery = `${query} ${normalizedMarca}`;
        keywords.brands = [normalizedMarca.toLowerCase()];
        this.logger.log(`Brand filter applied: ${normalizedMarca}, enhanced query: "${enhancedQuery}"`);
      }

      this.logger.debug(
        `Extracted keywords - productCore: [${keywords.productCore.join(', ')}], ` +
        `brands: [${keywords.brands.join(', ')}], ` +
        `models: [${keywords.models.join(', ')}], ` +
        `dimensions: [${keywords.dimensions.join(', ')}], ` +
        `colors: [${keywords.colors.join(', ')}], ` +
        `materials: [${keywords.materials.join(', ')}], ` +
        `presentations: [${keywords.presentations.join(', ')}], ` +
        `regular: [${keywords.regular.join(', ')}]`
      );

      // Step 3: Build attention-based query structure using enhanced query
      const attentionQuery = this.buildAttentionQuery(enhancedQuery, keywords);

      // Step 4: Build Qdrant filter for hybrid search (includes payload filters)
      const qdrantFilter = this.buildQdrantFilter(keywords, payloadFilters);

      // Step 5: Generate embedding from attention-structured query (with cost tracking)
      this.logger.debug('Generating embedding from attention query...');
      const embeddingResult = await this.geminiService.generateEmbeddingWithTracking(attentionQuery);
      const embedding = embeddingResult.embedding;
      const embeddingUsage = embeddingResult.usage;

      // Step 6: Calculate search limit based on mode
      // LLM ON: fetch 2x candidates for LLM to evaluate and rerank
      // LLM OFF: fetch exactly what's requested
      // Marca/Cliente filters: expand to ensure enough results after filtering
      const LLM_MULTIPLIER = 2;
      const FILTER_MULTIPLIER = 10;
      let searchLimit: number;

      if (normalizedMarca || cliente) {
        // Expand search when filters are active
        searchLimit = limit * FILTER_MULTIPLIER;
        const activeFilters = [normalizedMarca ? 'marca' : null, cliente ? 'cliente' : null].filter(Boolean).join(' + ');
        this.logger.log(`Filter active (${activeFilters}), expanding search to ${searchLimit} results`);
      } else if (useLLMFilter) {
        // LLM mode: fetch 2x for better reranking
        searchLimit = limit * LLM_MULTIPLIER;
        this.logger.log(`LLM mode: fetching ${searchLimit} candidates (${limit}×${LLM_MULTIPLIER})`);
      } else {
        // Direct mode: fetch exactly what's needed
        searchLimit = limit;
      }

      this.logger.debug(`Searching in Qdrant collection: ${collectionName} (limit: ${searchLimit})${qdrantFilter ? ' with filters' : ' without filters'}`);
      let searchResults = await this.qdrantService.search(collectionName, embedding, searchLimit, qdrantFilter);

      // HYBRID FALLBACK: If marca filter returned poor results, retry without marca filter
      // This ensures users get results even when the brand doesn't have that specific product
      // Triggers:
      //   1. Zero results with marca filter
      //   2. Best result score is below threshold (brand exists but doesn't have this specific product)
      //
      // Threshold calibration (based on 113 test analysis):
      // - Vectorial scores for generic queries average 0.70-0.74
      // - Using 0.70 reduces false positives from 71.4% to ~15%
      // - LLM mode uses RTI scores (0.5, 0.7, 0.85, 0.95, 1.0) - different scale
      const MARCA_FALLBACK_THRESHOLD_VECTORIAL = 0.70; // For non-LLM mode (vectorial scores)
      const MARCA_FALLBACK_THRESHOLD_LLM = 0.65;       // For LLM mode (RTI scores, lower because LLM reranks)
      const MARCA_FALLBACK_THRESHOLD = useLLMFilter ? MARCA_FALLBACK_THRESHOLD_LLM : MARCA_FALLBACK_THRESHOLD_VECTORIAL;
      let marcaFallbackApplied = false;
      let marcaFallbackReason = '';
      const bestMarcaScore = searchResults.length > 0 ? searchResults[0].score : 0;
      const shouldFallback = searchResults.length === 0 ||
        (normalizedMarca && bestMarcaScore < MARCA_FALLBACK_THRESHOLD);

      if (shouldFallback && normalizedMarca && qdrantFilter) {
        marcaFallbackReason = searchResults.length === 0
          ? `No se encontraron productos de marca "${normalizedMarca}" para esta búsqueda. Mostrando resultados de otras marcas.`
          : `Los productos de marca "${normalizedMarca}" tienen baja similitud (${(bestMarcaScore * 100).toFixed(0)}%). Mostrando resultados de otras marcas (priorizando "${normalizedMarca}" en similitud).`;
        this.logger.warn(`Marca filter "${normalizedMarca}" - ${marcaFallbackReason} - applying HYBRID FALLBACK`);

        // Remove marca from payload filters for fallback search
        const fallbackPayloadFilters = { ...payloadFilters };
        delete fallbackPayloadFilters['marca'];

        // Rebuild filter without marca (or null if no other filters)
        const fallbackQdrantFilter = Object.keys(fallbackPayloadFilters).length > 0
          ? this.buildQdrantFilter(keywords, fallbackPayloadFilters)
          : null;

        // Search again without marca filter (embedding already includes marca for prioritization)
        searchResults = await this.qdrantService.search(collectionName, embedding, searchLimit, fallbackQdrantFilter);
        marcaFallbackApplied = true;

        this.logger.log(`HYBRID FALLBACK: Found ${searchResults.length} results without strict marca filter (marca "${normalizedMarca}" still in embedding for prioritization)`);
      }

      // Step 8: NO BOOST - Trust Qdrant's vectorial scores directly
      // The embedding quality from Gemini is sufficient for accurate ranking
      this.logger.debug('Using pure Qdrant vectorial scores (no keyword boost)');

      // Step 7: LLM Semantic Filter OR Vectorial Filter
      let semanticallyFiltered: any[];
      let llmUsage: TokenUsage | null = null; // Track LLM token usage for cost calculation

      if (useLLMFilter) {
        this.logger.log('LLM Filter ENABLED - Evaluating ALL candidates with RTI...');
        const llmFilterStart = Date.now();

        // Evaluate ALL candidates from Qdrant (not just top 20)
        // This ensures proper RTI reranking of all results
        const productsForLLM = searchResults.map(r => ({
          id: String(r.id), // Use Qdrant UUID, not payload.id
          descripcion: getPayloadField(r.payload, 'descripcion', ''),
          marca: getPayloadField(r.payload, 'marca', ''),
          categoria: getPayloadField(r.payload, 'categoria', ''),
          codigo: getPayloadField(r.payload, 'codigo', ''),
          score: r.score,
        }));

        this.logger.log(`Sending ${productsForLLM.length} candidates to LLM for RTI evaluation`);

        // Use enhanced query (includes marca if present) for LLM evaluation with cost tracking
        const llmFilterResult = await this.geminiService.filterSearchResultsWithTracking(enhancedQuery, productsForLLM);
        const llmResults = llmFilterResult.results;
        llmUsage = llmFilterResult.usage;
        const llmFilterDuration = Date.now() - llmFilterStart;
        this.logger.log(`LLM filter completed in ${llmFilterDuration}ms - evaluated ${llmResults.length} products | Tokens: ${llmUsage.inputTokens} in / ${llmUsage.outputTokens} out`);

        // Create a map of LLM evaluations
        const llmEvaluationMap = new Map(llmResults.map(r => [r.id, r]));

        // Map results with RTI scores
        semanticallyFiltered = searchResults
          .map(result => {
            const resultId = String(result.id);
            const llmEval = llmEvaluationMap.get(resultId);

            if (!llmEval) {
              // Should not happen since we evaluate ALL, but fallback just in case
              this.logger.warn(`Product ${resultId} not evaluated by LLM`);
              return {
                ...result,
                _score_vectorial: result.score,
                _rti_score: 0, // Assume irrelevant if not evaluated
                _rti_categoria: 'NO_EVALUADO',
              };
            }

            // Add RTI metadata - USE RTI SCORE AS PRIMARY SCORE
            return {
              ...result,
              _llm_match: llmEval.match,
              _llm_confidence: llmEval.confidence,
              _llm_reason: llmEval.reason,
              _rti_score: llmEval.score_rti,
              _rti_categoria: llmEval.categoria_rti,
              _score_vectorial: result.score,
              score: llmEval.score_rti, // RTI score for ranking
            };
          })
          // Filter by minRelevancia (RTI score must be >= threshold)
          .filter(r => {
            const passesThreshold = r.score >= effectiveMinRelevancia;
            if (!passesThreshold) {
              this.logger.debug(`Filtered out ${r.id}: RTI=${r.score} < minRelevancia=${effectiveMinRelevancia}`);
            }
            return passesThreshold;
          })
          // Sort by RTI score (descending)
          .sort((a, b) => b.score - a.score)
          // Trim to requested limit
          .slice(0, limit);

        this.logger.log(`After RTI filter (≥${effectiveMinRelevancia}): ${semanticallyFiltered.length} results`);

        // POST-LLM FALLBACK: If LLM filtered all results AND marca was requested, retry without marca
        // This handles cases where the brand doesn't have the specific product type
        if (semanticallyFiltered.length === 0 && marca && !marcaFallbackApplied) {
          this.logger.warn(`LLM filtered all results for marca "${marca}" - applying POST-LLM FALLBACK`);

          // Remove marca from payload filters
          const fallbackPayloadFilters = { ...payloadFilters };
          delete fallbackPayloadFilters['marca'];

          // Rebuild filter without marca
          const fallbackQdrantFilter = Object.keys(fallbackPayloadFilters).length > 0
            ? this.buildQdrantFilter(keywords, fallbackPayloadFilters)
            : null;

          // Search without marca filter
          const fallbackSearchResults = await this.qdrantService.search(collectionName, embedding, searchLimit, fallbackQdrantFilter);

          // Re-evaluate with LLM
          const fallbackProductsForLLM = fallbackSearchResults.map(r => ({
            id: String(r.id),
            descripcion: getPayloadField(r.payload, 'descripcion', ''),
            marca: getPayloadField(r.payload, 'marca', ''),
            categoria: getPayloadField(r.payload, 'categoria', ''),
            codigo: getPayloadField(r.payload, 'codigo', ''),
            score: r.score,
          }));

          const fallbackLLMFilterResult = await this.geminiService.filterSearchResultsWithTracking(enhancedQuery, fallbackProductsForLLM);
          const fallbackLLMResults = fallbackLLMFilterResult.results;
          // Accumulate LLM usage from fallback
          if (llmUsage) {
            llmUsage.inputTokens += fallbackLLMFilterResult.usage.inputTokens;
            llmUsage.outputTokens += fallbackLLMFilterResult.usage.outputTokens;
            llmUsage.totalTokens += fallbackLLMFilterResult.usage.totalTokens;
          } else {
            llmUsage = fallbackLLMFilterResult.usage;
          }
          const fallbackLLMMap = new Map(fallbackLLMResults.map(r => [r.id, r]));

          semanticallyFiltered = fallbackSearchResults
            .map(result => {
              const llmEval = fallbackLLMMap.get(String(result.id));
              if (!llmEval) return null;
              return {
                ...result,
                _llm_match: llmEval.match,
                _llm_confidence: llmEval.confidence,
                _llm_reason: llmEval.reason,
                _rti_score: llmEval.score_rti,
                _rti_categoria: llmEval.categoria_rti,
                _score_vectorial: result.score,
                score: llmEval.score_rti,
              };
            })
            .filter(r => r !== null && r.score >= effectiveMinRelevancia)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

          marcaFallbackApplied = true;
          marcaFallbackReason = `Los productos de marca "${marca}" no coinciden con "${query}". Mostrando resultados de otras marcas.`;
          this.logger.log(`POST-LLM FALLBACK: Found ${semanticallyFiltered.length} results after removing marca filter`);
        }

      } else {
        // LLM filter DISABLED - use Qdrant vectorial scores with minRelevancia filter
        this.logger.log('LLM Filter DISABLED - using Qdrant vectorial scores');

        semanticallyFiltered = searchResults
          .map(r => ({
            ...r,
            _score_vectorial: r.score,
          }))
          // Filter by minRelevancia (vectorial score must be >= threshold)
          .filter(r => {
            const passesThreshold = r.score >= effectiveMinRelevancia;
            if (!passesThreshold) {
              this.logger.debug(`Filtered out ${r.id}: vectorial=${r.score} < minRelevancia=${effectiveMinRelevancia}`);
            }
            return passesThreshold;
          })
          // Already sorted by Qdrant, just trim
          .slice(0, limit);

        this.logger.log(`After vectorial filter (≥${effectiveMinRelevancia}): ${semanticallyFiltered.length} results`);
      }

      // Step 8: Final results (already filtered and trimmed)
      let finalResults = semanticallyFiltered;

      // Step 11: Enrich with client purchase data if cliente filter is provided
      let clientDataStatus = 'not_requested'; // 'not_requested' | 'success' | 'no_data' | 'error'
      let clientDataError = null;

      if (cliente) {
        this.logger.debug(`Enriching results with purchase data for client: ${cliente}`);

        try {
          const enrichedResults = await this.enrichWithClientData(finalResults, cliente, collectionName);

          // Check if enrichment was successful (at least one product has client data)
          const hasClientData = enrichedResults.some(r => r._vendido_a_cliente === true);

          if (hasClientData) {
            // Step 12: Filter to show ONLY products sold to this client
            const beforeFilterCount = enrichedResults.length;
            finalResults = enrichedResults.filter(r => r._vendido_a_cliente === true);
            this.logger.log(`Filtered from ${beforeFilterCount} to ${finalResults.length} products sold to client ${cliente}`);
            clientDataStatus = 'success';
          } else {
            // No products sold to this client - keep all results but mark status
            this.logger.warn(`Client ${cliente} has not purchased any of these products. Showing all results.`);
            finalResults = enrichedResults; // Keep all results with client data flags
            clientDataStatus = 'no_data';
          }
        } catch (error) {
          // Error accessing client database - keep all results but mark status
          this.logger.error(`Failed to fetch client data for ${cliente}: ${error.message}`);
          clientDataError = error.message;
          clientDataStatus = 'error';
          // Keep original results without client enrichment
        }

        // Step 11: Trim to requested limit after filtering
        finalResults = finalResults.slice(0, limit);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      this.logger.log(`Text search completed in ${duration}ms, found ${finalResults.length} results`);

      return {
        query,
        marca: normalizedMarca || marca, // Return the corrected/normalized marca
        ...(marcaCorrected && {
          marca_original: marcaOriginalInput,
          marca_autocorrected: true,
          marca_autocorrect_message: `Marca corregida automáticamente: "${marcaOriginalInput}" → "${normalizedMarca}"`,
        }),
        cliente,
        duration: `${duration}ms`,
        // Indicate if hybrid fallback was applied (marca filter relaxed)
        ...(marcaFallbackApplied && {
          marca_fallback: true,
          marca_fallback_message: marcaFallbackReason,
        }),
        ...(cliente && {
          total_found_for_client: finalResults.filter(r => r._vendido_a_cliente).length,
          client_data_status: clientDataStatus,
          ...(clientDataError && { client_data_error: clientDataError }),
          // UX message for frontend
          client_filter_message:
            clientDataStatus === 'error'
              ? `No se pudo conectar a la base de datos de ventas. Mostrando todos los resultados.`
              : clientDataStatus === 'no_data'
              ? `El cliente ${cliente} no ha comprado ninguno de estos productos. Mostrando todos los resultados.`
              : `Mostrando ${finalResults.filter(r => r._vendido_a_cliente).length} productos vendidos al cliente ${cliente}.`,
        }),
        // Cost tracking - shows token usage and estimated costs
        cost: (() => {
          const embeddingCost = calculateCost(embeddingUsage);
          const llmCost = llmUsage ? calculateCost(llmUsage) : null;
          return aggregateCosts(embeddingCost, llmCost);
        })(),
        results: finalResults.map((result) => {
          // Calcular RTI info - usar LLM si existe, sino inferir del score vectorial
          const rtiInfo = result._rti_categoria
            ? {
                score_rti: result._rti_score,
                categoria_rti: result._rti_categoria,
                evaluado_por: 'llm' as const,
                razon: result._llm_reason,
              }
            : {
                ...inferRtiFromScore(result._score_vectorial || result.score),
                evaluado_por: 'vectorial' as const,
                razon: 'Inferido desde score de similitud vectorial',
              };

          return {
            id: result.id,
            // score = RTI score (when LLM) or vectorial score (when no LLM)
            score: result.score,
            // Always include vectorial score for reference
            score_vectorial: result._score_vectorial || result.score,
            rti: rtiInfo,
            payload: result.payload,
            // ONLY include cliente_info if we successfully fetched client data
            // If there was an error connecting to DB, don't show misleading "Not sold" info
            ...(cliente && clientDataStatus !== 'error' && {
              cliente_info: {
                vendido_a_cliente: result._vendido_a_cliente || false,
                cantidad_ventas_cliente: result._cantidad_ventas_cliente || 0,
                primera_venta_cliente: result._primera_venta_cliente || null,
                ultima_venta_cliente: result._ultima_venta_cliente || null,
              },
            }),
          };
        }),
      };
    } catch (error) {
      this.logger.error(`Text search failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Build Qdrant filter from extracted keywords and optional payload filters
   * Strategy:
   * - No hardcoded filters (trust vector search for semantic similarity)
   * - Optional custom payload filters (for explicit field constraints)
   * - Examples:
   *   { "ventas_3_anios": { "gte": 1 } } → Products with 1+ sales
   *   { "en_stock": true } → Only in-stock products
   *   { "ventas_3_anios": { "gte": 50 } } → Very popular items (50+ sales)
   */
  private buildQdrantFilter(
    keywords: { brands: string[], dimensions: string[], colors: string[], presentations: string[], models: string[], materials: string[], productCore: string[], regular: string[] },
    payloadFilters?: { [key: string]: any }
  ): any {
    // If no custom payload filters provided, trust vector search 100%
    if (!payloadFilters || Object.keys(payloadFilters).length === 0) {
      this.logger.log('NO custom filters applied - trusting vector search + re-ranking completely');
      return null;
    }

    this.logger.log(`buildQdrantFilter called with payloadFilters: ${JSON.stringify(payloadFilters)}`);

    // Build Qdrant filter from payload constraints
    // Convert common field names to actual payload field names from catalogo_efc
    const fieldMapping: { [key: string]: string } = {
      // Ventas / Sales
      'ventas_3_anios': 'Cantidad_Ventas_Ultimos_3_Anios',
      'Cantidad_Ventas_Ultimos_3_Anios': 'Cantidad_Ventas_Ultimos_3_Anios',
      // Stock / Inventory
      'en_stock': 'Articulo_De_Stock',
      'stock': 'Articulo_De_Stock',
      'Articulo_De_Stock': 'Articulo_De_Stock',
      // Brand / Marca
      'marca': 'Marca_Descripcion',
      'Marca_Descripcion': 'Marca_Descripcion',
      // Family / Familia
      'familia': 'Familia_Descripcion',
      'Familia_Descripcion': 'Familia_Descripcion',
      // Last sale
      'precio_lista': 'Articulo_Lista_Costo',
      'fecha_ultima_venta': 'Fecha_Ultima_Venta',
      'ultima_venta': 'Fecha_Ultima_Venta',
    };

    const qdrantFilter: any = {
      must: []
    };

    // Process each payload filter
    for (const [field, condition] of Object.entries(payloadFilters)) {
      const actualField = fieldMapping[field] || field;

      if (typeof condition === 'object' && condition !== null) {
        // Handle range filters: { "gte": 1 }, { "gt": 0, "lte": 100 }, etc.
        if ('gte' in condition || 'gt' in condition || 'lte' in condition || 'lt' in condition) {
          const rangeFilter: any = {};
          if ('gte' in condition) rangeFilter.gte = condition.gte;
          if ('gt' in condition) rangeFilter.gt = condition.gt;
          if ('lte' in condition) rangeFilter.lte = condition.lte;
          if ('lt' in condition) rangeFilter.lt = condition.lt;

          qdrantFilter.must.push({
            range: {
              [actualField]: rangeFilter
            }
          });

          this.logger.debug(`Applied range filter on ${actualField}: ${JSON.stringify(rangeFilter)}`);
        } else {
          // Handle nested object filters
          qdrantFilter.must.push({
            [actualField]: condition
          });

          this.logger.debug(`Applied filter on ${actualField}: ${JSON.stringify(condition)}`);
        }
      } else {
        // Handle simple equality filters: true, false, string value
        // For Qdrant payload filters, use key-match structure for proper keyword matching
        if (typeof condition === 'boolean') {
          // Boolean values
          qdrantFilter.must.push({
            key: actualField,
            match: {
              value: condition
            }
          });
          this.logger.debug(`Applied boolean filter: ${actualField} = ${condition}`);
        } else {
          // String values - use value for exact matching
          qdrantFilter.must.push({
            key: actualField,
            match: {
              value: condition
            }
          });
          this.logger.debug(`Applied string filter: ${actualField} = ${condition}`);
        }
      }
    }

    // Return null if no filters were built
    if (qdrantFilter.must.length === 0) {
      this.logger.debug('No valid payload filters built');
      return null;
    }

    this.logger.log(`Applied custom Qdrant filters: ${JSON.stringify(qdrantFilter)}`);
    return qdrantFilter;
  }

  /**
   * Extract important keywords from text for hybrid search boosting
   * Returns an object with keywords categorized by type (attention mechanism)
   */
  private extractKeywords(text: string): {
    brands: string[];
    dimensions: string[];
    colors: string[];
    presentations: string[];
    models: string[];
    materials: string[];
    productCore: string[];  // NEW: Essential product type (desarmador, cincel, etc.)
    regular: string[];
  } {
    // NO hardcoded brands - we'll detect them dynamically during re-ranking
    // This is more flexible for a central de compras where brands are added daily
    const knownBrands = new Set<string>();

    // Known colors
    const knownColors = new Set([
      'rojo', 'roja', 'azul', 'verde', 'amarillo', 'amarilla', 'negro', 'negra',
      'blanco', 'blanca', 'gris', 'naranja', 'morado', 'morada', 'rosa',
      'cafe', 'café', 'beige', 'plateado', 'plateada', 'dorado', 'dorada',
      'transparente', 'translucido', 'translúcido', 'teja', 'crema'
    ]);

    // Known presentations
    const knownPresentations = new Set([
      'pieza', 'pza', 'juego', 'set', 'kit', 'caja', 'paquete', 'unidad',
      'litro', 'galon', 'galón', 'kilo', 'kg', 'gramo', 'metro', 'rollo',
      'bote', 'cuñete', 'tambor', 'saco', 'bolsa', 'par'
    ]);

    // Known materials
    const knownMaterials = new Set([
      'acero', 'hierro', 'aluminio', 'plastico', 'plástico', 'madera',
      'metal', 'cobre', 'bronce', 'inox', 'inoxidable', 'pvc', 'vinyl',
      'fibra', 'vidrio', 'ceramica', 'cerámica', 'goma', 'latex', 'látex'
    ]);

    // Known product cores (CRITICAL - defines what the user is actually searching for)
    // These are the essential product types that guide the search
    const knownProductCores = new Set([
      // Herramientas manuales
      'desarmador', 'destornillador', 'pinza', 'alicate', 'llave', 'dado',
      'martillo', 'mazo', 'cincel', 'formón', 'lima', 'sierra', 'serrucho',
      'cutter', 'tijera', 'tenaza', 'extractor', 'navaja', 'cortador',
      'nivel', 'escuadra', 'flexómetro', 'cinta métrica', 'metro',
      // Herramientas eléctricas
      'taladro', 'atornillador', 'esmeril', 'pulidora', 'lijadora', 'caladora',
      'rotomartillo', 'amoladora', 'compresor', 'pistola', 'soplete',
      'soldadora', 'generador', 'motobomba', 'hidrolavadora',
      // Ferretería
      'tornillo', 'tuerca', 'arandela', 'clavo', 'taquete', 'ancla', 'perno',
      'bisagra', 'cerradura', 'candado', 'chapa', 'manija', 'picaporte',
      'grapa', 'remache', 'pasador', 'rondana', 'prisionero',
      // Pinturas y acabados
      'pintura', 'barniz', 'esmalte', 'sellador', 'imprimante', 'impermeabilizante',
      'thinner', 'diluyente', 'removedor', 'laca', 'tinte', 'catalizador',
      'resina', 'epóxico', 'poliuretano',
      // Construcción
      'cemento', 'arena', 'grava', 'cal', 'yeso', 'pegamento', 'adhesivo',
      'mortero', 'concreto', 'tabique', 'block', 'ladrillo',
      'silicón', 'masilla', 'cinta', 'malla', 'varilla', 'alambrón',
      // Eléctricos
      'cable', 'alambre', 'interruptor', 'contacto', 'apagador', 'foco', 'lámpara',
      'socket', 'extensión', 'canaleta', 'tubo', 'conduit', 'chalupa',
      'switch', 'dimmer', 'timbre', 'fusible', 'breaker', 'tablilla',
      // Plomería
      'tuberia', 'codo', 'tee', 'reducción', 'válvula', 'registro',
      'manguera', 'conector', 'abrazadera', 'empaque', 'cople', 'niple',
      'llave', 'mezcladora', 'regadera', 'wc', 'lavabo', 'mingitorio',
      'tinaco', 'tanque', 'bomba', 'flotador', 'sello',
      // Accesorios y consumibles
      'broca', 'disco', 'hoja', 'punta', 'bit', 'mecha', 'copa', 'carbón',
      'lija', 'escobilla', 'cepillo', 'rodillo', 'brocha', 'espátula',
      'guante', 'lente', 'casco', 'careta', 'tapón', 'protector',
      // Jardinería
      'pala', 'rastrillo', 'azadón', 'pico', 'machete', 'podadora',
      'motosierra', 'desbrozadora', 'fumigadora', 'carretilla',
      // Automotriz
      'aceite', 'filtro', 'bujía', 'banda', 'batería', 'limpiador',
      'anticongelante', 'líquido', 'lubricante', 'grasa'
    ]);

    // Extract dimensions (e.g., "3/8", "10\"", "1/4")
    // Order matters: fractions with quotes first, then standalone quotes, then dimensions
    const dimensionPattern = /\d+\/\d+"?|\d+"|\d+\s*x\s*\d+|\d+mm|\d+cm/gi;
    const dimensions = (text.match(dimensionPattern) || [])
      .map(d => d.toLowerCase().replace(/\s/g, ''))
      .filter(d => d.length > 0); // Remove empty matches

    // Extract model numbers (alphanumeric codes like STHT69124, 60-100S, etc.)
    const modelPattern = /\b[A-Z]{2,}\d+[A-Z0-9-]*\b|\b\d+-\d+[A-Z]?\b/gi;
    const models = (text.match(modelPattern) || [])
      .map(m => m.toUpperCase())
      .filter(m => m.length >= 3); // At least 3 characters

    // Convert to lowercase and extract words
    // Keep words with 3+ characters OR 2-character alphanumeric words (brands like 3M, GE, HP)
    const words = text.toLowerCase()
      .replace(/[^\w\s/"-]/g, ' ')  // Keep / " - for dimensions
      .split(/\s+/)
      .filter(word => {
        if (word.length > 2) return true;
        // Keep 2-char words if they contain at least one letter and one number (e.g., "3m", "5s")
        // OR if they are all letters (e.g., "ge", "hp", "lg")
        if (word.length === 2) {
          const hasLetter = /[a-z]/i.test(word);
          const hasNumber = /\d/.test(word);
          return hasLetter; // Keep if it has at least one letter
        }
        return false; // Filter out 1-char words and 0-char words
      });

    // Remove common stop words
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'de', 'la', 'el', 'en', 'y', 'un', 'una', 'los', 'las', 'del', 'con',
      'this', 'that', 'here', 'product', 'image', 'type', 'visible', 'if',
      'be', 'include', 'includes', 'volume', 'brand', 'intended', 'use',
      'other', 'easy', 'apply', 'power', 'excellent'
    ]);

    // Categorize keywords
    const brands: string[] = [];
    const colors: string[] = [];
    const presentations: string[] = [];
    const materials: string[] = [];
    const productCore: string[] = [];  // NEW: Essential product type
    const regular: string[] = [];

    // Create a set of dimension-related substrings to filter out from regular keywords
    const dimensionSet = new Set(dimensions);
    const modelSet = new Set(models.map(m => m.toLowerCase()));

    words.forEach(word => {
      if (stopWords.has(word)) return;

      // Skip if word is a dimension, model or contains dimension patterns
      if (dimensionSet.has(word)) return;
      if (modelSet.has(word)) return;
      if (/^\d+["\/]/.test(word)) return; // Skip words starting with numbers and quotes/slashes
      if (/^\d+x/.test(word)) return; // Skip dimension-like patterns (e.g., "3/8x", "10x")

      // Categorize by type (attention mechanism - prioritize specific attributes)
      // HIGHEST PRIORITY: Product Core (what the user is actually searching for)
      if (knownProductCores.has(word)) {
        productCore.push(word);
      } else if (knownBrands.has(word)) {
        brands.push(word);
      } else if (knownColors.has(word)) {
        colors.push(word);
      } else if (knownPresentations.has(word)) {
        presentations.push(word);
      } else if (knownMaterials.has(word)) {
        materials.push(word);
      } else {
        regular.push(word);
      }
    });

    return { brands, dimensions, colors, presentations, models, materials, productCore, regular };
  }

  /**
   * Build attention-based query structure
   * Reorders query components to give prominence to critical attributes
   * This implements a lightweight attention mechanism inspired by "Attention Is All You Need"
   *
   * IMPORTANT: Brands are NOW EXCLUDED from embedding generation!
   * Brands are only used for re-ranking, not for vector search.
   * This ensures we find ALL relevant products regardless of brand.
   */
  private buildAttentionQuery(
    originalQuery: string,
    keywords: {
      brands: string[];
      dimensions: string[];
      colors: string[];
      presentations: string[];
      models: string[];
      materials: string[];
      productCore: string[];
      regular: string[];
    }
  ): string {
    const parts: string[] = [];

    // Priority 0: Product Core (ABSOLUTE HIGHEST - what the user is searching for)
    if (keywords.productCore.length > 0) {
      parts.push(`Producto: ${keywords.productCore.join(', ')}`);
    }

    // Priority 1: Brand - REMOVED! Brands are now only used for re-ranking, not for embedding
    // This prevents excluding products from other brands in vector search
    // Example: searching "lentes 3m" will now find TRUPER lenses too, then boost 3M in re-ranking

    // Priority 2: Model/Part Number
    if (keywords.models.length > 0) {
      parts.push(`Modelo: ${keywords.models.join(', ')}`);
    }

    // Priority 3: Dimensions (high attention for exact matching)
    if (keywords.dimensions.length > 0) {
      parts.push(`Medida: ${keywords.dimensions.join(' ')}`);
    }

    // Priority 4: Color (important for product differentiation)
    if (keywords.colors.length > 0) {
      parts.push(`Color: ${keywords.colors.join(', ')}`);
    }

    // Priority 5: Material
    if (keywords.materials.length > 0) {
      parts.push(`Material: ${keywords.materials.join(', ')}`);
    }

    // Priority 6: Presentation
    if (keywords.presentations.length > 0) {
      parts.push(`Presentación: ${keywords.presentations.join(', ')}`);
    }

    // Priority 7: General description (lower attention but provides context)
    // Filter out brand-like words from regular keywords to avoid them influencing the embedding
    const regularFiltered = keywords.regular.filter(word => {
      // Remove any word that appears in brands (from marca parameter)
      if (keywords.brands.some(brand => word.includes(brand.toLowerCase()) || brand.toLowerCase().includes(word))) {
        return false;
      }

      // Remove 2-3 character words that look like brand names (alphanumeric: 3m, ge, hp, lg, etc.)
      // These should only be used for re-ranking, not for vector search
      if (word.length >= 2 && word.length <= 3) {
        const hasLetter = /[a-z]/i.test(word);
        const hasNumber = /\d/.test(word);
        // If it has both letters and numbers, it's likely a brand (3m, 5s, etc.)
        // OR if it's all uppercase letters (GE, HP, LG) - but we're in lowercase, so check all letters
        if ((hasLetter && hasNumber) || (hasLetter && word.length === 2)) {
          this.logger.debug(`Excluding brand-like word from embedding: "${word}"`);
          return false;
        }
      }

      return true;
    });

    if (regularFiltered.length > 0) {
      parts.push(`Descripción: ${regularFiltered.join(' ')}`);
    }

    // If we extracted structured attributes, use them; otherwise fall back to original
    if (parts.length > 0) {
      const structuredQuery = parts.join(' | ');
      this.logger.debug(`Attention query (brands excluded): ${structuredQuery}`);
      return structuredQuery;
    }

    return originalQuery;
  }

  /**
   * @deprecated NO LONGER USED - Boost has been removed from search flow
   *
   * The boost logic distorted scores (saturating to 1.0) and conflicted with RTI rerank.
   * Now we trust Qdrant's pure vectorial scores and use RTI for reranking when LLM is enabled.
   *
   * This method is kept for reference but should be removed in a future cleanup.
   *
   * Re-rank results by boosting exact keyword matches with weighted priorities
   * and commercial factors (stock, sales, recency)
   */
  private reRankResults(results: any[], keywords: { brands: string[], dimensions: string[], colors: string[], presentations: string[], models: string[], materials: string[], productCore: string[], regular: string[] }): any[] {
    const rankedResults = results.map(result => {
      let adjustedScore = result.score;

      // Get all text content from payload
      const payloadText = Object.values(result.payload)
        .filter(val => typeof val === 'string')
        .join(' ')
        .toLowerCase();

      // Get brand field specifically (marca in Spanish) - usando mapeo de campos
      const brandField = getPayloadField(result.payload, 'marca', '').toLowerCase();
      const descriptionField = getPayloadField(result.payload, 'descripcion', '').toLowerCase();

      // === KEYWORD MATCHING ===
      let productCoreMatches = 0;
      let brandMatches = 0;
      let brandMismatches = 0;
      let dimensionMatches = 0;
      let regularMatches = 0;

      // Check product core matches (ABSOLUTE HIGHEST PRIORITY)
      // This determines if the product is even in the right category
      keywords.productCore.forEach(core => {
        // Check with word boundaries to avoid partial matches
        const coreRegex = new RegExp(`\\b${core}`, 'i');
        if (coreRegex.test(descriptionField)) {
          productCoreMatches++;
        }
      });

      // DYNAMIC BRAND DETECTION - but ONLY use for soft boosting, not filtering
      // When marca filter is explicitly provided (marca parameter), apply strong boost/penalty
      // When marca is just mentioned in query text, DON'T apply brand filtering at all
      // This prevents excluding valid results when user searches "lentes 3m" but TRUPER lenses also match
      const queryWords = keywords.regular.concat(keywords.brands);
      queryWords.forEach(word => {
        // Check if this word appears in the brand field (flexible matching)
        if (brandField && brandField.includes(word.toLowerCase())) {
          brandMatches++;
        }
      });

      // ONLY penalize brand mismatches if marca filter was explicitly provided via parameter
      // (marca parameter will be in keywords.brands after line 38 adds it)
      // If marca is just in the query text, DON'T penalize other brands
      // This is handled by checking if keywords.brands is non-empty
      keywords.brands.forEach(brand => {
        if (brandField && !brandField.includes(brand)) {
          // If user explicitly specified a brand filter but this product doesn't match, penalize
          brandMismatches++;
        }
      });

      // Check dimension matches (HIGH PRIORITY)
      // Use strict matching with word boundaries to avoid partial matches
      keywords.dimensions.forEach(dimension => {
        // Escape special regex characters but keep the dimension structure
        const escapedDim = dimension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Create regex that matches the dimension with word boundaries or spaces
        // This prevents "10" from matching "100" or "102"
        const dimRegex = new RegExp(`(?:^|\\s|x)${escapedDim}(?:\\s|x|$|")`, 'i');

        if (dimRegex.test(descriptionField)) {
          dimensionMatches++;
        }
      });

      // Check regular keyword matches
      keywords.regular.forEach(keyword => {
        const exactRegex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (exactRegex.test(payloadText)) {
          regularMatches++;
        }
      });

      // === COMMERCIAL FACTORS ===
      let stockBoost = 0;
      let priceListBoost = 0;
      let salesBoost = 0;
      let recencyBoost = 0;

      // 1. Stock availability boost (heavily reduced to prioritize precision)
      const stockValue = getPayloadField(result.payload, 'en_stock', false);
      const inStock = stockValue === true || stockValue === 'true' || stockValue === 'S' || stockValue === 'Si' || stockValue === 'SI';
      if (inStock) {
        stockBoost = 0.04; // +4% for in-stock items (reduced from 6%)
      }

      // 2. Active product boost (has price list)
      const priceValue = getPayloadField(result.payload, 'precio_lista', 0);
      const hasPriceList = priceValue > 0 || priceValue === true || priceValue === 'true';
      if (hasPriceList) {
        priceListBoost = 0.02; // +2% for active products (reduced from 3%)
      }

      // 3. Sales volume boost (ventas_3_anios) - heavily reduced
      const salesValue = getPayloadField(result.payload, 'ventas_3_anios', 0);
      const sales = parseInt(String(salesValue)) || 0;
      if (sales >= 50) {
        salesBoost = 0.03; // +3% for very popular items (reduced from 4%)
      } else if (sales >= 20) {
        salesBoost = 0.02; // +2% for popular items
      } else if (sales >= 10) {
        salesBoost = 0.015; // +1.5% for moderately popular
      } else if (sales >= 5) {
        salesBoost = 0.01; // +1% for low sales
      } else if (sales >= 1) {
        salesBoost = 0.005; // +0.5% for very low sales
      }

      // 4. Recency boost (fecha_ultima_venta) - heavily reduced
      const lastSaleDate = getPayloadField(result.payload, 'fecha_ultima_venta', null);
      if (lastSaleDate) {
        try {
          const lastSale = new Date(lastSaleDate);
          const now = new Date();
          const daysSinceLastSale = Math.floor((now.getTime() - lastSale.getTime()) / (1000 * 60 * 60 * 24));

          if (daysSinceLastSale <= 30) {
            recencyBoost = 0.02; // +2% for very recent sales (<30 days, reduced from 3%)
          } else if (daysSinceLastSale <= 90) {
            recencyBoost = 0.015; // +1.5% for recent sales (<90 days)
          } else if (daysSinceLastSale <= 180) {
            recencyBoost = 0.01; // +1% for moderately recent (<180 days)
          }
        } catch (e) {
          // Invalid date, skip recency boost
        }
      }

      // Calculate total boost
      // STRATEGY: Embeddings already handle semantic similarity well
      // Boost should only help with: exact dimensions, brand preference, commercial factors
      // AVOID boosting on generic terms like "LLAVE MIXTA" - embeddings already capture that
      let boost = 1.0;

      // Product Core matching - SOFT boost, not huge
      // Embeddings already rank similar products high, we just add slight preference
      if (keywords.productCore.length > 0) {
        if (productCoreMatches > 0) {
          // Small boost for category match - embeddings already handle this
          boost += 0.05;  // +5% flat for being in right category
        } else {
          // Penalty if product core specified but doesn't match
          boost *= 0.60;  // Reduce to 60% of original (40% penalty)
        }
      }

      // DIMENSION MATCHING - THE KEY DIFFERENTIATOR
      // This is critical for RTI: 13MM ≠ 25MM even though both are "LLAVE MIXTA"
      if (keywords.dimensions.length > 0) {
        if (dimensionMatches > 0) {
          boost += dimensionMatches * 0.20;  // +20% per dimension match (HIGH PRIORITY!)
        } else {
          // Penalty for wrong dimension - this is what distinguishes SUSTITUTO_VALIDO from MISMA_CATEGORIA
          boost *= 0.70;  // Reduce to 70% if dimension doesn't match
        }
      }

      // Brand matching - important when specified
      boost += brandMatches * 0.10;        // +10% per brand match
      boost -= brandMismatches * 0.10;     // -10% per brand mismatch
      boost += regularMatches * 0.02;      // +2% per regular keyword match
      boost += stockBoost;                 // +4% if in stock
      boost += priceListBoost;             // +2% if active product
      boost += salesBoost;                 // +1-3% based on sales volume
      boost += recencyBoost;               // +1-2% based on recency

      adjustedScore = result.score * boost;

      // Cap at 1.0 to maintain score range
      adjustedScore = Math.min(adjustedScore, 1.0);

      // Ensure minimum score doesn't go below 0
      adjustedScore = Math.max(adjustedScore, 0);

      this.logger.debug(
        `Result ${result.id}: original=${result.score.toFixed(4)}, ` +
        `productCore=${productCoreMatches}, brand=${brandMatches}/-${brandMismatches}, ` +
        `dim=${dimensionMatches}, reg=${regularMatches}, stock=${inStock}, ` +
        `list=${hasPriceList}, sales=${sales}, adjusted=${adjustedScore.toFixed(4)}`
      );

      return {
        ...result,
        score: adjustedScore,
        _originalScore: result.score,
        _productCoreMatches: productCoreMatches,
        _brandMatches: brandMatches,
        _brandMismatches: brandMismatches,
        _dimensionMatches: dimensionMatches,
        _regularMatches: regularMatches,
        _stockBoost: stockBoost,
        _priceListBoost: priceListBoost,
        _salesBoost: salesBoost,
        _recencyBoost: recencyBoost,
      };
    });

    // Sort by adjusted score (descending)
    return rankedResults.sort((a, b) => b.score - a.score);
  }

  async searchByImage(
    imageBuffer: Buffer,
    mimeType: string,
    collectionName: string,
    limit: number = 10,
    useLLMFilter: boolean = false,
    minRelevancia?: number,
  ): Promise<any> {
    // Dynamic minRelevancia based on LLM filter (same as text search)
    const effectiveMinRelevancia = minRelevancia !== undefined
      ? minRelevancia
      : useLLMFilter
        ? 0.65  // With LLM: lower threshold
        : 0.70; // Without LLM: higher threshold

    this.logger.log(`Searching by image in collection: ${collectionName} | LLM Filter: ${useLLMFilter ? 'ON' : 'OFF'} | minRelevancia: ${effectiveMinRelevancia}`);

    const startTime = Date.now();

    try {
      // Step 1: Extract text from image using Gemini Vision
      this.logger.debug('Extracting text from image with Gemini Vision...');
      const extractedText = await this.geminiService.extractTextFromImage(imageBuffer, mimeType);
      this.logger.debug(`Extracted text: ${extractedText.substring(0, 100)}...`);

      // Step 2: Generate embedding directly from extracted text
      this.logger.debug('Generating embedding from extracted text...');
      const embedding = await this.geminiService.generateEmbedding(extractedText);

      // Step 3: Search in Qdrant - fetch more candidates if using LLM filter
      const fetchLimit = useLLMFilter ? limit * 2 : limit;
      this.logger.debug(`Searching in Qdrant collection: ${collectionName} (limit: ${fetchLimit})`);
      const searchResults = await this.qdrantService.search(collectionName, embedding, fetchLimit, null);

      // Step 4: Apply LLM filter or vectorial filter
      let finalResults: any[];

      if (useLLMFilter && searchResults.length > 0) {
        // LLM Filter: Evaluate candidates with RTI
        this.logger.log(`LLM Filter ENABLED - Evaluating ${searchResults.length} candidates with RTI...`);

        const candidates = searchResults.map((result) => ({
          id: result.id,
          score_vectorial: result.score,
          payload: result.payload,
          descripcion: result.payload?.descripcion || result.payload?.Articulo_Descripcion || '',
        }));

        // Evaluate with RTI using filterSearchResults
        const rtiResults = await this.geminiService.filterSearchResults(
          extractedText,
          candidates.map((c) => ({
            id: String(c.id),
            descripcion: c.descripcion,
            score: c.score_vectorial,
          })),
        );

        // Merge RTI results with candidates
        finalResults = candidates.map((candidate) => {
          const rti = rtiResults.find((r) => r.id === String(candidate.id));
          return {
            id: candidate.id,
            score: rti?.score_rti || candidate.score_vectorial,
            score_vectorial: candidate.score_vectorial,
            payload: candidate.payload,
            rti: rti ? {
              score_rti: rti.score_rti,
              categoria_rti: rti.categoria_rti,
              evaluado_por: 'gemini-rti',
              razon: rti.reason,
            } : undefined,
          };
        });

        // Filter by minRelevancia and sort by RTI score
        finalResults = finalResults
          .filter((r) => r.score >= effectiveMinRelevancia)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);

        this.logger.log(`After RTI filter (≥${effectiveMinRelevancia}): ${finalResults.length} results`);
      } else {
        // No LLM: use vectorial scores with minRelevancia filter
        this.logger.log(`LLM Filter DISABLED - using vectorial scores`);

        finalResults = searchResults
          .filter((r) => r.score >= effectiveMinRelevancia)
          .slice(0, limit)
          .map((result) => {
            const inferred = inferRtiFromScore(result.score);
            return {
              id: result.id,
              score: result.score,
              score_vectorial: result.score,
              payload: result.payload,
              rti: {
                score_rti: inferred.score_rti,
                categoria_rti: inferred.categoria,
                evaluado_por: 'vectorial-inference',
                razon: 'Inferido desde score de similitud vectorial',
              },
            };
          });

        this.logger.log(`After vectorial filter (≥${effectiveMinRelevancia}): ${finalResults.length} results`);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      this.logger.log(`Image search completed in ${duration}ms, found ${finalResults.length} results`);

      return {
        extractedText,
        duration: `${duration}ms`,
        useLLMFilter,
        minRelevancia: effectiveMinRelevancia,
        results: finalResults,
      };
    } catch (error) {
      this.logger.error(`Image search failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Enrich search results with client purchase data
   * Queries the sales database to find if the client has purchased each product
   */
  private async enrichWithClientData(
    results: any[],
    codigoCliente: string,
    collectionName: string,
  ): Promise<any[]> {
    if (results.length === 0) {
      return results;
    }

    try {
      // Get datasource for this collection
      const qdrantCollection = await this.qdrantService.getCollectionMetadata(collectionName);
      if (!qdrantCollection || !qdrantCollection.datasourceId) {
        this.logger.warn(`No datasource found for collection: ${collectionName}, skipping client enrichment`);
        return results;
      }

      // Extract product codes from results
      const productCodes = results
        .map(r => r.payload?.id || r.id)
        .filter(Boolean);

      if (productCodes.length === 0) {
        this.logger.warn('No product codes found in results');
        return results;
      }

      // Build SQL query to get purchase data for all products at once
      const codesPlaceholder = productCodes.map(code => `'${code}'`).join(', ');
      const salesQuery = `
        SELECT
          AL2_CODART AS Codigo_Producto,
          COUNT(*) AS Cantidad_Ventas,
          MIN(AL2_FCHDOC) AS Primera_Venta,
          MAX(AL2_FCHDOC) AS Ultima_Venta
        FROM Desarrollo.dbo.Al2000 WITH(NOLOCK)
        WHERE AL2_TIPDOC = 'GR'
          AND AL2_TIPCLIPRO = 'C'
          AND AL2_CLIPRO = '${codigoCliente}'
          AND AL2_ESTREG = 'A'
          AND AL2_CODART IN (${codesPlaceholder})
        GROUP BY AL2_CODART
      `;

      this.logger.debug(`Executing client sales query for ${productCodes.length} products`);

      // Execute query using the datasource
      const salesData = await this.datasourcesService.executeCustomQuery(
        qdrantCollection.datasourceId,
        salesQuery,
      );

      // Create a map for quick lookup
      const salesMap = new Map();
      salesData.forEach((row: any) => {
        salesMap.set(row.Codigo_Producto, {
          vendido_a_cliente: true,
          cantidad_ventas_cliente: row.Cantidad_Ventas,
          primera_venta_cliente: row.Primera_Venta,
          ultima_venta_cliente: row.Ultima_Venta,
        });
      });

      // Enrich results with client data
      return results.map(result => {
        const productCode = result.payload?.id || result.id;
        const clientData = salesMap.get(productCode);

        return {
          ...result,
          _vendido_a_cliente: clientData?.vendido_a_cliente || false,
          _cantidad_ventas_cliente: clientData?.cantidad_ventas_cliente || 0,
          _primera_venta_cliente: clientData?.primera_venta_cliente || null,
          _ultima_venta_cliente: clientData?.ultima_venta_cliente || null,
        };
      });
    } catch (error) {
      this.logger.error(`Failed to enrich with client data: ${error.message}`, error.stack);
      // Return original results if enrichment fails
      return results;
    }
  }

  /**
   * Search by text across multiple collections and combine results
   * NOTE: Internet search functionality removed for security reasons
   */
  async searchByTextMultipleCollections(
    query: string,
    collectionNames: string[],
    limit: number = 3, // Default reduced to 3 for precision-focused results
    marca?: string,
    cliente?: string,
    _includeInternetSearch: boolean = false, // DEPRECATED: Parameter kept for API compatibility, always ignored
    useLLMFilter: boolean = false,
    payloadFilters?: { [key: string]: any },
    minRelevancia?: number, // Dynamic default based on useLLMFilter
  ): Promise<any> {
    // Dynamic threshold logic:
    // - If user specifies minRelevancia explicitly, use that value
    // - If useLLMFilter=true: use 0.65 (LLM filters noise, lower threshold OK)
    // - If useLLMFilter=false: use 0.70 (higher threshold compensates for no LLM filtering)
    const effectiveMinRelevancia = minRelevancia !== undefined
      ? minRelevancia
      : useLLMFilter
        ? 0.65  // With LLM: lower threshold, LLM will filter noise
        : 0.70; // Without LLM: higher threshold to reduce noise (filters irrelevant results like 68%)

    this.logger.log(`Searching by text in ${collectionNames.length} collections: ${collectionNames.join(', ')} | LLM Filter: ${useLLMFilter ? 'ON' : 'OFF'} | minRelevancia: ${effectiveMinRelevancia}${minRelevancia === undefined ? ' (auto)' : ''}`);

    const startTime = Date.now();
    const allResults: any[] = [];
    const collectionStats: any[] = [];
    let marcaFallbackApplied = false;
    let marcaFallbackMessage = '';
    let marcaAutocorrected = false;
    let marcaOriginal = '';
    let marcaCorrectedTo = '';
    let marcaAutocorrectMessage = '';

    // Accumulate costs from all collection searches
    let aggregatedCost: SearchCostTracking | null = null;

    try {
      // Search in each collection in parallel
      const searchPromises = collectionNames.map(async (collectionName) => {
        try {
          this.logger.debug(`Searching in collection: ${collectionName}`);
          const result = await this.searchByText(query, collectionName, limit, marca, cliente, useLLMFilter, payloadFilters, effectiveMinRelevancia);

          // Capture marca autocorrection status (use first autocorrection)
          if (result.marca_autocorrected && !marcaAutocorrected) {
            marcaAutocorrected = true;
            marcaOriginal = result.marca_original;
            marcaCorrectedTo = result.marca;
            marcaAutocorrectMessage = result.marca_autocorrect_message;
          }

          // Capture marca fallback status from any collection (use first fallback message)
          if (result.marca_fallback && !marcaFallbackApplied) {
            marcaFallbackApplied = true;
            marcaFallbackMessage = result.marca_fallback_message;
          }

          // Capture and aggregate costs from each collection search
          if (result.cost) {
            if (!aggregatedCost) {
              aggregatedCost = result.cost;
            } else {
              // Add costs from this collection to the aggregate
              aggregatedCost.embedding.inputTokens += result.cost.embedding.inputTokens;
              aggregatedCost.embedding.outputTokens += result.cost.embedding.outputTokens;
              aggregatedCost.embedding.inputCostUsd += result.cost.embedding.inputCostUsd;
              aggregatedCost.embedding.outputCostUsd += result.cost.embedding.outputCostUsd;
              aggregatedCost.embedding.totalCostUsd += result.cost.embedding.totalCostUsd;

              if (result.cost.llmFilter && aggregatedCost.llmFilter) {
                aggregatedCost.llmFilter.inputTokens += result.cost.llmFilter.inputTokens;
                aggregatedCost.llmFilter.outputTokens += result.cost.llmFilter.outputTokens;
                aggregatedCost.llmFilter.inputCostUsd += result.cost.llmFilter.inputCostUsd;
                aggregatedCost.llmFilter.outputCostUsd += result.cost.llmFilter.outputCostUsd;
                aggregatedCost.llmFilter.totalCostUsd += result.cost.llmFilter.totalCostUsd;
              } else if (result.cost.llmFilter) {
                aggregatedCost.llmFilter = { ...result.cost.llmFilter };
              }

              aggregatedCost.totalCostUsd += result.cost.totalCostUsd;
              aggregatedCost.totalTokens += result.cost.totalTokens;
            }
          }

          // Add collection name to each result
          const resultsWithCollection = result.results.map((r: any) => ({
            ...r,
            collection: collectionName,
          }));

          collectionStats.push({
            collection: collectionName,
            results_count: resultsWithCollection.length,
            ...(result.marca_fallback && { marca_fallback: true }),
          });

          return resultsWithCollection;
        } catch (error) {
          this.logger.error(`Failed to search in collection ${collectionName}: ${error.message}`);
          collectionStats.push({
            collection: collectionName,
            error: error.message,
            results_count: 0,
          });
          return [];
        }
      });

      // Wait for all searches to complete
      const searchResults = await Promise.all(searchPromises);

      // Flatten all results into a single array
      searchResults.forEach(results => {
        allResults.push(...results);
      });

      // Sort all results by score (descending)
      allResults.sort((a, b) => b.score - a.score);

      // Filter by minRelevancia threshold (RTI score)
      const relevantResults = allResults.filter(r => r.score >= effectiveMinRelevancia);
      const filteredCount = allResults.length - relevantResults.length;
      if (filteredCount > 0) {
        this.logger.log(`Filtered out ${filteredCount} results below minRelevancia threshold (${effectiveMinRelevancia})`);
      }

      // Trim to requested limit
      const finalResults = relevantResults.slice(0, limit);

      // SECURITY: Internet search removed - was causing firewall alerts
      // due to Google Search Grounding visiting external URLs

      const endTime = Date.now();
      const duration = endTime - startTime;

      this.logger.log(
        `Multi-collection search completed in ${duration}ms, ` +
        `found ${allResults.length} total results across ${collectionNames.length} collections, ` +
        `returning top ${finalResults.length}`
      );

      return {
        query,
        marca: marcaAutocorrected ? marcaCorrectedTo : marca, // Return corrected marca
        ...(marcaAutocorrected ? {
          marca_original: marcaOriginal,
          marca_autocorrected: true as const,
          marca_autocorrect_message: marcaAutocorrectMessage,
        } : {}),
        cliente,
        collections: collectionNames,
        minRelevancia: effectiveMinRelevancia,
        minRelevancia_auto: minRelevancia === undefined,
        // Indicate if hybrid fallback was applied (marca filter relaxed due to 0 results)
        ...(marcaFallbackApplied ? {
          marca_fallback: true as const,
          marca_fallback_message: marcaFallbackMessage,
        } : {}),
        duration: `${duration}ms`,
        total_results: allResults.length,
        filtered_by_relevancia: filteredCount,
        collection_stats: collectionStats,
        // Cost tracking - aggregated from all collection searches
        cost: aggregatedCost,
        results: finalResults,
      };
    } catch (error) {
      this.logger.error(`Multi-collection search failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  async recommend(
    collectionName: string,
    positiveIds: string[],
    negativeIds: string[] = [],
    limit: number = 10,
  ): Promise<any> {
    this.logger.log(`Recommending similar products in collection: ${collectionName}`);
    this.logger.debug(`Positive IDs: [${positiveIds.join(', ')}]`);
    if (negativeIds.length > 0) {
      this.logger.debug(`Negative IDs: [${negativeIds.join(', ')}]`);
    }

    const startTime = Date.now();

    try {
      // Call Qdrant's recommend API
      const results = await this.qdrantService.recommend(
        collectionName,
        positiveIds,
        negativeIds,
        limit,
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      this.logger.log(`Recommend completed in ${duration}ms, found ${results.length} results`);

      return {
        positiveIds,
        negativeIds,
        duration: `${duration}ms`,
        results: results.map((result) => ({
          id: result.id,
          score: result.score,
          payload: result.payload,
        })),
      };
    } catch (error) {
      this.logger.error(`Recommend failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  // SECURITY: searchInternetStream() removed - was causing firewall alerts
  // due to Google Search Grounding visiting external URLs

  /**
   * Get raw vectorial search results without LLM filtering
   * This is useful for debugging and understanding what the vector search actually finds
   */
  async getRawVectorialResults(
    query: string,
    collections: string[],
    limit: number = 20,
  ): Promise<any> {
    this.logger.log(`Getting raw vectorial results for query: "${query}"`);
    this.logger.log(`Collections: ${collections.join(', ')}`);

    try {
      // Generate embedding
      const startEmbedding = Date.now();
      const embedding = await this.geminiService.generateEmbedding(query);
      const embeddingDuration = Date.now() - startEmbedding;

      this.logger.log(`Embedding generated in ${embeddingDuration}ms`);

      const results = [];

      // Search each collection
      for (const collectionName of collections) {
        this.logger.log(`Searching collection: ${collectionName}`);

        const startSearch = Date.now();
        const searchResults = await this.qdrantService.search(
          collectionName,
          embedding,
          limit,
        );
        const searchDuration = Date.now() - startSearch;

        this.logger.log(`Found ${searchResults.length} results in ${collectionName} (${searchDuration}ms)`);

        // Add collection name to each result
        const resultsWithCollection = searchResults.map(result => ({
          ...result,
          collection: collectionName,
        }));

        results.push(...resultsWithCollection);
      }

      // Sort all results by score
      results.sort((a, b) => b.score - a.score);

      // Take only top 'limit' results
      const topResults = results.slice(0, limit);

      this.logger.log(`Returning top ${topResults.length} raw vectorial results`);

      return {
        query,
        collections,
        totalResults: topResults.length,
        results: topResults,
        embeddingDuration: `${embeddingDuration}ms`,
      };

    } catch (error) {
      this.logger.error(`Error getting raw vectorial results: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Score candidate products against a query using embeddings + cosine similarity
   * Used to validate/filter results from external search systems (e.g., ERP keyword search)
   *
   * This endpoint is optimized for speed:
   * - No LLM calls ($0 cost, ~100ms response time)
   * - Uses existing embeddings from Qdrant (no embedding generation for candidates)
   * - Only generates one embedding for the query
   *
   * @param query - The search query text
   * @param collectionName - Qdrant collection containing the candidates
   * @param candidateIds - Array of product IDs (codigo_original) to score (max 50)
   * @returns Array of { id, score } sorted by score descending
   */
  async scoreCandidates(
    query: string,
    collectionName: string,
    candidateIds: string[],
  ): Promise<{ results: Array<{ id: string; score: number }>; duration: string }> {
    const startTime = Date.now();
    this.logger.log(`Scoring ${candidateIds.length} candidates against query: "${query}"`);

    try {
      // Step 1: Generate embedding for the query
      const queryEmbedding = await this.geminiService.generateEmbedding(query);

      // Step 2: Convert candidate IDs to Qdrant UUIDs and retrieve with vectors
      const uuidIds = candidateIds.map(id => uuidv5(id, PRODUCT_CODE_NAMESPACE));
      const candidates = await this.qdrantService.getPointsByIdsWithVectors(
        collectionName,
        uuidIds,
      );

      if (candidates.length === 0) {
        this.logger.warn(`No candidates found in collection ${collectionName}`);
        return {
          results: [],
          duration: `${Date.now() - startTime}ms`,
        };
      }

      // Step 3: Calculate cosine similarity for each candidate
      const scoredResults = candidates.map((candidate) => {
        const score = this.cosineSimilarity(queryEmbedding, candidate.vector);
        return {
          id: candidate.payload?._original_id || candidate.payload?.id || candidate.id,
          score: parseFloat(score.toFixed(4)),
        };
      });

      // Step 4: Sort by score descending
      scoredResults.sort((a, b) => b.score - a.score);

      const duration = `${Date.now() - startTime}ms`;
      this.logger.log(`Scored ${scoredResults.length} candidates in ${duration}`);

      return {
        results: scoredResults,
        duration,
      };
    } catch (error) {
      this.logger.error(`Failed to score candidates: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  // SECURITY: getSearchCompletionMessage() removed - was only used by searchInternetStream()
}
