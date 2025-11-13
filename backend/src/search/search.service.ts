import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { GeminiEmbeddingService } from '../embeddings/gemini-embedding.service';
import { QdrantService } from '../qdrant/qdrant.service';
import { DatasourcesService } from '../datasources/datasources.service';
import { Observable } from 'rxjs';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly geminiService: GeminiEmbeddingService,
    private readonly qdrantService: QdrantService,
    private readonly datasourcesService: DatasourcesService,
  ) {}

  async searchByText(
    query: string,
    collectionName: string,
    limit: number = 10,
    marca?: string,
    cliente?: string,
    useLLMFilter: boolean = false,
    payloadFilters?: { [key: string]: any },
  ): Promise<any> {
    this.logger.log(`Searching by text in collection: ${collectionName}`);
    this.logger.debug(`Query: ${query}${marca ? `, Marca: ${marca}` : ''}${cliente ? `, Cliente: ${cliente}` : ''}${payloadFilters ? `, Payload Filters: ${JSON.stringify(payloadFilters)}` : ''} | LLM Filter: ${useLLMFilter ? 'ON' : 'OFF'}`);

    const startTime = Date.now();

    try {
      // Step 1: Convert marca parameter to payload filter for hard filtering
      if (marca && (!payloadFilters || !payloadFilters['marca'])) {
        payloadFilters = payloadFilters || {};
        payloadFilters['marca'] = marca;
        this.logger.log(`Converting marca parameter to payload filter: ${marca}`);
      }

      // Step 2: Extract keywords from query for hybrid boosting (attention mechanism)
      // If marca filter is provided, append to query for better semantic search
      let enhancedQuery = query;
      const keywords = this.extractKeywords(query);

      if (marca) {
        enhancedQuery = `${query} ${marca}`;
        keywords.brands = [marca.toLowerCase()];
        this.logger.log(`Brand filter applied: ${marca}, enhanced query: "${enhancedQuery}"`);
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

      // Step 5: Generate embedding from attention-structured query
      this.logger.debug('Generating embedding from attention query...');
      const embedding = await this.geminiService.generateEmbedding(attentionQuery);

      // Step 7: Search in Qdrant with filters (hybrid search)
      // If no filters, fetch more results for re-ranking (3x instead of 2x)
      // If marca or cliente filter is active, multiply by 10x to ensure enough results after filtering
      const FILTER_MULTIPLIER = 10;
      let searchLimit = qdrantFilter === null ? Math.max(limit * 3, 20) : Math.max(limit * 2, 15);

      // Expand search when either marca or cliente filter is active
      if (marca || cliente) {
        searchLimit = limit * FILTER_MULTIPLIER;
        const activeFilters = [marca ? 'marca' : null, cliente ? 'cliente' : null].filter(Boolean).join(' + ');
        this.logger.log(`Filter active (${activeFilters}), expanding search to ${searchLimit} results (${FILTER_MULTIPLIER}x multiplier)`);
      }

      this.logger.debug(`Searching in Qdrant collection: ${collectionName} (limit: ${searchLimit})${qdrantFilter ? ' with filters' : ' without filters'}`);
      const searchResults = await this.qdrantService.search(collectionName, embedding, searchLimit, qdrantFilter);

      // Step 8: Re-rank results using hybrid scoring
      this.logger.debug('Re-ranking results with keyword boosting...');
      const reRankedResults = this.reRankResults(searchResults, keywords);

      // Step 9: LLM Semantic Filter - OPTIONAL (disabled by default to trust embeddings)
      let semanticallyFiltered: any[];

      if (useLLMFilter) {
        this.logger.log('LLM Filter ENABLED - Applying semantic filter...');
        const llmFilterStart = Date.now();

        // Prepare products for LLM evaluation (take more candidates when filters are active)
        // Use larger candidate pool when marca or cliente filter is active to ensure proper filtering
        const llmCandidateCount = (marca || cliente) ? 100 : 20;
        const candidatesForLLM = reRankedResults.slice(0, llmCandidateCount);
        const productsForLLM = candidatesForLLM.map(r => ({
          id: String(r.payload?.id || r.id),
          descripcion: r.payload?.descripcion || '',
          marca: r.payload?.marca || '',
          categoria: r.payload?.categoria || '',
          score: r.score,
        }));

        // Use enhanced query (includes marca if present) for LLM evaluation
        const llmResults = await this.geminiService.filterSearchResults(enhancedQuery, productsForLLM);
        const llmFilterDuration = Date.now() - llmFilterStart;
        this.logger.log(`LLM filter completed in ${llmFilterDuration}ms`);

        // Create a map of LLM evaluations
        const llmEvaluationMap = new Map(llmResults.map(r => [r.id, r]));

        // Filter and re-score based on LLM evaluation
        semanticallyFiltered = reRankedResults
          .map(result => {
            const resultId = String(result.payload?.id || result.id);
            const llmEval = llmEvaluationMap.get(resultId);

            if (!llmEval) {
              // If not evaluated by LLM (beyond top candidates), keep with original score
              return result;
            }

            // Add LLM metadata to result
            return {
              ...result,
              _llm_match: llmEval.match,
              _llm_confidence: llmEval.confidence,
              _llm_reason: llmEval.reason,
              score: llmEval.adjustedScore,
            };
          })
          // Filter out non-matches
          .filter(r => {
            // If LLM evaluated it, only keep matches
            if (r._llm_match !== undefined) {
              return r._llm_match === true;
            }
            // Keep results that weren't evaluated
            return true;
          })
          // Re-sort by adjusted score
          .sort((a, b) => b.score - a.score);

        this.logger.log(`After LLM filter: ${semanticallyFiltered.length} relevant results`);
      } else {
        // LLM filter DISABLED - trust embeddings directly
        this.logger.log('LLM Filter DISABLED - trusting embedding similarity scores');
        semanticallyFiltered = reRankedResults;
      }

      // Step 10: Trim to requested limit (or keep all if cliente filter will be applied)
      let finalResults = cliente ? semanticallyFiltered : semanticallyFiltered.slice(0, limit);

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
        marca,
        cliente,
        duration: `${duration}ms`,
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
        results: finalResults.map((result) => ({
          id: result.id,
          score: result.score,
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
        })),
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

      // Get brand field specifically (marca in Spanish)
      const brandField = (result.payload.marca || '').toLowerCase();
      const descriptionField = (result.payload.descripcion || result.payload.description || '').toLowerCase();

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
      const inStock = result.payload.en_stock === true || result.payload.en_stock === 'true';
      if (inStock) {
        stockBoost = 0.04; // +4% for in-stock items (reduced from 6%)
      }

      // 2. Active product boost (has price list)
      const hasPriceList = result.payload.precio_lista === true || result.payload.precio_lista === 'true';
      if (hasPriceList) {
        priceListBoost = 0.02; // +2% for active products (reduced from 3%)
      }

      // 3. Sales volume boost (ventas_3_anios) - heavily reduced
      const sales = parseInt(result.payload.ventas_3_anios || '0') || 0;
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
      const lastSaleDate = result.payload.fecha_ultima_venta;
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
      // Product Core matching is ABSOLUTE PRIORITY - massive boost/penalty
      // Keyword matching weights: productCore (0.30 HUGE!), brand (0.25 CRITICAL!), dimension (0.08), regular (0.02)
      // Commercial weights: stock (0.04), price list (0.02), sales (0.03 max), recency (0.02 max)
      let boost = 1.0;

      // CRITICAL: Product Core - defines if product is in right category
      if (keywords.productCore.length > 0) {
        if (productCoreMatches > 0) {
          boost += productCoreMatches * 0.30;  // +30% per product core match (MASSIVE!)
        } else {
          // HUGE penalty if product core specified but doesn't match
          boost *= 0.40;  // Reduce to 40% of original (60% penalty)
        }
      }

      // CRITICAL: Brand match - when user specifies a brand, it's very important
      // Increased from +5% to +25% to ensure branded products rank higher
      boost += brandMatches * 0.25;        // +25% per brand match (CRITICAL for central de compras!)
      boost -= brandMismatches * 0.15;     // -15% per brand mismatch
      boost += dimensionMatches * 0.08;    // +8% per dimension match
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
  ): Promise<any> {
    this.logger.log(`Searching by image in collection: ${collectionName}`);

    const startTime = Date.now();

    try {
      // Step 1: Extract text from image using Gemini Vision
      this.logger.debug('Extracting text from image with Gemini Vision...');
      const extractedText = await this.geminiService.extractTextFromImage(imageBuffer, mimeType);
      this.logger.debug(`Extracted text: ${extractedText.substring(0, 100)}...`);

      // Step 2: Extract keywords for hybrid boosting (attention mechanism)
      const keywords = this.extractKeywords(extractedText);
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

      // Step 3: Build attention-based query structure
      const attentionQuery = this.buildAttentionQuery(extractedText, keywords);

      // Step 4: Build Qdrant filter for hybrid search
      const qdrantFilter = this.buildQdrantFilter(keywords);

      // Step 5: Generate embedding from attention-structured query
      this.logger.debug('Generating embedding from attention query...');
      const embedding = await this.geminiService.generateEmbedding(attentionQuery);

      // Step 5: Search in Qdrant with filters (hybrid search)
      // If no filters, fetch more results for re-ranking (3x instead of 2x)
      const searchLimit = qdrantFilter === null ? Math.max(limit * 3, 20) : Math.max(limit * 2, 15);
      this.logger.debug(`Searching in Qdrant collection: ${collectionName} (limit: ${searchLimit})${qdrantFilter ? ' with filters' : ' without filters'}`);
      const searchResults = await this.qdrantService.search(collectionName, embedding, searchLimit, qdrantFilter);

      // Step 5: Re-rank results using hybrid scoring
      this.logger.debug('Re-ranking results with keyword boosting...');
      const reRankedResults = this.reRankResults(searchResults, keywords);

      // Step 6: Trim to requested limit
      const finalResults = reRankedResults.slice(0, limit);

      const endTime = Date.now();
      const duration = endTime - startTime;

      this.logger.log(`Image search completed in ${duration}ms, found ${finalResults.length} results`);

      return {
        extractedText,
        duration: `${duration}ms`,
        results: finalResults.map((result) => ({
          id: result.id,
          score: result.score,
          payload: result.payload,
        })),
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
   */
  async searchByTextMultipleCollections(
    query: string,
    collectionNames: string[],
    limit: number = 10,
    marca?: string,
    cliente?: string,
    includeInternetSearch: boolean = false,
    useLLMFilter: boolean = false,
    payloadFilters?: { [key: string]: any },
  ): Promise<any> {
    this.logger.log(`Searching by text in ${collectionNames.length} collections: ${collectionNames.join(', ')} | LLM Filter: ${useLLMFilter ? 'ON' : 'OFF'}`);

    const startTime = Date.now();
    const allResults: any[] = [];
    const collectionStats: any[] = [];

    try {
      // Search in each collection in parallel
      const searchPromises = collectionNames.map(async (collectionName) => {
        try {
          this.logger.debug(`Searching in collection: ${collectionName}`);
          const result = await this.searchByText(query, collectionName, limit, marca, cliente, useLLMFilter, payloadFilters);

          // Add collection name to each result
          const resultsWithCollection = result.results.map((r: any) => ({
            ...r,
            collection: collectionName,
          }));

          collectionStats.push({
            collection: collectionName,
            results_count: resultsWithCollection.length,
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

      // Trim to requested limit
      const finalResults = allResults.slice(0, limit);

      // Execute internet search if requested
      let internetResults = null;
      if (includeInternetSearch) {
        this.logger.log('Executing internet search via Gemini with Google Search Grounding...');
        const internetSearchStart = Date.now();
        try {
          // Check if we have results from catalogo_efc_200k to confirm EFC availability
          const efcResults = allResults.filter(r => r.collection === 'catalogo_efc_200k').slice(0, 3);
          const efcProductsInfo = efcResults.length > 0 ? efcResults.map(r => ({
            descripcion: r.payload?.descripcion || '',
            marca: r.payload?.marca || '',
            numero_parte: r.payload?.numero_parte || '',
            codigo_fabricante: r.payload?.codigo_fabricante || '',
          })) : null;

          internetResults = await this.geminiService.searchProductOnInternet(query, efcProductsInfo);
          const internetSearchDuration = Date.now() - internetSearchStart;
          this.logger.log(`Internet search completed in ${internetSearchDuration}ms`);
        } catch (error) {
          this.logger.error(`Internet search failed: ${error.message}`, error.stack);
          // Continue even if internet search fails
        }
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      this.logger.log(
        `Multi-collection search completed in ${duration}ms, ` +
        `found ${allResults.length} total results across ${collectionNames.length} collections, ` +
        `returning top ${finalResults.length}` +
        (includeInternetSearch ? ` + internet results` : '')
      );

      return {
        query,
        marca,
        cliente,
        collections: collectionNames,
        duration: `${duration}ms`,
        total_results: allResults.length,
        collection_stats: collectionStats,
        results: finalResults,
        ...(internetResults && { internet_results: internetResults }),
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

  /**
   * Stream internet search results with progress events (SSE)
   */
  searchInternetStream(query: string, collections: string[]): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      (async () => {
        try {
          this.logger.log(`[SSE] Starting internet search stream for query: ${query}`);

          // Event 1: Embedding started
          subscriber.next({
            data: JSON.stringify({
              type: 'embedding_start',
              message: 'Generando embedding...',
            }),
          } as MessageEvent);

          // Generate embedding
          const embeddingStart = Date.now();
          const embedding = await this.geminiService.generateEmbedding(query);
          const embeddingDuration = Date.now() - embeddingStart;

          // Event 2: Embedding complete
          subscriber.next({
            data: JSON.stringify({
              type: 'embedding_complete',
              message: 'Embedding generado',
              duration: `${embeddingDuration}ms`,
            }),
          } as MessageEvent);

          // Event 3: Search started
          subscriber.next({
            data: JSON.stringify({
              type: 'search_start',
              message: 'Buscando productos en catálogo EFC...',
            }),
          } as MessageEvent);

          // Search in Qdrant to get EFC products
          const searchStart = Date.now();
          const allResults = [];

          for (const collection of collections) {
            try {
              const results = await this.qdrantService.search(collection, embedding, 3);
              allResults.push(...results.map(r => ({ ...r, collection })));
            } catch (error) {
              this.logger.warn(`Failed to search in collection ${collection}: ${error.message}`);
            }
          }

          const searchDuration = Date.now() - searchStart;

          // Extract EFC products info
          const efcResults = allResults.filter(r => r.collection === 'catalogo_efc_200k').slice(0, 3);
          const efcProductsInfo = efcResults.length > 0 ? efcResults.map(r => ({
            descripcion: r.payload?.descripcion || '',
            marca: r.payload?.marca || '',
            numero_parte: r.payload?.numero_parte || '',
            codigo_fabricante: r.payload?.codigo_fabricante || '',
          })) : null;

          // Event 4: Search complete
          subscriber.next({
            data: JSON.stringify({
              type: 'search_complete',
              message: `Encontrados ${efcResults.length} productos en EFC`,
              duration: `${searchDuration}ms`,
              productsFound: efcResults.length,
            }),
          } as MessageEvent);

          // Event 5: Quick product identification (FAST - 1-2s)
          subscriber.next({
            data: JSON.stringify({
              type: 'quick_identification_start',
              message: 'Identificando producto...',
            }),
          } as MessageEvent);

          const quickIdStart = Date.now();
          const quickProductInfo = await this.geminiService.quickIdentifyProduct(query);
          const quickIdDuration = Date.now() - quickIdStart;

          // Event 6: Product identified (render basic info immediately!)
          subscriber.next({
            data: JSON.stringify({
              type: 'product_identified',
              message: quickProductInfo.identificado ? 'Producto identificado' : 'Buscando información detallada...',
              duration: `${quickIdDuration}ms`,
              productInfo: quickProductInfo,
              efcProductsCount: efcResults.length,
            }),
          } as MessageEvent);

          // Event 7: Starting parallel mini-searches
          subscriber.next({
            data: JSON.stringify({
              type: 'parallel_search_start',
              message: 'Iniciando búsquedas paralelas en internet...',
            }),
          } as MessageEvent);

          // PARALLEL MINI-SEARCHES: Launch all 4 searches in parallel
          // Each search will emit its own event when it completes
          const searchPromises = [
            // Mini-search 1: Suppliers in Peru (most important)
            {
              name: 'suppliers',
              promise: this.geminiService.searchSuppliersInPeru(query, efcProductsInfo),
              message: 'Buscando proveedores en Perú...',
            },
            // Mini-search 2: Technical specifications
            {
              name: 'specs',
              promise: this.geminiService.searchTechnicalSpecs(query),
              message: 'Obteniendo especificaciones técnicas...',
            },
            // Mini-search 3: Reference prices
            {
              name: 'prices',
              promise: this.geminiService.searchReferencePrices(query),
              message: 'Buscando precios referenciales...',
            },
            // Mini-search 4: Alternative products
            {
              name: 'alternatives',
              promise: this.geminiService.searchAlternatives(query),
              message: 'Buscando alternativas similares...',
            },
          ];

          // Emit start events for all mini-searches
          searchPromises.forEach(search => {
            subscriber.next({
              data: JSON.stringify({
                type: `${search.name}_search_start`,
                message: search.message,
              }),
            } as MessageEvent);
          });

          // Execute all searches in parallel and emit results as they complete
          const results = await Promise.allSettled(
            searchPromises.map(async (search, index) => {
              const start = Date.now();
              try {
                const result = await search.promise;
                const duration = Date.now() - start;

                // Emit completion event immediately when this search finishes
                subscriber.next({
                  data: JSON.stringify({
                    type: `${search.name}_search_complete`,
                    message: `${this.getSearchCompletionMessage(search.name, result)}`,
                    duration: `${duration}ms`,
                    results: result,
                    searchIndex: index + 1,
                    totalSearches: searchPromises.length,
                  }),
                } as MessageEvent);

                return { name: search.name, data: result, duration };
              } catch (error) {
                const duration = Date.now() - start;
                this.logger.error(`Mini-search ${search.name} failed: ${error.message}`);

                // Emit error event
                subscriber.next({
                  data: JSON.stringify({
                    type: `${search.name}_search_error`,
                    message: `Error en búsqueda de ${search.name}`,
                    duration: `${duration}ms`,
                    error: error.message,
                  }),
                } as MessageEvent);

                return { name: search.name, data: null, duration, error: error.message };
              }
            })
          );

          // Consolidate all results
          const consolidatedResults = {
            proveedores: [],
            especificaciones: {},
            usos: {},
            precios: [],
            rango_precio: {},
            alternativas: [],
          };

          results.forEach((result) => {
            if (result.status === 'fulfilled' && result.value.data) {
              const { name, data } = result.value;

              if (name === 'suppliers') {
                consolidatedResults.proveedores = data.proveedores || [];
              } else if (name === 'specs') {
                consolidatedResults.especificaciones = data.especificaciones || {};
                consolidatedResults.usos = data.usos || {};
              } else if (name === 'prices') {
                consolidatedResults.precios = data.precios || [];
                consolidatedResults.rango_precio = data.rango_precio || {};
              } else if (name === 'alternatives') {
                consolidatedResults.alternativas = data.alternativas || [];
              }
            }
          });

          // Event: All parallel searches completed
          const successCount = results.filter(r => r.status === 'fulfilled' && r.value.data).length;
          subscriber.next({
            data: JSON.stringify({
              type: 'all_searches_complete',
              message: `Completadas ${successCount}/${searchPromises.length} búsquedas`,
              results: consolidatedResults,
            }),
          } as MessageEvent);

          // Complete the stream
          subscriber.complete();
        } catch (error) {
          this.logger.error(`[SSE] Internet search stream failed: ${error.message}`, error.stack);
          subscriber.next({
            data: JSON.stringify({
              type: 'error',
              message: `Error: ${error.message}`,
            }),
          } as MessageEvent);
          subscriber.complete();
        }
      })();
    });
  }

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
   * Generate completion message for each mini-search based on results
   */
  private getSearchCompletionMessage(searchName: string, result: any): string {
    switch (searchName) {
      case 'suppliers':
        const supplierCount = result?.proveedores?.length || 0;
        return supplierCount > 0
          ? `Encontrados ${supplierCount} proveedores en Perú`
          : 'No se encontraron proveedores';

      case 'specs':
        const hasSpecs = result?.especificaciones && Object.keys(result.especificaciones).length > 0;
        return hasSpecs
          ? 'Especificaciones técnicas obtenidas'
          : 'No se encontraron especificaciones';

      case 'prices':
        const priceCount = result?.precios?.length || 0;
        return priceCount > 0
          ? `Encontrados ${priceCount} precios referenciales`
          : 'No se encontraron precios';

      case 'alternatives':
        const altCount = result?.alternativas?.length || 0;
        return altCount > 0
          ? `Encontradas ${altCount} alternativas`
          : 'No se encontraron alternativas';

      default:
        return 'Búsqueda completada';
    }
  }
}
