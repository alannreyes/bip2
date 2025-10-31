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
  ): Promise<any> {
    this.logger.log(`Searching by text in collection: ${collectionName}`);
    this.logger.debug(`Query: ${query}${marca ? `, Marca: ${marca}` : ''}${cliente ? `, Cliente: ${cliente}` : ''} | LLM Filter: ${useLLMFilter ? 'ON' : 'OFF'}`);

    const startTime = Date.now();

    try {
      // Step 1: Extract keywords from query for hybrid boosting (attention mechanism)
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

      // Step 2: Build attention-based query structure using enhanced query
      const attentionQuery = this.buildAttentionQuery(enhancedQuery, keywords);

      // Step 3: Build Qdrant filter for hybrid search
      const qdrantFilter = this.buildQdrantFilter(keywords);

      // Step 4: Generate embedding from attention-structured query
      this.logger.debug('Generating embedding from attention query...');
      const embedding = await this.geminiService.generateEmbedding(attentionQuery);

      // Step 5: Search in Qdrant with filters (hybrid search)
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

      // Step 6: Re-rank results using hybrid scoring
      this.logger.debug('Re-ranking results with keyword boosting...');
      const reRankedResults = this.reRankResults(searchResults, keywords);

      // Step 7: LLM Semantic Filter - OPTIONAL (disabled by default to trust embeddings)
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

      // Step 8: Trim to requested limit (or keep all if cliente filter will be applied)
      let finalResults = cliente ? semanticallyFiltered : semanticallyFiltered.slice(0, limit);

      // Step 9: Enrich with client purchase data if cliente filter is provided
      if (cliente) {
        this.logger.debug(`Enriching results with purchase data for client: ${cliente}`);
        finalResults = await this.enrichWithClientData(finalResults, cliente, collectionName);

        // Step 10: Filter to show ONLY products sold to this client
        const beforeFilterCount = finalResults.length;
        finalResults = finalResults.filter(r => r._vendido_a_cliente === true);
        this.logger.log(`Filtered from ${beforeFilterCount} to ${finalResults.length} products sold to client ${cliente}`);

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
          total_found_for_client: finalResults.length,
        }),
        results: finalResults.map((result) => ({
          id: result.id,
          score: result.score,
          payload: result.payload,
          ...(cliente && {
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
   * Build Qdrant filter from extracted keywords for hybrid search
   */
  private buildQdrantFilter(keywords: { brands: string[], dimensions: string[], colors: string[], presentations: string[], models: string[], materials: string[], productCore: string[], regular: string[] }): any {
    const mustConditions: any[] = [];
    const shouldConditions: any[] = [];

    // HIGHEST PRIORITY: Product Core filter (SHOULD with very high weight in re-ranking)
    // Changed from MUST to SHOULD to handle plurals, synonyms, and variations
    // The re-ranking will heavily penalize products without product core match
    if (keywords.productCore.length > 0) {
      keywords.productCore.forEach(core => {
        shouldConditions.push({
          key: 'descripcion',
          match: { text: core }
        });
      });
    }

    // Brand filter - INTELLIGENT: Only use MUST if we have high confidence query
    // If product core is detected, use MUST for brand (focused search)
    // If no product core, use SHOULD for brand (exploratory search)
    if (keywords.brands.length > 0) {
      const useMustForBrand = keywords.productCore.length > 0; // Only strict if we know what they want

      if (useMustForBrand) {
        // High confidence query - strict brand matching
        if (keywords.brands.length === 1) {
          mustConditions.push({
            key: 'marca',
            match: { value: keywords.brands[0].toUpperCase() }
          });
        } else {
          mustConditions.push({
            should: keywords.brands.map(brand => ({
              key: 'marca',
              match: { value: brand.toUpperCase() }
            }))
          });
        }
      } else {
        // Exploratory query - flexible brand matching
        keywords.brands.forEach(brand => {
          shouldConditions.push({
            key: 'marca',
            match: { value: brand.toUpperCase() }
          });
        });
      }
    }

    // Dimension filters (SHOULD match - helps narrow down but not required)
    keywords.dimensions.forEach(dimension => {
      shouldConditions.push({
        key: 'descripcion',
        match: { text: dimension }
      });
    });

    // Regular keyword filters (SHOULD match - helps with relevance)
    // Only use the most important ones to avoid over-filtering
    keywords.regular.slice(0, 3).forEach(keyword => {
      shouldConditions.push({
        key: 'descripcion',
        match: { text: keyword }
      });
    });

    // Build final filter
    const filter: any = {};

    if (mustConditions.length > 0) {
      filter.must = mustConditions;
    }

    // IMPORTANT: Only use SHOULD conditions if we have MUST conditions
    // If we only have SHOULD conditions, Qdrant requires at least one match,
    // which can block results. Instead, let vector search find similar products
    // and rely on re-ranking to boost/penalize appropriately.
    if (shouldConditions.length > 0 && mustConditions.length > 0) {
      filter.should = shouldConditions;
    }

    // Return null if no filters (search without filters)
    if (Object.keys(filter).length === 0) {
      this.logger.debug('No MUST conditions - skipping filters, relying on vector search + re-ranking');
      return null;
    }

    this.logger.debug(`Built Qdrant filter: ${JSON.stringify(filter, null, 2)}`);
    return filter;
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
    // Known brands (add more as needed)
    const knownBrands = new Set([
      'stanley', 'truper', 'uyustools', 'urrea', 'rubicon', 'pretul',
      'dewalt', 'makita', 'bosch', 'black+decker', 'milwaukee', 'ryobi',
      'cpp', 'anypsa', 'sherwin williams', 'comex', 'pintuco', 'teknoquimica'
    ]);

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
    const words = text.toLowerCase()
      .replace(/[^\w\s/"-]/g, ' ')  // Keep / " - for dimensions
      .split(/\s+/)
      .filter(word => word.length > 2);

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

    // Priority 1: Brand (high attention weight)
    if (keywords.brands.length > 0) {
      parts.push(`Marca: ${keywords.brands.join(', ')}`);
    }

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
    if (keywords.regular.length > 0) {
      parts.push(`Descripción: ${keywords.regular.join(' ')}`);
    }

    // If we extracted structured attributes, use them; otherwise fall back to original
    if (parts.length > 0) {
      const structuredQuery = parts.join(' | ');
      this.logger.debug(`Attention query: ${structuredQuery}`);
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

      // Check brand matches
      keywords.brands.forEach(brand => {
        if (brandField.includes(brand)) {
          brandMatches++;
        } else if (keywords.brands.length > 0) {
          // If user specified a brand but this product doesn't match, penalize
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
      // Keyword matching weights: productCore (0.30 HUGE!), brand (0.05), dimension (0.08), regular (0.02)
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

      boost += brandMatches * 0.05;        // +5% per brand match
      boost -= brandMismatches * 0.05;     // -5% per brand mismatch
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
          const result = await this.searchByText(query, collectionName, limit, marca, cliente, useLLMFilter);

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

          // Event 7: Internet search started (enrichment)
          subscriber.next({
            data: JSON.stringify({
              type: 'internet_start',
              message: 'Enriqueciendo con información de internet...',
            }),
          } as MessageEvent);

          // Search on internet (full enrichment)
          const internetStart = Date.now();
          const internetResults = await this.geminiService.searchProductOnInternet(query, efcProductsInfo);
          const internetDuration = Date.now() - internetStart;

          // Event 8: Internet search complete (final enrichment)
          subscriber.next({
            data: JSON.stringify({
              type: 'internet_complete',
              message: 'Información completa lista',
              duration: `${internetDuration}ms`,
              results: internetResults,
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
}
