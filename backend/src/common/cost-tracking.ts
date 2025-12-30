/**
 * Cost Tracking Types and Utilities
 * Tracks token usage and calculates costs for AI API calls
 */

// Pricing as of December 2025 (USD per 1M tokens)
export const API_PRICING = {
  // OpenAI GPT-4o
  'gpt-4o': {
    input: 2.50,   // $2.50 per 1M input tokens
    output: 10.00, // $10.00 per 1M output tokens
  },
  // OpenAI GPT-4o-mini (backup)
  'gpt-4o-mini': {
    input: 0.15,   // $0.15 per 1M input tokens
    output: 0.60,  // $0.60 per 1M output tokens
  },
  // Google Gemini Embedding
  'gemini-embedding-001': {
    input: 0.15,   // $0.15 per 1M input tokens
    output: 0,     // No output tokens for embeddings
  },
  // Google Gemini Flash (for vision/classification)
  'gemini-2.0-flash-exp': {
    input: 0.075,  // $0.075 per 1M input tokens
    output: 0.30,  // $0.30 per 1M output tokens
  },
} as const;

export type ModelName = keyof typeof API_PRICING;

/**
 * Token usage for a single API call
 */
export interface TokenUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Cost breakdown for a single API call
 */
export interface CostBreakdown {
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
}

/**
 * Aggregated cost tracking for a search request
 */
export interface SearchCostTracking {
  embedding: CostBreakdown;
  llmFilter?: CostBreakdown;
  totalCostUsd: number;
  totalTokens: number;
  breakdown: {
    embeddingPct: number;
    llmFilterPct: number;
  };
}

/**
 * Calculate cost from token usage
 */
export function calculateCost(usage: TokenUsage): CostBreakdown {
  const pricing = API_PRICING[usage.model as ModelName];

  if (!pricing) {
    // Unknown model - return zero cost with warning
    console.warn(`Unknown model for pricing: ${usage.model}`);
    return {
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      inputCostUsd: 0,
      outputCostUsd: 0,
      totalCostUsd: 0,
    };
  }

  const inputCostUsd = (usage.inputTokens / 1_000_000) * pricing.input;
  const outputCostUsd = (usage.outputTokens / 1_000_000) * pricing.output;

  return {
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    inputCostUsd: roundToMicroDollar(inputCostUsd),
    outputCostUsd: roundToMicroDollar(outputCostUsd),
    totalCostUsd: roundToMicroDollar(inputCostUsd + outputCostUsd),
  };
}

/**
 * Estimate tokens from text (rough approximation)
 * For Gemini: ~4 characters per token
 * For OpenAI: ~4 characters per token (similar)
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Approximately 4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Round to micro-dollar precision (6 decimal places)
 */
function roundToMicroDollar(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Aggregate multiple cost breakdowns into a search cost tracking object
 */
export function aggregateCosts(
  embedding: CostBreakdown,
  llmFilter?: CostBreakdown | null,
): SearchCostTracking {
  const embeddingTokens = embedding.inputTokens + embedding.outputTokens;
  const llmTokens = llmFilter ? llmFilter.inputTokens + llmFilter.outputTokens : 0;

  const totalCostUsd = embedding.totalCostUsd + (llmFilter?.totalCostUsd || 0);
  const totalTokens = embeddingTokens + llmTokens;

  const embeddingPct = totalCostUsd > 0
    ? roundToMicroDollar((embedding.totalCostUsd / totalCostUsd) * 100)
    : 100; // If no cost, embedding is 100%
  const llmFilterPct = totalCostUsd > 0 && llmFilter
    ? roundToMicroDollar((llmFilter.totalCostUsd / totalCostUsd) * 100)
    : 0;

  return {
    embedding,
    ...(llmFilter && { llmFilter }),
    totalCostUsd: roundToMicroDollar(totalCostUsd),
    totalTokens,
    breakdown: {
      embeddingPct,
      llmFilterPct,
    },
  };
}

/**
 * Format cost for display
 */
export function formatCost(costUsd: number): string {
  if (costUsd < 0.01) {
    return `$${(costUsd * 1000).toFixed(4)} (${(costUsd * 1000).toFixed(2)} milésimas)`;
  }
  return `$${costUsd.toFixed(6)}`;
}
