import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { TokenUsage, estimateTokens } from '../common/cost-tracking';

@Injectable()
export class GeminiEmbeddingService {
  private readonly logger = new Logger(GeminiEmbeddingService.name);
  private readonly genAI: GoogleGenerativeAI;
  private readonly apiKey: string;
  private readonly embeddingModel: string = 'gemini-embedding-001';
  private readonly visionModel: string = 'gemini-2.0-flash-exp';

  // OpenAI client for RTI filter (faster than Gemini)
  private readonly openaiClient: OpenAI | null = null;
  private readonly openaiModel: string = 'gpt-4o';

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get('GEMINI_API_KEY');
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    this.genAI = new GoogleGenerativeAI(this.apiKey);
    this.logger.log('Gemini AI initialized with gemini-embedding-001 (3072 dims)');

    // Initialize OpenAI client for RTI filter
    const openaiApiKey = this.configService.get('OPENAI_API_KEY');
    if (openaiApiKey) {
      this.openaiClient = new OpenAI({ apiKey: openaiApiKey });
      this.logger.log('OpenAI initialized with gpt-4o for RTI filter');
    } else {
      this.logger.warn('OPENAI_API_KEY not configured - RTI filter will use Gemini (slower)');
    }
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

  /**
   * Generate embedding with token usage tracking
   * Returns both the embedding vector and token usage information
   */
  async generateEmbeddingWithTracking(text: string): Promise<{
    embedding: number[];
    usage: TokenUsage;
  }> {
    const embedding = await this.generateEmbedding(text);

    // Estimate tokens from input text
    // Gemini embedding only has input tokens (no output)
    const inputTokens = estimateTokens(text);

    return {
      embedding,
      usage: {
        model: this.embeddingModel,
        inputTokens,
        outputTokens: 0,
        totalTokens: inputTokens,
      },
    };
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      if (!texts || texts.length === 0) {
        return [];
      }

      // Filter out empty texts and track original indices
      const validTextsWithIndices: { text: string; originalIndex: number }[] = [];
      texts.forEach((t, idx) => {
        if (t && t.trim().length > 0) {
          validTextsWithIndices.push({ text: t.trim(), originalIndex: idx });
        }
      });

      if (validTextsWithIndices.length === 0) {
        return [];
      }

      const embeddings: number[][] = new Array(texts.length).fill(null);

      // Use TRUE batch API - process 20 texts per request (conservative but fast)
      // Gemini supports up to 100, but 20 is safer for rate limits
      const batchSize = parseInt(process.env.GEMINI_BATCH_SIZE || '20', 10);
      const maxRetries = 3;

      for (let i = 0; i < validTextsWithIndices.length; i += batchSize) {
        const batch = validTextsWithIndices.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(validTextsWithIndices.length / batchSize);

        this.logger.debug(`Processing TRUE batch ${batchNum}/${totalBatches} (${batch.length} texts)`);

        let lastError: Error | null = null;
        let success = false;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            // Build batch request payload for batchEmbedContents API
            const payload = {
              requests: batch.map(item => ({
                model: 'models/gemini-embedding-001',
                content: {
                  parts: [{ text: item.text }],
                },
              })),
            };

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for batch

            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${this.apiKey}`,
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
              const errorData = await response.text();
              lastError = new Error(`Batch API returned ${response.status}: ${errorData.substring(0, 300)}`);

              // Retry on rate limit or server errors
              if ((response.status === 429 || response.status === 503 || response.status === 504) && attempt < maxRetries - 1) {
                const backoffDelay = Math.pow(2, attempt + 1) * 2000; // 4s, 8s, 16s
                this.logger.warn(`Batch rate limit/error (${response.status}), retrying in ${backoffDelay}ms (attempt ${attempt + 1}/${maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
                continue;
              }

              throw lastError;
            }

            const data = await response.json();

            // Process batch response - embeddings array matches request order
            if (data.embeddings && Array.isArray(data.embeddings)) {
              data.embeddings.forEach((emb: any, idx: number) => {
                if (emb.values && batch[idx]) {
                  embeddings[batch[idx].originalIndex] = emb.values;
                }
              });
              success = true;
              this.logger.debug(`Batch ${batchNum}/${totalBatches} completed: ${data.embeddings.length} embeddings`);
              break; // Success, exit retry loop
            } else {
              throw new Error('Invalid batch response structure');
            }
          } catch (batchError) {
            lastError = batchError as Error;
            if (attempt < maxRetries - 1) {
              const backoffDelay = Math.pow(2, attempt + 1) * 2000;
              this.logger.warn(`Batch ${batchNum} attempt ${attempt + 1} failed, retrying in ${backoffDelay}ms: ${lastError.message}`);
              await new Promise(resolve => setTimeout(resolve, backoffDelay));
            }
          }
        }

        if (!success && lastError) {
          this.logger.error(`Batch ${batchNum} failed after ${maxRetries} attempts: ${lastError.message}`);
          throw lastError;
        }

        // Small delay between batches to avoid rate limits (configurable)
        const delayBetweenBatches = parseInt(process.env.GEMINI_BATCH_DELAY_MS || '500', 10);
        if (i + batchSize < validTextsWithIndices.length) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      }

      // Filter out any null entries (shouldn't happen, but safety check)
      const finalEmbeddings = embeddings.filter(e => e !== null);

      if (finalEmbeddings.length !== validTextsWithIndices.length) {
        this.logger.warn(`Expected ${validTextsWithIndices.length} embeddings, got ${finalEmbeddings.length}`);
      }

      return finalEmbeddings;
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
   * Compare two product descriptions using embeddings and optionally LLM
   * Returns similarity score and classification based on RTI scale
   */
  async compareProductDescriptions(
    descripcion1: string,
    descripcion2: string,
    marca1?: string,
    marca2?: string,
    useLLMFilter: boolean = false,
  ): Promise<{
    similarity: number;
    metodo: 'embedding' | 'embedding+llm';
    clasificacion?: string;
    razon?: string;
    detalles?: {
      tipo_producto: { match: boolean; nota: string };
      especificaciones: { match: boolean; nota: string };
      marca: { match: boolean; nota: string };
      intercambiable: boolean;
    };
    embedding_similarity: number;
    duracion_ms: number;
  }> {
    const startTime = Date.now();

    try {
      // Build full text for embedding including brand if available
      const text1 = marca1 ? `${descripcion1} ${marca1}` : descripcion1;
      const text2 = marca2 ? `${descripcion2} ${marca2}` : descripcion2;

      // Generate embeddings for both products
      const [embedding1, embedding2] = await Promise.all([
        this.generateEmbedding(text1),
        this.generateEmbedding(text2),
      ]);

      // Calculate cosine similarity
      const similarity = this.cosineSimilarity(embedding1, embedding2);
      const duracion_ms = Date.now() - startTime;

      // If only using embeddings, return basic result
      if (!useLLMFilter) {
        return {
          similarity,
          metodo: 'embedding',
          embedding_similarity: similarity,
          duracion_ms,
        };
      }

      // Use LLM for detailed comparison
      const model = this.genAI.getGenerativeModel({ model: this.visionModel });

      const prompt = `Eres un experto en productos industriales de ferretería.

TAREA: Comparar dos productos y determinar su nivel de similitud/intercambiabilidad.

PRODUCTO 1:
Descripción: ${descripcion1}
Marca: ${marca1 || 'No especificada'}

PRODUCTO 2:
Descripción: ${descripcion2}
Marca: ${marca2 || 'No especificada'}

SIMILITUD SEMÁNTICA (embeddings): ${(similarity * 100).toFixed(1)}%

CRITERIOS DE COMPARACIÓN:
1. TIPO DE PRODUCTO - ¿Son el mismo tipo? (ej: ambos son llaves mixtas)
2. ESPECIFICACIONES - ¿Coinciden medidas, dimensiones, capacidades?
3. MARCA - ¿Son la misma marca o marcas diferentes?
4. MATERIAL/CALIDAD - ¿Son de calidad comparable?
5. USO PREVISTO - ¿Sirven para el mismo propósito?

ESCALA RTI (Relevancia Técnica Industrial):
- 1.00: EXACTO - Mismo producto exacto (incluyendo marca)
- 0.95: EQUIVALENTE - Mismo producto, nomenclatura diferente (6"=152mm, MIXTA=COMBINADA)
- 0.85: SUSTITUTO_PERFECTO - Intercambiables sin diferencia funcional (misma spec, marca diff)
- 0.70: SUSTITUTO_VALIDO - Intercambiables con pequeñas diferencias
- 0.50: MISMA_CATEGORIA - Mismo tipo, specs diferentes
- 0.30: RELACIONADO - Complementarios o accesorios
- 0.10: IRRELEVANTE - Sin relación funcional directa

Responde SOLO con JSON válido (sin markdown):
{
  "similarity": 0.85,
  "clasificacion": "SUSTITUTO_PERFECTO",
  "razon": "Explicación detallada de máximo 50 palabras",
  "detalles": {
    "tipo_producto": { "match": true, "nota": "Ambos son llaves mixtas" },
    "especificaciones": { "match": true, "nota": "18mm exacto" },
    "marca": { "match": false, "nota": "Stanley vs Truper" },
    "intercambiable": true
  }
}`;

      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text().trim();

      // Remove markdown code blocks if present
      const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const llmResult = JSON.parse(jsonText);

      const finalDuration = Date.now() - startTime;

      return {
        similarity: llmResult.similarity || similarity,
        metodo: 'embedding+llm',
        clasificacion: llmResult.clasificacion,
        razon: llmResult.razon,
        detalles: llmResult.detalles,
        embedding_similarity: similarity,
        duracion_ms: finalDuration,
      };
    } catch (error) {
      const duracion_ms = Date.now() - startTime;
      this.logger.error(`Failed to compare products: ${error.message}`);

      // Return embedding-only result on LLM failure
      return {
        similarity: 0,
        metodo: 'embedding',
        razon: `Error en comparación: ${error.message}`,
        embedding_similarity: 0,
        duracion_ms,
      };
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

  /**
   * Filter search results semantically using LLM to ensure relevance
   * Evaluates each product to determine if it matches the user's search intent
   * Uses OpenAI GPT-4o for faster response times (Gemini as fallback)
   */
  async filterSearchResults(
    query: string,
    products: Array<{ id: string; descripcion: string; marca?: string; categoria?: string; codigo?: string; score: number }>,
  ): Promise<Array<{ id: string; match: boolean; confidence: number; score_rti: number; categoria_rti: string; reason: string; adjustedScore: number }>> {
    try {
      if (products.length === 0) {
        return [];
      }

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

        const prompt = `Eres un experto en RELEVANCIA TÉCNICA INDUSTRIAL (RTI). Evalúa cada producto según qué tan útil sería para un cliente que busca: "${query}"

PRODUCTOS A EVALUAR:
${productsText}

ESCALA RTI (Relevancia Técnica Industrial) - 8 NIVELES:

| Score | Categoría         | Descripción                                      | Ejemplo                                           |
|-------|-------------------|--------------------------------------------------|---------------------------------------------------|
| 1.00  | EXACTO            | Producto idéntico (mismo SKU/modelo)             | Query "LLAVE MIXTA 13MM STANLEY" → "LLAVE MIXTA 13MM STANLEY 86-858" |
| 0.95  | EQUIVALENTE       | Mismas specs, nomenclatura diferente             | Query "LLAVE MIXTA 13MM" → "LLAVE COMBINADA 13 MILIMETROS" |
| 0.85  | SUSTITUTO_PERFECTO| Misma función/specs, diferente marca             | Query "LLAVE MIXTA 13MM STANLEY" → "LLAVE MIXTA 13MM TRUPER" |
| 0.70  | SUSTITUTO_VALIDO  | Misma función, specs compatibles/cercanas        | Query "LLAVE MIXTA 13MM" → "LLAVE MIXTA 12MM" |
| 0.50  | MISMA_CATEGORIA   | Mismo tipo producto, specs diferentes            | Query "LLAVE MIXTA 13MM" → "LLAVE MIXTA 24MM" |
| 0.30  | RELACIONADO       | Complementario o accesorio                       | Query "LLAVE MIXTA 13MM" → "ORGANIZADOR DE LLAVES" |
| 0.10  | IRRELEVANTE       | Sin relación funcional                           | Query "LLAVE MIXTA 13MM" → "PINTURA LATEX BLANCO" |
| 0.00  | RECHAZADO         | Producto completamente diferente                 | Query "LLAVE MIXTA 13MM" → "PAPEL HIGIÉNICO" |

REGLAS DE EVALUACIÓN:

1. TIPO DE PRODUCTO: Productos del mismo tipo base suben a >=0.50
2. ESPECIFICACIONES: Mismas specs sube a >=0.85, specs cercanas 0.70, diferentes 0.50
3. MARCA: Si se especificó marca y no coincide, máximo 0.85 (SUSTITUTO_PERFECTO)
4. NOMENCLATURA: "MIXTA"="COMBINADA", "MM"="MILIMETROS", 13MM=13 MILIMETROS => EQUIVALENTE (0.95)

EJEMPLOS PRÁCTICOS:
- Query "LLAVE MIXTA 13MM STANLEY" + "LLAVE MIXTA 13MM STANLEY 86-858" => score=1.00, categoria="EXACTO"
- Query "LLAVE MIXTA 13MM" + "LLAVE COMBINADA 13 MILIMETROS TRUPER" => score=0.95, categoria="EQUIVALENTE"
- Query "LLAVE MIXTA 13MM STANLEY" + "LLAVE MIXTA 13MM TRUPER" => score=0.85, categoria="SUSTITUTO_PERFECTO"
- Query "LLAVE MIXTA 13MM" + "LLAVE MIXTA 14MM" => score=0.70, categoria="SUSTITUTO_VALIDO"
- Query "LLAVE MIXTA 13MM" + "LLAVE MIXTA 24MM" => score=0.50, categoria="MISMA_CATEGORIA"
- Query "LLAVE MIXTA 13MM" + "DESARMADOR PLANO" => score=0.10, categoria="IRRELEVANTE"

Responde SOLO con un array JSON válido (sin markdown, sin comentarios):
[
  {
    "id": "id del producto",
    "score_rti": número (0.00, 0.10, 0.30, 0.50, 0.70, 0.85, 0.95, o 1.00),
    "categoria": "EXACTO|EQUIVALENTE|SUSTITUTO_PERFECTO|SUSTITUTO_VALIDO|MISMA_CATEGORIA|}RELACIONADO|IRRELEVANTE|RECHAZADO",
    "reason": "breve explicación (máx 15 palabras)"
  }
]`;

        // Use OpenAI GPT-4o if available (faster), otherwise fall back to Gemini
        let text: string;

        if (this.openaiClient) {
          // OpenAI GPT-4o path (preferred - faster)
          let retryCount = 0;
          const maxRetries = 3;
          const baseDelay = 1000;

          while (retryCount <= maxRetries) {
            try {
              const completion = await this.openaiClient.chat.completions.create({
                model: this.openaiModel,
                messages: [
                  {
                    role: 'system',
                    content: 'Eres un experto en productos industriales y ferretería. Respondes SOLO con JSON válido, sin markdown ni comentarios.',
                  },
                  {
                    role: 'user',
                    content: prompt,
                  },
                ],
                temperature: 0.1, // Low temperature for consistent results
                max_tokens: 2000,
              });

              text = completion.choices[0]?.message?.content?.trim() || '';
              break; // Success
            } catch (retryError: any) {
              const isRateLimited = retryError.status === 429 ||
                                    retryError.message?.includes('rate') ||
                                    retryError.message?.includes('quota');

              if (isRateLimited && retryCount < maxRetries) {
                retryCount++;
                const delay = (baseDelay * Math.pow(2, retryCount - 1)) + Math.random() * 500;
                this.logger.warn(`OpenAI rate limited, retry ${retryCount}/${maxRetries} in ${Math.round(delay)}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
              } else {
                throw retryError;
              }
            }
          }
        } else {
          // Gemini fallback path (slower but works without OpenAI key)
          const model = this.genAI.getGenerativeModel({ model: this.visionModel });
          let retryCount = 0;
          const maxRetries = 3;
          const baseDelay = 1000;

          let result;
          while (retryCount <= maxRetries) {
            try {
              result = await model.generateContent(prompt);
              break;
            } catch (retryError: any) {
              const isRateLimited = retryError.message?.includes('429') ||
                                    retryError.message?.includes('quota') ||
                                    retryError.message?.includes('rate');

              if (isRateLimited && retryCount < maxRetries) {
                retryCount++;
                const delay = (baseDelay * Math.pow(2, retryCount - 1)) + Math.random() * 500;
                this.logger.warn(`Gemini rate limited, retry ${retryCount}/${maxRetries} in ${Math.round(delay)}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
              } else {
                throw retryError;
              }
            }
          }

          if (!result) {
            throw new Error('Failed to get response from Gemini after retries');
          }

          text = result.response.text().trim();
        }

        // Remove markdown code blocks if present
        const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        const batchResults = JSON.parse(jsonText);

        // Validate and merge results
        if (Array.isArray(batchResults)) {
          batchResults.forEach((item) => {
            if (item.id && (typeof item.score_rti === 'number' || typeof item.match === 'boolean')) {
              // Find original product to get score
              const originalProduct = batch.find(p => p.id === item.id);
              const originalScore = originalProduct?.score || 0;

              // New RTI-based scoring
              const scoreRti = item.score_rti ?? (item.match ? 0.85 : 0.10); // Fallback for old format
              const categoria = item.categoria || (item.match ? 'SUSTITUTO_PERFECTO' : 'IRRELEVANTE');

              // Use RTI score directly - it already represents the relevance
              // Blend original vectorial score with RTI for final adjusted score
              // RTI score has more weight (70%) than vectorial (30%)
              const adjustedScore = (scoreRti * 0.70) + (originalScore * 0.30);

              results.push({
                id: item.id,
                match: scoreRti >= 0.50, // MISMA_CATEGORIA or better = match
                confidence: scoreRti,
                score_rti: scoreRti,
                categoria_rti: categoria,
                reason: item.reason || 'Sin razón',
                adjustedScore,
              });
            }
          });
        }

        // Add delay between batches to avoid rate limiting (shorter for OpenAI)
        if (i + batchSize < products.length) {
          const delayMs = this.openaiClient ? 100 : 300; // OpenAI is faster, less delay needed
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      const provider = this.openaiClient ? 'OpenAI GPT-4o' : 'Gemini';
      this.logger.log(`[${provider}] RTI filtered ${products.length} products: ${results.filter(r => r.match).length} matches`);
      return results;
    } catch (error) {
      this.logger.error(`Failed to filter search results: ${error.message}`);
      // On error, return products with their original vectorial scores as RTI scores
      // This allows searches to still return results when LLM is unavailable
      const isRateLimited = error.message?.includes('429') || error.message?.includes('quota');
      const reason = isRateLimited
        ? 'LLM no disponible (rate limit) - usando score vectorial'
        : `Error en filtrado RTI: ${error.message}`;

      return products.map(p => ({
        id: p.id,
        match: p.score >= 0.65, // Use vectorial threshold
        confidence: p.score,
        score_rti: p.score, // Use original vectorial score instead of 0.50
        categoria_rti: 'FALLBACK_VECTORIAL',
        reason,
        adjustedScore: p.score, // Keep original score
      }));
    }
  }

  /**
   * Filter search results with token usage tracking
   * Same as filterSearchResults but returns usage information for cost tracking
   */
  async filterSearchResultsWithTracking(
    query: string,
    products: Array<{ id: string; descripcion: string; marca?: string; categoria?: string; codigo?: string; score: number }>,
  ): Promise<{
    results: Array<{ id: string; match: boolean; confidence: number; score_rti: number; categoria_rti: string; reason: string; adjustedScore: number }>;
    usage: TokenUsage;
  }> {
    // Track total tokens across batches
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const model = this.openaiClient ? this.openaiModel : this.visionModel;

    try {
      if (products.length === 0) {
        return {
          results: [],
          usage: { model, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        };
      }

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

        const prompt = `Eres un experto en RELEVANCIA TÉCNICA INDUSTRIAL (RTI). Evalúa cada producto según qué tan útil sería para un cliente que busca: "${query}"

PRODUCTOS A EVALUAR:
${productsText}

ESCALA RTI (Relevancia Técnica Industrial) - 8 NIVELES:

| Score | Categoría         | Descripción                                      | Ejemplo                                           |
|-------|-------------------|--------------------------------------------------|---------------------------------------------------|
| 1.00  | EXACTO            | Producto idéntico (mismo SKU/modelo)             | Query "LLAVE MIXTA 13MM STANLEY" → "LLAVE MIXTA 13MM STANLEY 86-858" |
| 0.95  | EQUIVALENTE       | Mismas specs, nomenclatura diferente             | Query "LLAVE MIXTA 13MM" → "LLAVE COMBINADA 13 MILIMETROS" |
| 0.85  | SUSTITUTO_PERFECTO| Misma función/specs, diferente marca             | Query "LLAVE MIXTA 13MM STANLEY" → "LLAVE MIXTA 13MM TRUPER" |
| 0.70  | SUSTITUTO_VALIDO  | Misma función, specs compatibles/cercanas        | Query "LLAVE MIXTA 13MM" → "LLAVE MIXTA 12MM" |
| 0.50  | MISMA_CATEGORIA   | Mismo tipo producto, specs diferentes            | Query "LLAVE MIXTA 13MM" → "LLAVE MIXTA 24MM" |
| 0.30  | RELACIONADO       | Complementario o accesorio                       | Query "LLAVE MIXTA 13MM" → "ORGANIZADOR DE LLAVES" |
| 0.10  | IRRELEVANTE       | Sin relación funcional                           | Query "LLAVE MIXTA 13MM" → "PINTURA LATEX BLANCO" |
| 0.00  | RECHAZADO         | Producto completamente diferente                 | Query "LLAVE MIXTA 13MM" → "PAPEL HIGIÉNICO" |

REGLAS DE EVALUACIÓN:
1. TIPO DE PRODUCTO: Productos del mismo tipo base suben a >=0.50
2. ESPECIFICACIONES: Mismas specs sube a >=0.85, specs cercanas 0.70, diferentes 0.50
3. MARCA: Si se especificó marca y no coincide, máximo 0.85 (SUSTITUTO_PERFECTO)
4. NOMENCLATURA: "MIXTA"="COMBINADA", "MM"="MILIMETROS", 13MM=13 MILIMETROS => EQUIVALENTE (0.95)

Responde SOLO con un array JSON válido (sin markdown, sin comentarios):
[
  {
    "id": "id del producto",
    "score_rti": número (0.00, 0.10, 0.30, 0.50, 0.70, 0.85, 0.95, o 1.00),
    "categoria": "EXACTO|EQUIVALENTE|SUSTITUTO_PERFECTO|SUSTITUTO_VALIDO|MISMA_CATEGORIA|RELACIONADO|IRRELEVANTE|RECHAZADO",
    "reason": "breve explicación (máx 15 palabras)"
  }
]`;

        let text: string;

        if (this.openaiClient) {
          // OpenAI GPT-4o path - capture usage from response
          let retryCount = 0;
          const maxRetries = 3;
          const baseDelay = 1000;

          while (retryCount <= maxRetries) {
            try {
              const completion = await this.openaiClient.chat.completions.create({
                model: this.openaiModel,
                messages: [
                  {
                    role: 'system',
                    content: 'Eres un experto en productos industriales y ferretería. Respondes SOLO con JSON válido, sin markdown ni comentarios.',
                  },
                  {
                    role: 'user',
                    content: prompt,
                  },
                ],
                temperature: 0.1,
                max_tokens: 2000,
              });

              text = completion.choices[0]?.message?.content?.trim() || '';

              // Capture token usage from OpenAI response
              if (completion.usage) {
                totalInputTokens += completion.usage.prompt_tokens || 0;
                totalOutputTokens += completion.usage.completion_tokens || 0;
              }

              break;
            } catch (retryError: any) {
              const isRateLimited = retryError.status === 429 ||
                                    retryError.message?.includes('rate') ||
                                    retryError.message?.includes('quota');

              if (isRateLimited && retryCount < maxRetries) {
                retryCount++;
                const delay = (baseDelay * Math.pow(2, retryCount - 1)) + Math.random() * 500;
                this.logger.warn(`OpenAI rate limited, retry ${retryCount}/${maxRetries} in ${Math.round(delay)}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
              } else {
                throw retryError;
              }
            }
          }
        } else {
          // Gemini fallback - estimate tokens from prompt and response
          const geminiModel = this.genAI.getGenerativeModel({ model: this.visionModel });
          let retryCount = 0;
          const maxRetries = 3;
          const baseDelay = 1000;

          let result;
          while (retryCount <= maxRetries) {
            try {
              result = await geminiModel.generateContent(prompt);
              break;
            } catch (retryError: any) {
              const isRateLimited = retryError.message?.includes('429') ||
                                    retryError.message?.includes('quota') ||
                                    retryError.message?.includes('rate');

              if (isRateLimited && retryCount < maxRetries) {
                retryCount++;
                const delay = (baseDelay * Math.pow(2, retryCount - 1)) + Math.random() * 500;
                this.logger.warn(`Gemini rate limited, retry ${retryCount}/${maxRetries} in ${Math.round(delay)}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
              } else {
                throw retryError;
              }
            }
          }

          if (!result) {
            throw new Error('Failed to get response from Gemini after retries');
          }

          text = result.response.text().trim();

          // Estimate tokens for Gemini (no direct usage API in current SDK)
          totalInputTokens += estimateTokens(prompt);
          totalOutputTokens += estimateTokens(text);
        }

        // Parse and process results
        const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const batchResults = JSON.parse(jsonText);

        if (Array.isArray(batchResults)) {
          batchResults.forEach((item) => {
            if (item.id && (typeof item.score_rti === 'number' || typeof item.match === 'boolean')) {
              const originalProduct = batch.find(p => p.id === item.id);
              const originalScore = originalProduct?.score || 0;
              const scoreRti = item.score_rti ?? (item.match ? 0.85 : 0.10);
              const categoria = item.categoria || (item.match ? 'SUSTITUTO_PERFECTO' : 'IRRELEVANTE');
              const adjustedScore = (scoreRti * 0.70) + (originalScore * 0.30);

              results.push({
                id: item.id,
                match: scoreRti >= 0.50,
                confidence: scoreRti,
                score_rti: scoreRti,
                categoria_rti: categoria,
                reason: item.reason || 'Sin razón',
                adjustedScore,
              });
            }
          });
        }

        // Delay between batches
        if (i + batchSize < products.length) {
          const delayMs = this.openaiClient ? 100 : 300;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      const provider = this.openaiClient ? 'OpenAI GPT-4o' : 'Gemini';
      this.logger.log(`[${provider}] RTI filtered ${products.length} products: ${results.filter(r => r.match).length} matches | Tokens: ${totalInputTokens} in / ${totalOutputTokens} out`);

      return {
        results,
        usage: {
          model,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to filter search results with tracking: ${error.message}`);
      const isRateLimited = error.message?.includes('429') || error.message?.includes('quota');
      const reason = isRateLimited
        ? 'LLM no disponible (rate limit) - usando score vectorial'
        : `Error en filtrado RTI: ${error.message}`;

      return {
        results: products.map(p => ({
          id: p.id,
          match: p.score >= 0.65,
          confidence: p.score,
          score_rti: p.score,
          categoria_rti: 'FALLBACK_VECTORIAL',
          reason,
          adjustedScore: p.score,
        })),
        usage: {
          model,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
        },
      };
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
   * Validate if a product exists with LLM filtering to remove false positives
   * This method analyzes each candidate and confirms only true duplicates
   */
  async validateProductExistsWithFilter(
    newProduct: { descripcion: string; marca?: string; modelo?: string },
    existingProducts: Array<{
      id: string;
      codigoEFC: string;
      descripcion: string;
      marca?: string;
      similarity: number;
      enStock: boolean;
      fechaUltimaVenta: string | null;
    }>,
  ): Promise<{
    exists: boolean;
    isExactMatch: boolean;
    isVariant: boolean;
    reason: string;
    confidence: number;
    recommendation: 'reject' | 'accept' | 'review';
    confirmedDuplicates: Array<{
      codigoEFC: string;
      descripcion: string;
      marca?: string;
      similarity: number;
      enStock: boolean;
      fechaUltimaVenta: string | null;
      duplicateType: 'exact' | 'variant' | 'similar';
    }>;
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
          confirmedDuplicates: [],
        };
      }

      const model = this.genAI.getGenerativeModel({ model: this.visionModel });

      // Build product comparison with EFC codes
      const existingProductsText = existingProducts.slice(0, 10).map((p, idx) =>
        `PRODUCTO ${idx + 1}:
- Código EFC: ${p.codigoEFC}
- Descripción: ${p.descripcion}
- Marca: ${p.marca || 'Sin marca'}
- Similitud vectorial: ${(p.similarity * 100).toFixed(1)}%
- En Stock: ${p.enStock ? 'Sí' : 'No'}
- Última venta: ${p.fechaUltimaVenta ? new Date(p.fechaUltimaVenta).toLocaleDateString('es-PE') : 'N/A'}`
      ).join('\n\n');

      const prompt = `Eres un experto en catálogos de productos industriales y ferretería. Tu trabajo es FILTRAR falsos positivos y confirmar solo los verdaderos duplicados.

NUEVO PRODUCTO QUE SE QUIERE REGISTRAR:
Descripción: ${newProduct.descripcion}${newProduct.marca ? `\nMarca: ${newProduct.marca}` : ''}${newProduct.modelo ? `\nModelo/Código: ${newProduct.modelo}` : ''}

PRODUCTOS EXISTENTES CON SIMILITUD VECTORIAL ALTA:
${existingProductsText}

INSTRUCCIONES CRÍTICAS:
1. Analiza cada producto existente y determina si REALMENTE es:
   - DUPLICADO EXACTO: Es el mismo producto (solo difiere en typos, orden de palabras, abreviaciones)
   - VARIANTE: Mismo producto base pero diferente talla/color/tamaño/modelo
   - FALSO POSITIVO: Producto DIFERENTE que no debe considerarse duplicado

2. CRITERIOS PARA FALSO POSITIVO (NO es duplicado):
   - Productos de diferente categoría (ej: "LLAVE MIXTA" vs "LLAVE STILLSON" son diferentes)
   - Diferentes medidas que implican productos distintos (ej: "LLAVE 18MM" vs "LLAVE 11MM" son diferentes)
   - Diferentes funciones (ej: "MARTILLO DE UÑA" vs "MARTILLO DE BOLA" son diferentes)
   - Diferente marca SI el usuario especificó una marca concreta

3. CRITERIOS PARA DUPLICADO REAL:
   - Mismo producto con typos en marca (STANELY = STANLEY)
   - Mismo producto en diferente idioma (WRENCH = LLAVE)
   - Mismo producto con abreviaciones (PZAS = PIEZAS, CMT = CM)
   - Mismo número de parte/código de fabricante

RESPONDE SOLO con un objeto JSON válido (sin markdown):
{
  "exists": true/false,
  "isExactMatch": true/false,
  "isVariant": true/false,
  "reason": "explicación clara de tu decisión",
  "confidence": número entre 0 y 1,
  "recommendation": "reject" | "accept" | "review",
  "confirmedDuplicates": [
    {
      "codigoEFC": "código del producto confirmado",
      "descripcion": "descripción completa",
      "marca": "marca o vacío",
      "similarity": número original,
      "enStock": true/false,
      "fechaUltimaVenta": "fecha o null",
      "duplicateType": "exact" | "variant" | "similar"
    }
  ]
}

IMPORTANTE:
- Si NINGÚN producto es realmente duplicado, exists=false y confirmedDuplicates=[]
- Solo incluye en confirmedDuplicates los que SÍ son duplicados reales
- Sé ESTRICTO: es mejor dejar pasar un duplicado que marcar como duplicado algo que no lo es
- El usuario PIERDE CONFIANZA si marcas falsos positivos`;

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

      // Ensure confirmedDuplicates is an array
      if (!Array.isArray(validation.confirmedDuplicates)) {
        validation.confirmedDuplicates = [];
      }

      return validation;
    } catch (error) {
      this.logger.error(`Failed to validate product with filter: ${error.message}`);
      // Return a safe default - ask for review but include products for manual check
      return {
        exists: existingProducts.length > 0,
        isExactMatch: false,
        isVariant: false,
        reason: `Error en validación AI, se requiere revisión manual: ${error.message}`,
        confidence: 0,
        recommendation: 'review',
        confirmedDuplicates: existingProducts.slice(0, 5).map((p) => ({
          ...p,
          duplicateType: 'similar' as const,
        })),
      };
    }
  }

  // ============================================================================
  // INTERNET SEARCH / GROUNDING FUNCTIONS REMOVED FOR SECURITY
  // ============================================================================
  // The following functions were removed to eliminate Google Search Grounding
  // which was causing security alerts by visiting external URLs:
  // - quickIdentifyProduct()
  // - searchProductPhase1()
  // - searchProductPhase2()
  // - searchProductOnInternet()
  // - searchSuppliersInPeru()
  // - searchTechnicalSpecs()
  // - searchReferencePrices()
  // - searchAlternatives()
  //
  // If internet search functionality is needed in the future, implement it
  // with proper URL allowlisting and security controls.
  // ============================================================================
}
