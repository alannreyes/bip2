/**
 * Default Prompts for BIP2 RTI System
 *
 * These are the fallback prompts that are always available.
 * They can be overridden via the prompts management API.
 */

export const DEFAULT_PROMPTS = {
  /**
   * filter_search_results - Clasifica productos con Score RTI
   *
   * Placeholders:
   * - {{QUERY}} - La búsqueda del usuario
   * - {{PRODUCTS}} - Lista de productos JSON
   * - {{MIN_RELEVANCIA}} - Umbral mínimo de relevancia (0.0-1.0)
   */
  filter_search_results: `Eres un clasificador de relevancia técnica industrial (RTI) para una central de compras de ferretería.

TAREA: Para cada producto, asigna un SCORE RTI entre 0.0 y 1.0 basado en qué tan bien satisface la búsqueda del usuario.

ESCALA RTI:
- 1.00: EXACTO - Mismo producto, marca, especificaciones exactas
- 0.95: EQUIVALENTE - Mismo producto, nomenclatura diferente (6" = 152mm, MIXTA = COMBINADA)
- 0.85: SUSTITUTO_PERFECTO - Mismas especificaciones técnicas, marca diferente
- 0.70: SUSTITUTO_VALIDO - Especificaciones compatibles/intercambiables
- 0.50: MISMA_CATEGORIA - Mismo tipo de producto, especificaciones diferentes
- 0.30: RELACIONADO - Producto complementario o accesorio
- 0.10: IRRELEVANTE - No aplica para la necesidad expresada
- 0.00: RECHAZADO - Completamente diferente, no tiene relación

REGLAS INDUSTRIALES CRÍTICAS:
1. TIPO DE PRODUCTO debe coincidir (LLAVE MIXTA ≠ LLAVE STILLSON ≠ LLAVE ALLEN)
2. MEDIDAS son críticas: 6" ≠ 8", 18mm ≠ 11mm → máximo 0.50 si no coincide
3. MARCA diferente SIN especificar marca en búsqueda → puede ser 0.85 (sustituto perfecto)
4. MARCA diferente CUANDO se especificó marca → máximo 0.50
5. Kits/Juegos cuando pide pieza individual → máximo 0.30
6. Pulgadas equivalencias: 1/4" = 6mm, 3/8" = 10mm, 1/2" = 13mm, 3/4" = 19mm, 1" = 25mm

EJEMPLOS:
- "LLAVE MIXTA 18MM" + "LLAVE MIXTA 18MM STANLEY" → srt=1.0 (EXACTO)
- "LLAVE MIXTA 18MM" + "LLAVE COMBINADA 18MM TRUPER" → srt=0.95 (EQUIVALENTE - mixta=combinada)
- "LLAVE MIXTA 18MM STANLEY" + "LLAVE MIXTA 18MM TRUPER" → srt=0.50 (pidió Stanley, es Truper)
- "LLAVE MIXTA 18MM" + "LLAVE MIXTA 11MM" → srt=0.50 (MISMA_CATEGORIA - medida diferente)
- "LLAVE MIXTA 18MM" + "LLAVE STILLSON 18"" → srt=0.10 (IRRELEVANTE - tipo diferente)
- "LLAVE MIXTA 18MM" + "JUEGO LLAVES MIXTAS 6-32MM" → srt=0.30 (RELACIONADO - incluye la medida pero es juego)

BÚSQUEDA DEL USUARIO:
{{QUERY}}

PRODUCTOS A EVALUAR:
{{PRODUCTS}}

UMBRAL MÍNIMO CONFIGURADO: {{MIN_RELEVANCIA}}

Responde SOLO con un array JSON válido. Para cada producto incluye:
- id: string (el ID original del producto)
- srt: number (Score RTI entre 0.0 y 1.0)
- clasificacion: string (EXACTO|EQUIVALENTE|SUSTITUTO_PERFECTO|SUSTITUTO_VALIDO|MISMA_CATEGORIA|RELACIONADO|IRRELEVANTE|RECHAZADO)
- razon: string (explicación breve de la clasificación)
- match: boolean (true si srt >= umbral mínimo configurado)
- confidence: number (igual a srt para compatibilidad)

[
  {
    "id": "producto_id",
    "srt": 0.85,
    "clasificacion": "SUSTITUTO_PERFECTO",
    "razon": "Mismo producto 18mm, marca diferente",
    "match": true,
    "confidence": 0.85
  }
]`,

  /**
   * compare_products - Compara dos productos directamente
   *
   * Placeholders:
   * - {{PRODUCTO_1}} - Descripción del primer producto
   * - {{MARCA_1}} - Marca del primer producto (opcional)
   * - {{PRODUCTO_2}} - Descripción del segundo producto
   * - {{MARCA_2}} - Marca del segundo producto (opcional)
   */
  compare_products: `Eres un experto en productos industriales de ferretería.

TAREA: Comparar dos productos y determinar su nivel de similitud/intercambiabilidad.

PRODUCTO 1:
Descripción: {{PRODUCTO_1}}
Marca: {{MARCA_1}}

PRODUCTO 2:
Descripción: {{PRODUCTO_2}}
Marca: {{MARCA_2}}

CRITERIOS DE COMPARACIÓN:
1. TIPO DE PRODUCTO - ¿Son el mismo tipo? (ej: ambos son llaves mixtas)
2. ESPECIFICACIONES - ¿Coinciden medidas, dimensiones, capacidades?
3. MARCA - ¿Son la misma marca o marcas diferentes?
4. MATERIAL/CALIDAD - ¿Son de calidad comparable?
5. USO PREVISTO - ¿Sirven para el mismo propósito?

ESCALA DE SIMILITUD:
- 1.00: EXACTO - Mismo producto exacto
- 0.95: EQUIVALENTE - Mismo producto, nomenclatura diferente
- 0.85: SUSTITUTO_PERFECTO - Intercambiables sin diferencia funcional
- 0.70: SUSTITUTO_VALIDO - Intercambiables con pequeñas diferencias
- 0.50: MISMA_CATEGORIA - Mismo tipo, specs diferentes
- 0.30: RELACIONADO - Complementarios
- 0.10: IRRELEVANTE - Sin relación funcional

Responde con JSON:
{
  "similarity": 0.85,
  "clasificacion": "SUSTITUTO_PERFECTO",
  "razon": "Explicación detallada",
  "detalles": {
    "tipo_producto": { "match": true, "nota": "..." },
    "especificaciones": { "match": true, "nota": "..." },
    "marca": { "match": false, "nota": "..." },
    "intercambiable": true
  }
}`,

  /**
   * validate_exists - Valida si un producto ya existe
   *
   * Placeholders:
   * - {{NUEVO_PRODUCTO}} - Producto que se quiere registrar
   * - {{MARCA_NUEVO}} - Marca del nuevo producto
   * - {{CANDIDATOS}} - Lista de productos similares encontrados
   */
  validate_exists: `Eres un validador de duplicados para un catálogo de productos industriales.

TAREA: Determinar si el producto que se quiere registrar ya existe en el catálogo.

PRODUCTO NUEVO A REGISTRAR:
Descripción: {{NUEVO_PRODUCTO}}
Marca: {{MARCA_NUEVO}}

PRODUCTOS SIMILARES ENCONTRADOS EN CATÁLOGO:
{{CANDIDATOS}}

REGLAS DE VALIDACIÓN:
1. DUPLICADO EXACTO: Mismo producto, misma marca, mismas especificaciones → RECHAZAR
2. DUPLICADO CON TYPO: Mismo producto pero con errores de escritura → RECHAZAR
3. VARIANTE DE MARCA: Mismo producto, marca diferente → ACEPTAR (no es duplicado)
4. VARIANTE DE MEDIDA: Mismo tipo, medida diferente → ACEPTAR (no es duplicado)
5. PRODUCTO DIFERENTE: Tipo de producto diferente → ACEPTAR

CRITERIOS DE TYPOS COMUNES:
- STANELY vs STANLEY
- TRUPPER vs TRUPER
- Números: 18 vs 18MM vs 18 MM
- Comillas: 6" vs 6 PULGADAS vs 6 PLG

Responde con JSON:
{
  "exists": boolean,
  "isExactMatch": boolean,
  "isVariant": boolean,
  "reason": "Explicación",
  "confidence": 0.95,
  "recommendation": "reject|accept|review",
  "confirmedDuplicates": [
    {
      "codigoEFC": "código",
      "descripcion": "desc",
      "marca": "marca",
      "similarity": 0.98,
      "whyDuplicate": "Mismo producto con typo en marca"
    }
  ]
}`,

  /**
   * classify_duplicates - Clasifica grupos de duplicados
   *
   * Placeholders:
   * - {{GRUPOS}} - Lista de grupos de productos similares
   */
  classify_duplicates: `Eres un clasificador de duplicados para gestión de catálogo.

TAREA: Clasificar cada grupo de productos similares en una categoría.

GRUPOS A CLASIFICAR:
{{GRUPOS}}

CATEGORÍAS:
- real_duplicate: Mismo producto exacto, debe consolidarse
- size_variant: Variantes de tamaño/medida del mismo producto
- color_variant: Variantes de color del mismo producto
- model_variant: Variantes de modelo de la misma línea
- description_variant: Mismo producto descrito diferente
- review_needed: Requiere revisión manual

Para cada grupo responde con:
{
  "groupIndex": 0,
  "category": "real_duplicate",
  "confidence": 0.95,
  "reason": "Productos idénticos con códigos diferentes",
  "differences": ["Solo difieren en código interno"],
  "recommendation": "merge|keep_both|review"
}`,
};

/**
 * Get prompt names for management
 */
export const PROMPT_NAMES = Object.keys(DEFAULT_PROMPTS) as Array<keyof typeof DEFAULT_PROMPTS>;

/**
 * Validate that a prompt has required placeholders
 */
export function validatePromptPlaceholders(name: string, content: string): string[] {
  const errors: string[] = [];

  const requiredPlaceholders: Record<string, string[]> = {
    filter_search_results: ['{{QUERY}}', '{{PRODUCTS}}'],
    compare_products: ['{{PRODUCTO_1}}', '{{PRODUCTO_2}}'],
    validate_exists: ['{{NUEVO_PRODUCTO}}', '{{CANDIDATOS}}'],
    classify_duplicates: ['{{GRUPOS}}'],
  };

  const required = requiredPlaceholders[name] || [];

  for (const placeholder of required) {
    if (!content.includes(placeholder)) {
      errors.push(`Missing required placeholder: ${placeholder}`);
    }
  }

  return errors;
}
