import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class GeminiEmbeddingService {
  private readonly logger = new Logger(GeminiEmbeddingService.name);
  private readonly genAI: GoogleGenerativeAI;
  private readonly apiKey: string;
  private readonly embeddingModel: string = 'gemini-embedding-001';
  private readonly visionModel: string = 'gemini-2.0-flash-exp';

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get('GEMINI_API_KEY');
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    this.genAI = new GoogleGenerativeAI(this.apiKey);
    this.logger.log('Gemini AI initialized with gemini-embedding-001 (3072 dims)');
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      if (!text || text.trim().length === 0) {
        throw new Error('Text cannot be empty');
      }

      // Use direct fetch API for reliability (same as batch processing)
      const cleanText = text.trim();
      const payload = {
        model: 'models/gemini-embedding-001',
        content: {
          parts: [{ text: cleanText }],
        },
      };

      const maxRetries = 5;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);

          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${this.apiKey}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Accept': 'application/json',
                'User-Agent': 'BIP2-Backend/1.0',
              },
              body: JSON.stringify(payload),
              signal: controller.signal,
            }
          );

          clearTimeout(timeoutId);

          if (!response.ok) {
            if ((response.status === 400 || response.status === 429 || response.status === 503) && attempt < maxRetries - 1) {
              const backoffDelay = Math.pow(2, attempt + 2) * 1000;
              this.logger.warn(`Embedding failed (${response.status}), retrying in ${backoffDelay}ms...`);
              await new Promise(resolve => setTimeout(resolve, backoffDelay));
              continue;
            }
            const errorData = await response.text();
            throw new Error(`Embedding failed with ${response.status}: ${errorData}`);
          }

          const data = await response.json();
          if (!data.embedding || !data.embedding.values) {
            throw new Error('No embedding values returned from Gemini');
          }

          return data.embedding.values;
        } catch (fetchError) {
          lastError = fetchError as Error;
          if (attempt < maxRetries - 1) {
            const backoffDelay = Math.pow(2, attempt + 2) * 1000;
            this.logger.warn(`Embedding attempt ${attempt + 1} failed, retrying in ${backoffDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
          }
        }
      }

      throw lastError || new Error('Failed to generate embedding after max retries');
    } catch (error) {
      this.logger.error(`Failed to generate embedding: ${error.message}`);
      throw new Error(`Gemini embedding failed: ${error.message}`);
    }
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      if (!texts || texts.length === 0) {
        return [];
      }

      // Filter out empty texts
      const validTexts = texts.filter((t) => t && t.trim().length > 0);

      if (validTexts.length === 0) {
        return [];
      }

      // Use direct fetch API instead of library for more reliable batch processing
      const embeddings: number[][] = [];
      const chunkSize = 5; // Very small batches to avoid overwhelming the API

      for (let i = 0; i < validTexts.length; i += chunkSize) {
        const chunk = validTexts.slice(i, i + chunkSize);

        // Process each text with retry logic
        for (const text of chunk) {
          let embedding: number[] | null = null;
          const maxRetries = 5; // More retries for connection issues
          let lastError: Error | null = null;

          for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
              // Sanitize and validate text
              const cleanText = text.trim();
              if (!cleanText) {
                this.logger.warn(`Empty text after trim, skipping`);
                break;
              }

              const debugAttempt = attempt > 0 ? ` (attempt ${attempt + 1}/${maxRetries})` : '';
              this.logger.debug(`Embedding text (${cleanText.length} chars)${debugAttempt}: ${cleanText.substring(0, 50)}...`);

              const payload = {
                model: 'models/gemini-embedding-001',
                content: {
                  parts: [{ text: cleanText }],
                },
              };

              const bodyStr = JSON.stringify(payload);

              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 30000);

              const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${this.apiKey}`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Accept': 'application/json',
                    'User-Agent': 'BIP2-Backend/1.0',
                  },
                  body: bodyStr,
                  signal: controller.signal,
                }
              );

              clearTimeout(timeoutId);

              this.logger.debug(`Response status: ${response.status}${debugAttempt ? ` ${debugAttempt}` : ''}`);

              if (!response.ok) {
                const errorData = await response.text();
                lastError = new Error(`API returned ${response.status}: ${errorData.substring(0, 200)}`);

                // Retry on 400/429/503/504 errors (rate limit, temporary server issues, etc)
                if ((response.status === 400 || response.status === 429 || response.status === 503 || response.status === 504) && attempt < maxRetries - 1) {
                  const backoffDelay = Math.pow(2, attempt + 2) * 1000; // 4s, 8s, 16s, 32s exponential backoff
                  this.logger.warn(`Rate limit or server error (${response.status}), retrying in ${backoffDelay}ms (attempt ${attempt + 1}/${maxRetries})...`);
                  await new Promise(resolve => setTimeout(resolve, backoffDelay));
                  continue;
                }

                throw lastError;
              }

              const data = await response.json();

              if (data.embedding && data.embedding.values) {
                embedding = data.embedding.values;
                embeddings.push(embedding);
                break; // Success, exit retry loop
              } else {
                this.logger.warn(`No embedding returned for text: ${cleanText.substring(0, 50)}...`);
                break;
              }
            } catch (textError) {
              lastError = textError as Error;
              if (attempt < maxRetries - 1) {
                // Longer exponential backoff for connection errors
                const backoffDelay = Math.pow(2, attempt + 2) * 1000; // 4s, 8s, 16s, 32s, 64s
                this.logger.warn(`Connection/parse error on attempt ${attempt + 1}/${maxRetries}, retrying in ${backoffDelay}ms: ${lastError.message}`);
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
              }
            }
          }

          if (!embedding && lastError) {
            this.logger.error(`Failed to embed text after ${maxRetries} attempts: ${lastError.message}`);
            throw lastError;
          }

          // Delay between requests (configurable via environment variable)
          // Default: 600ms = ~100 reqs/minute max (safe for free tier)
          // Can be adjusted based on API quotas and rate limits
          const delayBetweenRequests = parseInt(
            process.env.GEMINI_EMBEDDING_DELAY_MS || '600',
            10,
          );
          await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
        }

        this.logger.debug(`Processed batch ${Math.floor(i / chunkSize) + 1} (${i + chunk.length}/${validTexts.length})`);
      }

      return embeddings;
    } catch (error) {
      this.logger.error(`Failed to generate batch embeddings: ${error.message}`);
      throw new Error(`Gemini batch embedding failed: ${error.message}`);
    }
  }

  async extractTextFromImage(imageBuffer: Buffer, mimeType: string = 'image/jpeg'): Promise<string> {
    try {
      this.logger.log(`Processing document with mimeType: ${mimeType}, size: ${imageBuffer.length} bytes`);

      const model = this.genAI.getGenerativeModel({ model: this.visionModel });

      const imagePart = {
        inlineData: {
          data: imageBuffer.toString('base64'),
          mimeType,
        },
      };

      const prompt =
        'Extract and describe all product information from this document. Include: product type, color, size/dimensions if visible, brand/manufacturer if visible, model numbers, and any other relevant characteristics. Be concise and focus on searchable attributes.';

      this.logger.debug('Sending request to Gemini...');
      const result = await model.generateContent([prompt, imagePart]);
      const response = result.response;
      const text = response.text();

      this.logger.log(`Successfully extracted text (${text.length} chars): ${text.substring(0, 100)}...`);
      return text;
    } catch (error) {
      this.logger.error(`Failed to extract text from document: ${error.message}`);
      this.logger.error(`Error stack: ${error.stack}`);
      throw new Error(`Gemini vision failed: ${error.message}`);
    }
  }

  getVectorSize(): number {
    return 3072; // gemini-embedding-001 returns 3072-dimensional vectors (with MRL support)
  }

  /**
   * Get vector size with optional Matryoshka truncation
   * MRL allows truncating to smaller dimensions while maintaining accuracy
   */
  getTruncatedVectorSize(dimensions?: number): number {
    const fullSize = 3072;
    if (!dimensions) return fullSize;

    // Common MRL truncation sizes: 768, 512, 256, 128, 64
    const validSizes = [64, 128, 256, 512, 768, 1024, 1536, 2048, 3072];

    if (!validSizes.includes(dimensions)) {
      this.logger.warn(`Invalid truncation size ${dimensions}, using full 3072`);
      return fullSize;
    }

    return dimensions;
  }

  /**
   * Truncate embedding vector to smaller dimensions using MRL
   */
  truncateEmbedding(embedding: number[], targetDimensions: number): number[] {
    if (targetDimensions >= embedding.length) {
      return embedding;
    }
    return embedding.slice(0, targetDimensions);
  }

  /**
   * Classify a duplicate pair using AI to determine if it's a real duplicate or a variant
   */
  async classifyDuplicatePair(
    product1: { id: string; description: string },
    product2: { id: string; description: string },
    similarity: number,
  ): Promise<{
    category: 'real_duplicate' | 'size_variant' | 'color_variant' | 'model_variant' | 'description_variant' | 'review_needed';
    confidence: number;
    reason: string;
    differences: string[];
    recommendation: 'merge' | 'keep_both' | 'review';
  }> {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.visionModel });

      const prompt = `Analiza estos dos productos y determina si son duplicados reales o variantes diferentes:

PRODUCTO 1:
ID: ${product1.id}
Descripción: ${product1.description}

PRODUCTO 2:
ID: ${product2.id}
Descripción: ${product2.description}

Similitud semántica: ${(similarity * 100).toFixed(1)}%

Clasifícalos en una de estas categorías:
1. real_duplicate: Son el mismo producto con descripción diferente (abreviaciones, orden de palabras, etc.)
2. size_variant: Difieren solo en tamaño/dimensiones/capacidad
3. color_variant: Difieren solo en color
4. model_variant: Difieren en código/modelo/versión
5. description_variant: Difieren en detalles descriptivos adicionales (con/sin tapa, con/sin accesorios, etc.)
6. review_needed: Caso ambiguo que requiere revisión manual

Responde SOLO con un objeto JSON válido (sin markdown, sin comentarios):
{
  "category": "una de las categorías arriba",
  "confidence": número entre 0 y 1,
  "reason": "explicación breve de la diferencia principal",
  "differences": ["lista", "de", "diferencias", "encontradas"],
  "recommendation": "merge | keep_both | review"
}`;

      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text().trim();

      // Remove markdown code blocks if present
      const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      const classification = JSON.parse(jsonText);

      // Validate response structure
      if (!classification.category || !classification.recommendation) {
        throw new Error('Invalid classification response structure');
      }

      return classification;
    } catch (error) {
      this.logger.error(`Failed to classify duplicate pair: ${error.message}`);
      // Return a safe default
      return {
        category: 'review_needed',
        confidence: 0,
        reason: `Error en clasificación: ${error.message}`,
        differences: [],
        recommendation: 'review',
      };
    }
  }

  /**
   * Classify multiple duplicate groups in batch
   */
  async classifyDuplicateGroups(
    groups: Array<{
      products: Array<{ id: string; description: string; score: number }>;
      avgSimilarity: number;
    }>,
  ): Promise<
    Array<{
      groupIndex: number;
      category: string;
      confidence: number;
      reason: string;
      differences: string[];
      recommendation: string;
    }>
  > {
    const classifications = [];

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      if (group.products.length < 2) continue;

      // Classify the first pair (representative of the group)
      const product1 = group.products[0];
      const product2 = group.products[1];

      const classification = await this.classifyDuplicatePair(
        { id: String(product1.id), description: product1.description },
        { id: String(product2.id), description: product2.description },
        product2.score,
      );

      classifications.push({
        groupIndex: i,
        ...classification,
      });

      // Add small delay to avoid rate limiting
      if (i < groups.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return classifications;
  }

  /**
   * Filter search results semantically using LLM to ensure relevance
   * Evaluates each product to determine if it matches the user's search intent
   */
  async filterSearchResults(
    query: string,
    products: Array<{ id: string; descripcion: string; marca?: string; categoria?: string; score: number }>,
  ): Promise<Array<{ id: string; match: boolean; confidence: number; reason: string; adjustedScore: number }>> {
    try {
      if (products.length === 0) {
        return [];
      }

      const model = this.genAI.getGenerativeModel({ model: this.visionModel });

      // Process in batches to avoid token limits
      const batchSize = 10;
      const results = [];

      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);

        const productsText = batch.map((p, idx) =>
          `PRODUCTO ${idx + 1}:
ID: ${p.id}
Descripción: ${p.descripcion}${p.marca ? `\nMarca: ${p.marca}` : ''}${p.categoria ? `\nCategoría: ${p.categoria}` : ''}
Score original: ${p.score.toFixed(3)}`
        ).join('\n\n');

        const prompt = `Eres un inspector de control de calidad INDUSTRIAL ESTRICTO. Valida si cada producto es EXACTAMENTE lo que el cliente solicita o un equivalente industrial certificado.

BÚSQUEDA DEL CLIENTE: "${query}"

PRODUCTOS A EVALUAR:
${productsText}

REGLAS DE VALIDACIÓN INDUSTRIAL (INFLEXIBLES):

1. TIPO DE PRODUCTO:
   - DEBE ser el producto EXACTO solicitado
   - NO aceptar accesorios, complementos o productos relacionados
   - Ejemplo: Si pide "desarmador" NO aceptar "kit de desarmadores", "juego", "set"

2. ESPECIFICACIONES TÉCNICAS (CERO TOLERANCIA):
   - Medidas/Dimensiones: DEBEN ser EXACTAS (6" ≠ 8" ≠ 10")
   - Voltaje: DEBE ser EXACTO (110V ≠ 220V)
   - Capacidad: DEBE ser EXACTA (500ml ≠ 1L)
   - Peso/Masa: DEBE ser EXACTO (1kg ≠ 2kg)
   - Diámetro/Grosor: DEBE ser EXACTO (1/4" ≠ 3/8" ≠ 1/2")

   EQUIVALENCIAS INDUSTRIALES ACEPTABLES:
   - Solo si son estándares certificados (ej: "Phillips #2" = "Estrella #2")
   - Conversiones métricas exactas (ej: 6" = 152mm, 1/4" = 6.35mm)
   - Nomenclatura industrial equivalente (ej: "Plano" = "Punta plana")

3. MARCA (SI SE ESPECIFICÓ):
   - DEBE ser la marca EXACTA solicitada
   - NO aceptar marcas "similares" o "equivalentes"
   - Stanley ≠ Truper ≠ Urrea ≠ Klein Tools

4. CRITERIO DE RECHAZO AUTOMÁTICO:
   - Producto de tipo diferente => match=false
   - Cualquier especificación diferente => match=false
   - Marca diferente (si se especificó) => match=false
   - Juegos/Sets/Kits (si se pidió pieza individual) => match=false
   - Producto complementario o accesorio => match=false

EJEMPLOS DE EVALUACIÓN ESTRICTA:
  ✅ Query "desarmador plano 1/4 x 6 pulgadas stanley" + Producto "DESARMADOR PLANO 1/4\" X 6\" STANLEY 64-461" => match=true, confidence=1.0 (EXACTO)
  ✅ Query "desarmador plano 1/4 x 6" + Producto "DESARMADOR PUNTA PLANA 1/4\" X 152MM" => match=true, confidence=0.95 (6"=152mm, equivalente industrial)

  ❌ Query "desarmador plano 1/4 x 6" + Producto "DESARMADOR PLANO 1/4\" X 8\"" => match=false, confidence=0.0 (medida diferente: 8" ≠ 6")
  ❌ Query "desarmador plano 1/4 x 6 stanley" + Producto "DESARMADOR PLANO 1/4\" X 6\" TRUPER" => match=false, confidence=0.0 (marca diferente)
  ❌ Query "desarmador plano 1/4 x 6" + Producto "JGO DESARMADORES 6 PZAS" => match=false, confidence=0.0 (es juego, no pieza individual)
  ❌ Query "cable 10mm" + Producto "CABLE 12MM" => match=false, confidence=0.0 (calibre diferente)
  ❌ Query "papel A4 80g" + Producto "PAPEL A4 75G" => match=false, confidence=0.0 (gramaje diferente)

Responde SOLO con un array JSON válido (sin markdown, sin comentarios):
[
  {
    "id": "id del producto",
    "match": true o false,
    "confidence": número entre 0.0 y 1.0,
    "reason": "breve explicación (máx 20 palabras)"
  }
]`;

        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text().trim();

        // Remove markdown code blocks if present
        const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        const batchResults = JSON.parse(jsonText);

        // Validate and merge results
        if (Array.isArray(batchResults)) {
          batchResults.forEach((item) => {
            if (item.id && typeof item.match === 'boolean') {
              // Find original product to get score
              const originalProduct = batch.find(p => p.id === item.id);
              const originalScore = originalProduct?.score || 0;

              // Adjust score based on LLM confidence
              // If match=true, boost score by confidence
              // If match=false, severely penalize
              const adjustedScore = item.match
                ? originalScore * (0.5 + item.confidence * 0.5) // Boost matched products
                : originalScore * 0.1; // Penalize non-matches heavily

              results.push({
                id: item.id,
                match: item.match,
                confidence: item.confidence || 0.5,
                reason: item.reason || 'Sin razón',
                adjustedScore,
              });
            }
          });
        }

        // Add delay between batches to avoid rate limiting
        if (i + batchSize < products.length) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }

      this.logger.log(`LLM filtered ${products.length} products: ${results.filter(r => r.match).length} matches`);
      return results;
    } catch (error) {
      this.logger.error(`Failed to filter search results: ${error.message}`);
      // On error, return all products as potential matches with low confidence
      return products.map(p => ({
        id: p.id,
        match: true, // Default to true on error to avoid hiding results
        confidence: 0.3,
        reason: `Error en filtrado: ${error.message}`,
        adjustedScore: p.score * 0.5,
      }));
    }
  }

  /**
   * Validate if a product already exists by comparing with similar products
   */
  async validateProductExists(
    newProduct: { descripcion: string; marca?: string; modelo?: string },
    existingProducts: Array<{ id: string; descripcion: string; marca?: string; modelo?: string; similarity: number }>,
  ): Promise<{
    exists: boolean;
    isExactMatch: boolean;
    isVariant: boolean;
    reason: string;
    confidence: number;
    recommendation: 'reject' | 'accept' | 'review';
  }> {
    try {
      if (existingProducts.length === 0) {
        return {
          exists: false,
          isExactMatch: false,
          isVariant: false,
          reason: 'No se encontraron productos similares',
          confidence: 1.0,
          recommendation: 'accept',
        };
      }

      const model = this.genAI.getGenerativeModel({ model: this.visionModel });

      // Build product comparison
      const existingProductsText = existingProducts.map((p, idx) =>
        `PRODUCTO EXISTENTE ${idx + 1}:
ID: ${p.id}
Descripción: ${p.descripcion}${p.marca ? `\nMarca: ${p.marca}` : ''}${p.modelo ? `\nModelo: ${p.modelo}` : ''}
Similitud semántica: ${(p.similarity * 100).toFixed(1)}%`
      ).join('\n\n');

      const prompt = `Analiza si el NUEVO PRODUCTO ya existe en la base de datos comparándolo con los productos existentes similares:

NUEVO PRODUCTO:
Descripción: ${newProduct.descripcion}${newProduct.marca ? `\nMarca: ${newProduct.marca}` : ''}${newProduct.modelo ? `\nModelo: ${newProduct.modelo}` : ''}

PRODUCTOS EXISTENTES SIMILARES:
${existingProductsText}

Determina:
1. ¿El nuevo producto YA EXISTE (es idéntico a alguno de los existentes)?
2. ¿Es una VARIANTE de alguno existente (solo difiere en talla/color/modelo)?
3. ¿Es un producto NUEVO (diferente de todos los existentes)?

IMPORTANTE:
- Si solo difiere en talla/tamaño/dimensión/color => es VARIANTE
- Si la descripción es esencialmente la misma (solo cambia orden de palabras, abreviaciones) => YA EXISTE
- Si tiene diferencias sustanciales más allá de talla/color => es NUEVO

Responde SOLO con un objeto JSON válido (sin markdown):
{
  "exists": true o false (true si ya existe o es variante),
  "isExactMatch": true o false (true si es exactamente el mismo producto),
  "isVariant": true o false (true si es una variante de talla/color),
  "reason": "explicación clara y concisa",
  "confidence": número entre 0 y 1,
  "recommendation": "reject (ya existe) | accept (es nuevo) | review (dudoso)"
}`;

      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text().trim();

      // Remove markdown code blocks if present
      const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      const validation = JSON.parse(jsonText);

      // Validate response structure
      if (typeof validation.exists !== 'boolean' || !validation.recommendation) {
        throw new Error('Invalid validation response structure');
      }

      return validation;
    } catch (error) {
      this.logger.error(`Failed to validate product exists: ${error.message}`);
      // Return a safe default - ask for review
      return {
        exists: false,
        isExactMatch: false,
        isVariant: false,
        reason: `Error en validación: ${error.message}`,
        confidence: 0,
        recommendation: 'review',
      };
    }
  }

  /**
   * Quick product identification using LLM knowledge only (NO internet search)
   * Returns basic product information in 1-2 seconds for immediate display
   */
  async quickIdentifyProduct(query: string): Promise<any> {
    try {
      this.logger.log(`Quick product identification (LLM only): ${query}`);

      const prompt = `Basándote ÚNICAMENTE en tu conocimiento, identifica el producto mencionado en esta consulta.

CONSULTA DEL USUARIO: "${query}"

Proporciona información básica del producto en formato JSON:

{
  "nombre_producto": "Nombre comercial del producto",
  "categoria": "Categoría general del producto",
  "tipo": "Tipo específico de producto",
  "descripcion_breve": "Descripción concisa en 1-2 líneas",
  "usos_principales": ["Uso 1", "Uso 2", "Uso 3"],
  "identificado": true/false
}

IMPORTANTE:
- Si reconoces el producto, marca identificado: true
- Si NO puedes identificar el producto, marca identificado: false y deja los demás campos vacíos
- Sé conciso y directo
- NO inventes información
- Usa tu conocimiento general, NO busques en internet`;

      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
      });

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in LLM response');
      }

      const productInfo = JSON.parse(jsonMatch[0]);
      this.logger.log(`Quick identification ${productInfo.identificado ? 'successful' : 'failed'}`);

      return productInfo;

    } catch (error) {
      this.logger.error(`Quick identification failed: ${error.message}`);
      return {
        identificado: false,
        nombre_producto: '',
        categoria: '',
        tipo: '',
        descripcion_breve: '',
        usos_principales: [],
      };
    }
  }

  /**
   * PHASE 1: Fast basic product information (3-4 seconds)
   * Returns essential information for immediate display
   */
  async searchProductPhase1(descripcionProducto: string, efcProductsInfo?: any[]): Promise<any> {
    try {
      this.logger.log(`[PHASE 1] Fast basic search: ${descripcionProducto}`);
      if (efcProductsInfo && efcProductsInfo.length > 0) {
        this.logger.log(`[PHASE 1] Found ${efcProductsInfo.length} matching products in EFC catalog`);
      }

      // Import the new SDK dynamically
      const { GoogleGenAI } = await import('@google/genai');

      // Initialize the new Google Gen AI client
      const aiClient = new GoogleGenAI({ apiKey: this.apiKey });

      // Configure Google Search Grounding tool
      const groundingTool = {
        googleSearch: {},
      };

      const config = {
        tools: [groundingTool],
        generationConfig: {
          temperature: 0.3,
          topP: 0.8,
          topK: 20,
          maxOutputTokens: 1536, // Reduced from 4096 for faster response
        },
      };

      // Build context about EFC products if we have them
      let efcContext = '';
      if (efcProductsInfo && efcProductsInfo.length > 0) {
        efcContext = `\n\n**PRODUCTOS EN CATÁLOGO EFC**: ${efcProductsInfo.map((p, i) => `${i + 1}. ${p.descripcion} (${p.marca || 'N/A'})`).join(', ')}`;
      }

      const prompt = `Busca RÁPIDAMENTE información ESENCIAL sobre este producto para procurement en Perú.

PRODUCTO: "${descripcionProducto}"${efcContext}

Responde SOLO con JSON válido (sin markdown):
{
  "resultados_efc": {
    "encontrado_en_efc": ${efcProductsInfo && efcProductsInfo.length > 0 ? 'true' : 'false'},
    "productos_efc": [${efcProductsInfo && efcProductsInfo.length > 0 ? '{"nombre": "nombre del producto", "codigo": "código", "descripcion": "breve"}' : ''}],
    "mensaje": "mensaje breve"
  },
  "producto_confirmado": {
    "nombre_comercial": "Nombre del producto",
    "marca": "Marca o fabricante",
    "categoria": "Categoría",
    "uso_principal": "Para qué se usa (1 línea)",
    "especificaciones_clave": "Specs principales (1 línea)"
  },
  "proveedores_top": [
    {
      "nombre": "Proveedor principal",
      "pais": "Perú",
      "tipo": "distribuidor|fabricante",
      "url": "URL exacta"
    }
  ],
  "validacion": {
    "producto_encontrado": true/false,
    "confianza": 0-100
  }
}

IMPORTANTE:
- Solo top 3 proveedores más relevantes
- Información concisa y directa
- Prioriza resultados de Perú
- ${efcProductsInfo && efcProductsInfo.length > 0 ? 'YA tenemos productos en EFC, inclúyelos' : 'No encontramos en EFC'}`;

      // Call the API
      const result = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config,
      });

      const text = result.text.trim();
      let jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      let searchResults;
      try {
        searchResults = JSON.parse(jsonText);
      } catch (parseError) {
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const cleanedJson = jsonMatch[0]
            .replace(/,(\s*[}\]])/g, '$1')
            .replace(/\/\/.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '');
          searchResults = JSON.parse(cleanedJson);
        } else {
          throw parseError;
        }
      }

      this.logger.log(`[PHASE 1] Completed successfully`);
      return searchResults;
    } catch (error) {
      this.logger.error(`[PHASE 1] Failed: ${error.message}`);
      return {
        resultados_efc: {
          encontrado_en_efc: efcProductsInfo && efcProductsInfo.length > 0,
          productos_efc: [],
          mensaje: 'Error en búsqueda rápida',
        },
        producto_confirmado: null,
        proveedores_top: [],
        validacion: {
          producto_encontrado: false,
          confianza: 0,
        },
      };
    }
  }

  /**
   * PHASE 2: Detailed information enrichment (5-6 seconds)
   * Returns detailed contact info, pricing, and additional data
   */
  async searchProductPhase2(descripcionProducto: string, phase1Results: any): Promise<any> {
    try {
      this.logger.log(`[PHASE 2] Detailed enrichment: ${descripcionProducto}`);

      // Import the new SDK dynamically
      const { GoogleGenAI } = await import('@google/genai');

      // Initialize the new Google Gen AI client
      const aiClient = new GoogleGenAI({ apiKey: this.apiKey });

      // Configure Google Search Grounding tool
      const groundingTool = {
        googleSearch: {},
      };

      const config = {
        tools: [groundingTool],
        generationConfig: {
          temperature: 0.3,
          topP: 0.8,
          topK: 20,
          maxOutputTokens: 2048, // Reduced from 4096
        },
      };

      const prompt = `Enriquece esta información de producto con DETALLES ADICIONALES para cotización.

PRODUCTO: "${descripcionProducto}"
INFO BÁSICA YA OBTENIDA: ${JSON.stringify(phase1Results.producto_confirmado)}

Busca y proporciona SOLO JSON válido (sin markdown):
{
  "contactos_proveedores": [
    {
      "nombre": "Nombre proveedor",
      "telefono": "Teléfono con código",
      "email": "Email ventas",
      "whatsapp": "WhatsApp si hay",
      "precio_referencial": "Precio aprox si hay"
    }
  ],
  "alternativas": [
    {
      "nombre": "Producto alternativo",
      "marca": "Marca",
      "razon": "Por qué es alternativa válida"
    }
  ],
  "info_tecnica": {
    "ficha_tecnica_url": "URL PDF si hay",
    "certificaciones": "Certificaciones principales si hay"
  }
}

IMPORTANTE:
- Enfócate en contactos útiles para cotizar
- Precios referenciales si están disponibles
- Máximo 5 proveedores
- Máximo 3 alternativas`;

      // Call the API
      const result = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config,
      });

      const text = result.text.trim();
      let jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      let detailedResults;
      try {
        detailedResults = JSON.parse(jsonText);
      } catch (parseError) {
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const cleanedJson = jsonMatch[0]
            .replace(/,(\s*[}\]])/g, '$1')
            .replace(/\/\/.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '');
          detailedResults = JSON.parse(cleanedJson);
        } else {
          throw parseError;
        }
      }

      this.logger.log(`[PHASE 2] Completed successfully`);
      return detailedResults;
    } catch (error) {
      this.logger.error(`[PHASE 2] Failed: ${error.message}`);
      return {
        contactos_proveedores: [],
        alternativas: [],
        info_tecnica: {},
      };
    }
  }

  /**
   * Search for product information on the internet using Gemini with Google Search Grounding
   * Uses the new @google/genai SDK with real-time Google Search
   */
  async searchProductOnInternet(descripcionProducto: string, efcProductsInfo?: any[]): Promise<any> {
    try {
      this.logger.log(`Searching product on internet with Google Search Grounding: ${descripcionProducto}`);
      if (efcProductsInfo && efcProductsInfo.length > 0) {
        this.logger.log(`Found ${efcProductsInfo.length} matching products in EFC catalog`);
      }

      // Import the new SDK dynamically
      const { GoogleGenAI } = await import('@google/genai');

      // Initialize the new Google Gen AI client
      const aiClient = new GoogleGenAI({ apiKey: this.apiKey });

      // Configure Google Search Grounding tool
      const groundingTool = {
        googleSearch: {},
      };

      const config = {
        tools: [groundingTool],
        generationConfig: {
          temperature: 0.3,
          topP: 0.8,
          topK: 20,
          maxOutputTokens: 4096,
        },
      };

      // Build context about EFC products if we have them
      let efcContext = '';
      if (efcProductsInfo && efcProductsInfo.length > 0) {
        efcContext = `\n\n**PRODUCTOS CONFIRMADOS EN CATÁLOGO EFC**:
Hemos encontrado los siguientes productos en nuestro catálogo interno de EFC que coinciden con la búsqueda:
${efcProductsInfo.map((p, i) => `
${i + 1}. ${p.descripcion}
   - Marca: ${p.marca || 'N/A'}
   - Número de parte: ${p.numero_parte || 'N/A'}
   - Código fabricante: ${p.codigo_fabricante || 'N/A'}
`).join('')}

**IMPORTANTE**: Estos productos YA ESTÁN disponibles en el ecommerce de EFC (empresas.efc.com.pe).
Debes incluirlos en la sección "resultados_efc" del JSON marcando encontrado_en_efc: true`;
      }

      const prompt = `Eres un asistente experto en procurement (compras) para EFC, una central de compras en Perú. Tu tarea es buscar en internet información detallada sobre un producto específico que un cliente necesita cotizar.

PRODUCTO A BUSCAR: "${descripcionProducto}"${efcContext}

INSTRUCCIONES:
1. **IMPORTANTE SOBRE EFC**: ${efcProductsInfo && efcProductsInfo.length > 0 ?
   'Ya tenemos confirmación de que este producto ESTÁ en nuestro catálogo EFC. Debes marcar encontrado_en_efc: true y crear entradas basadas en los productos listados arriba.' :
   'No encontramos este producto en nuestro catálogo interno. Marca encontrado_en_efc: false.'}
   - **SIEMPRE debes incluir la sección "resultados_efc" en el JSON**
2. Busca en internet proveedores, distribuidores y fabricantes de este producto
3. Prioriza resultados de Perú, pero incluye opciones internacionales relevantes
4. Valida que los resultados correspondan EXACTAMENTE al producto solicitado
5. Extrae información clave para facilitar la cotización
6. Identifica claramente los USOS y APLICACIONES del producto

**IMPORTANTE**: El JSON DEBE incluir TODAS las secciones, incluso si están vacías. Especialmente "resultados_efc".

INFORMACIÓN A EXTRAER (formato JSON):
{
  "resultados_efc": {
    "encontrado_en_efc": true/false,
    "productos_efc": [
      {
        "nombre": "Nombre del producto en EFC",
        "url": "URL exacta del producto en empresas.efc.com.pe",
        "codigo": "Código del producto en EFC",
        "descripcion": "Descripción breve del producto",
        "coincidencia": "0-100 (qué tan bien coincide con la búsqueda)"
      }
    ],
    "mensaje": "Mensaje si se encontró o no en EFC"
  },
  "producto_confirmado": {
    "nombre_comercial": "Nombre exacto del producto encontrado",
    "marca": "Marca o fabricante",
    "codigo_producto": "Código, SKU o referencia del producto",
    "especificaciones_tecnicas": "Especificaciones clave (medidas, voltaje, capacidad, etc.)",
    "uso_producto": "Descripción detallada de para qué se usa este producto, aplicaciones principales, industrias donde se utiliza",
    "usos_aplicaciones": "Lista de usos específicos del producto",
    "categoria": "Categoría del producto"
  },
  "proveedores": [
    {
      "nombre_empresa": "Nombre del proveedor/distribuidor",
      "pais": "Perú o país de origen",
      "tipo": "fabricante|distribuidor|importador|marketplace",
      "contacto": {
        "telefono": "Teléfono con código de país",
        "email": "Email de contacto o ventas",
        "whatsapp": "Número de WhatsApp si está disponible",
        "direccion": "Dirección física si está disponible"
      },
      "url_fuente": "URL exacta de la página donde encontraste la información",
      "precio_referencial": "Precio aproximado en PEN o USD (si está disponible)",
      "disponibilidad": "En stock | Bajo pedido | No especificado",
      "tiempo_entrega": "Tiempo estimado de entrega (si está disponible)",
      "relevancia_score": "0-100 (qué tan relevante es esta fuente)"
    }
  ],
  "alternativas_similares": [
    {
      "nombre": "Producto alternativo comparable",
      "razon": "Por qué es una alternativa válida",
      "marca": "Marca alternativa"
    }
  ],
  "informacion_adicional": {
    "certificaciones": "Certificaciones relevantes (ISO, CE, etc.)",
    "ficha_tecnica_url": "URL de ficha técnica PDF si está disponible",
    "imagenes_urls": ["URLs de imágenes del producto"],
    "notas_importantes": "Cualquier información relevante para el cotizador"
  },
  "validacion": {
    "producto_encontrado": true/false,
    "confianza": "0-100 (qué tan seguro estás de que es el producto correcto)",
    "advertencias": "Cualquier duda o advertencia sobre los resultados"
  }
}

CRITERIOS DE VALIDACIÓN:
- Si el producto tiene marca específica (ej: SIKAFLEX-227), busca EXACTAMENTE esa marca
- Si el producto tiene especificaciones técnicas (300ml, 300X4.8mm), valida que coincidan
- Prioriza proveedores con información de contacto completa
- Descarta resultados genéricos o no relacionados
- Si no encuentras información de Perú, busca proveedores internacionales con envío a Perú

PRIORIDAD DE BÚSQUEDA:
1. **Ecommerce de EFC** (empresas.efc.com.pe) - SIEMPRE BUSCAR PRIMERO AQUÍ
2. Proveedores industriales en Perú
3. Distribuidores autorizados en Perú
4. Marketplaces B2B peruanos (Mercado Libre Perú, etc.)
5. Fabricantes internacionales con distribución en Perú
6. Proveedores internacionales confiables

EJEMPLO DE RESPUESTA cuando NO se encuentra en EFC:
{
  "resultados_efc": {
    "encontrado_en_efc": false,
    "productos_efc": [],
    "mensaje": "No se encontraron resultados en el ecommerce de EFC para este producto"
  },
  "producto_confirmado": { ... },
  ...resto de campos...
}

EJEMPLO DE RESPUESTA cuando SÍ se encuentra en EFC:
{
  "resultados_efc": {
    "encontrado_en_efc": true,
    "productos_efc": [
      {
        "nombre": "GUANTE SHOWA 377 TALLA L",
        "url": "https://empresas.efc.com.pe/producto/guante-showa-377",
        "codigo": "SHOWA-377-L",
        "descripcion": "Guante de nitrilo SHOWA 377",
        "coincidencia": "95"
      }
    ],
    "mensaje": "Encontrado en el catálogo de EFC"
  },
  "producto_confirmado": { ... },
  ...resto de campos...
}

Responde SOLO con el JSON válido completo, sin markdown ni comentarios adicionales.`;

      // Call the new API with Google Search Grounding enabled
      const result = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash', // Using Gemini 2.5 Flash for better performance and grounding support
        contents: prompt,
        config,
      });

      const text = result.text.trim();

      this.logger.debug(`Internet search response length: ${text.length} chars`);

      // Remove markdown code blocks if present
      let jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      // Try to extract JSON object using regex if direct parsing fails
      let searchResults;
      try {
        searchResults = JSON.parse(jsonText);
      } catch (parseError) {
        this.logger.warn(`Initial JSON parse failed, attempting to extract JSON object...`);

        // Try to find JSON object boundaries
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            // Clean common JSON issues
            let cleanedJson = jsonMatch[0]
              // Remove trailing commas before closing braces/brackets
              .replace(/,(\s*[}\]])/g, '$1')
              // Remove comments
              .replace(/\/\/.*$/gm, '')
              .replace(/\/\*[\s\S]*?\*\//g, '');

            searchResults = JSON.parse(cleanedJson);
            this.logger.log(`Successfully parsed JSON after cleanup`);
          } catch (cleanupError) {
            this.logger.error(`JSON cleanup failed: ${cleanupError.message}`);
            throw parseError; // Throw original error
          }
        } else {
          throw parseError;
        }
      }

      this.logger.log(`Internet search completed for: ${descripcionProducto}`);

      return searchResults;
    } catch (error) {
      this.logger.error(`Failed to search product on internet: ${error.message}`, error.stack);
      return {
        resultados_efc: {
          encontrado_en_efc: false,
          productos_efc: [],
          mensaje: 'Error al buscar en EFC',
        },
        producto_confirmado: null,
        proveedores: [],
        alternativas_similares: [],
        informacion_adicional: {},
        validacion: {
          producto_encontrado: false,
          confianza: 0,
          advertencias: `Error en búsqueda: ${error.message}`,
        },
      };
    }
  }

  /**
   * PARALLEL MINI-SEARCH 1: Find suppliers in Peru
   * Fast focused search for local suppliers (5-7s target)
   */
  async searchSuppliersInPeru(descripcionProducto: string, efcProductsInfo?: any[]): Promise<any> {
    try {
      this.logger.log(`[MINI-SEARCH 1] Searching suppliers in Peru: ${descripcionProducto}`);

      const { GoogleGenAI } = await import('@google/genai');
      const aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const config = {
        tools: [{ googleSearch: {} }],
        generationConfig: {
          temperature: 0.3,
          topP: 0.8,
          topK: 20,
          maxOutputTokens: 1024, // Very focused, less tokens
        },
      };

      const efcContext = efcProductsInfo && efcProductsInfo.length > 0 ?
        `\n\nEFC ya tiene: ${efcProductsInfo.map(p => p.descripcion).join(', ')}` : '';

      const prompt = `Busca PROVEEDORES en Perú para: "${descripcionProducto}"${efcContext}

Responde SOLO con JSON válido:
{
  "proveedores": [
    {
      "nombre": "Nombre empresa",
      "tipo": "distribuidor|fabricante|importador",
      "telefono": "Teléfono",
      "email": "Email",
      "whatsapp": "WhatsApp",
      "url": "URL"
    }
  ]
}

ENFOQUE:
- Solo proveedores de Perú
- Top 5 más relevantes
- Con datos de contacto reales
- Priorizados por relevancia`;

      const result = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config,
      });

      const text = result.text.trim();
      const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      try {
        const parsed = JSON.parse(jsonText);
        this.logger.log(`[MINI-SEARCH 1] Found ${parsed.proveedores?.length || 0} suppliers`);
        return parsed;
      } catch (parseError) {
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0].replace(/,(\s*[}\]])/g, '$1'));
        }
        throw parseError;
      }
    } catch (error) {
      this.logger.error(`[MINI-SEARCH 1] Failed: ${error.message}`);
      return { proveedores: [] };
    }
  }

  /**
   * PARALLEL MINI-SEARCH 2: Get technical specifications
   * Fast focused search for product specs (5-6s target)
   */
  async searchTechnicalSpecs(descripcionProducto: string): Promise<any> {
    try {
      this.logger.log(`[MINI-SEARCH 2] Searching technical specs: ${descripcionProducto}`);

      const { GoogleGenAI } = await import('@google/genai');
      const aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const config = {
        tools: [{ googleSearch: {} }],
        generationConfig: {
          temperature: 0.3,
          topP: 0.8,
          topK: 20,
          maxOutputTokens: 1024,
        },
      };

      const prompt = `Busca ESPECIFICACIONES TÉCNICAS de: "${descripcionProducto}"

Responde SOLO con JSON válido:
{
  "especificaciones": {
    "marca": "Marca",
    "modelo": "Modelo",
    "medidas": "Dimensiones",
    "material": "Material",
    "certificaciones": "Certificaciones",
    "normas": "Normas aplicables",
    "ficha_tecnica_url": "URL PDF ficha técnica"
  },
  "usos": {
    "aplicaciones": ["Lista de aplicaciones"],
    "industrias": ["Industrias donde se usa"]
  }
}

ENFOQUE:
- Especificaciones técnicas clave
- Usos y aplicaciones
- Certificaciones relevantes
- URL de ficha técnica si existe`;

      const result = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config,
      });

      const text = result.text.trim();
      const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      try {
        const parsed = JSON.parse(jsonText);
        this.logger.log(`[MINI-SEARCH 2] Technical specs retrieved`);
        return parsed;
      } catch (parseError) {
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0].replace(/,(\s*[}\]])/g, '$1'));
        }
        throw parseError;
      }
    } catch (error) {
      this.logger.error(`[MINI-SEARCH 2] Failed: ${error.message}`);
      return { especificaciones: {}, usos: {} };
    }
  }

  /**
   * PARALLEL MINI-SEARCH 3: Find reference prices
   * Fast focused search for pricing information (6-8s target)
   */
  async searchReferencePrices(descripcionProducto: string): Promise<any> {
    try {
      this.logger.log(`[MINI-SEARCH 3] Searching reference prices: ${descripcionProducto}`);

      const { GoogleGenAI } = await import('@google/genai');
      const aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const config = {
        tools: [{ googleSearch: {} }],
        generationConfig: {
          temperature: 0.3,
          topP: 0.8,
          topK: 20,
          maxOutputTokens: 1024,
        },
      };

      const prompt = `Busca PRECIOS REFERENCIALES en Perú de: "${descripcionProducto}"

Responde SOLO con JSON válido:
{
  "precios": [
    {
      "proveedor": "Nombre",
      "precio": "Precio en PEN o USD",
      "moneda": "PEN|USD",
      "unidad": "Unidad de venta",
      "disponibilidad": "En stock|Bajo pedido",
      "tiempo_entrega": "Días de entrega",
      "url": "URL fuente"
    }
  ],
  "rango_precio": {
    "minimo": "Precio mínimo encontrado",
    "maximo": "Precio máximo encontrado",
    "promedio": "Precio promedio estimado",
    "moneda": "PEN|USD"
  }
}

ENFOQUE:
- Precios de mercado peruano
- Diferentes proveedores
- Rango de precios
- Disponibilidad actual`;

      const result = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config,
      });

      const text = result.text.trim();
      const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      try {
        const parsed = JSON.parse(jsonText);
        this.logger.log(`[MINI-SEARCH 3] Found ${parsed.precios?.length || 0} price references`);
        return parsed;
      } catch (parseError) {
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0].replace(/,(\s*[}\]])/g, '$1'));
        }
        throw parseError;
      }
    } catch (error) {
      this.logger.error(`[MINI-SEARCH 3] Failed: ${error.message}`);
      return { precios: [], rango_precio: {} };
    }
  }

  /**
   * PARALLEL MINI-SEARCH 4: Find similar alternatives
   * Fast focused search for alternative products (5-7s target)
   */
  async searchAlternatives(descripcionProducto: string): Promise<any> {
    try {
      this.logger.log(`[MINI-SEARCH 4] Searching alternatives: ${descripcionProducto}`);

      const { GoogleGenAI } = await import('@google/genai');
      const aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const config = {
        tools: [{ googleSearch: {} }],
        generationConfig: {
          temperature: 0.3,
          topP: 0.8,
          topK: 20,
          maxOutputTokens: 1024,
        },
      };

      const prompt = `Busca PRODUCTOS ALTERNATIVOS para: "${descripcionProducto}"

Responde SOLO con JSON válido:
{
  "alternativas": [
    {
      "nombre": "Nombre producto alternativo",
      "marca": "Marca",
      "razon": "Por qué es alternativa válida",
      "ventajas": "Ventajas vs original",
      "desventajas": "Desventajas vs original",
      "compatibilidad": "Nivel de compatibilidad 0-100"
    }
  ]
}

ENFOQUE:
- Solo alternativas COMPATIBLES
- Mismo uso/aplicación
- Marcas disponibles en Perú
- Top 3-5 alternativas
- Clarificar pros/cons`;

      const result = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config,
      });

      const text = result.text.trim();
      const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      try {
        const parsed = JSON.parse(jsonText);
        this.logger.log(`[MINI-SEARCH 4] Found ${parsed.alternativas?.length || 0} alternatives`);
        return parsed;
      } catch (parseError) {
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0].replace(/,(\s*[}\]])/g, '$1'));
        }
        throw parseError;
      }
    } catch (error) {
      this.logger.error(`[MINI-SEARCH 4] Failed: ${error.message}`);
      return { alternativas: [] };
    }
  }
}
