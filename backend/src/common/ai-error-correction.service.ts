import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface ErrorCorrectionSuggestion {
  errorType: string;
  originalError: string;
  suggestedFix: string;
  explanation: string;
  confidence: 'high' | 'medium' | 'low';
  correctedCode?: string;
}

export interface QueryValidationResult {
  isValid: boolean;
  errors: string[];
  suggestions: ErrorCorrectionSuggestion[];
  correctedQuery?: string;
}

@Injectable()
export class AIErrorCorrectionService {
  private readonly logger = new Logger(AIErrorCorrectionService.name);
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      this.logger.warn('GOOGLE_API_KEY or GEMINI_API_KEY not found - AI error correction disabled');
      return;
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
    });
  }

  /**
   * Analyzes a SQL query error and provides correction suggestions
   */
  async analyzeSQLError(
    query: string,
    errorMessage: string,
    databaseType: 'mssql' | 'mysql' | 'postgresql',
  ): Promise<ErrorCorrectionSuggestion> {
    if (!this.model) {
      throw new Error('AI service not initialized - missing GOOGLE_API_KEY');
    }

    try {
      const prompt = this.buildSQLErrorPrompt(query, errorMessage, databaseType);
      const result = await this.model.generateContent(prompt);
      const response = result.response.text();

      return this.parseSQLCorrectionResponse(response);
    } catch (error) {
      this.logger.error(`Failed to analyze SQL error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validates and suggests corrections for a SQL query
   */
  async validateAndCorrectSQL(
    query: string,
    databaseType: 'mssql' | 'mysql' | 'postgresql',
  ): Promise<QueryValidationResult> {
    if (!this.model) {
      return {
        isValid: false,
        errors: ['AI validation not available - missing GOOGLE_API_KEY'],
        suggestions: [],
      };
    }

    try {
      const prompt = this.buildSQLValidationPrompt(query, databaseType);
      const result = await this.model.generateContent(prompt);
      const response = result.response.text();

      return this.parseValidationResponse(response);
    } catch (error) {
      this.logger.error(`Failed to validate SQL: ${error.message}`);
      return {
        isValid: false,
        errors: [error.message],
        suggestions: [],
      };
    }
  }

  /**
   * Analyzes a connection error and provides suggestions
   */
  async analyzeConnectionError(
    errorMessage: string,
    connectionConfig: any,
    databaseType: string,
  ): Promise<ErrorCorrectionSuggestion> {
    if (!this.model) {
      throw new Error('AI service not initialized');
    }

    try {
      const prompt = this.buildConnectionErrorPrompt(errorMessage, connectionConfig, databaseType);
      const result = await this.model.generateContent(prompt);
      const response = result.response.text();

      return this.parseConnectionCorrectionResponse(response);
    } catch (error) {
      this.logger.error(`Failed to analyze connection error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Analyzes a sync/embedding error and provides suggestions
   */
  async analyzeSyncError(
    errorMessage: string,
    context: {
      datasourceName: string;
      recordData?: any;
      phase: 'fetch' | 'transform' | 'embedding' | 'upsert';
    },
  ): Promise<ErrorCorrectionSuggestion> {
    if (!this.model) {
      throw new Error('AI service not initialized');
    }

    try {
      const prompt = this.buildSyncErrorPrompt(errorMessage, context);
      const result = await this.model.generateContent(prompt);
      const response = result.response.text();

      return this.parseSyncCorrectionResponse(response);
    } catch (error) {
      this.logger.error(`Failed to analyze sync error: ${error.message}`);
      throw error;
    }
  }

  // ==================== PRIVATE METHODS ====================

  private buildSQLErrorPrompt(query: string, errorMessage: string, dbType: string): string {
    const mssqlSpecific = dbType === 'mssql' ? `

**CRITICAL for MSSQL - Common SSMS vs Programmatic Execution Issues:**
- NEVER use "USE database_name" - this is SSMS-only, not valid in programmatic queries
- NEVER use "GO" - this is a batch separator for SSMS, not SQL syntax
- Remove any SSMS-specific commands (PRINT, sp_executesql with variables, etc.)
- The query must be executable via node-mssql driver, not just in SSMS
- If you see "USE" or "GO" in the query, remove them and add a note in explanation` : '';

    return `You are an expert ${dbType.toUpperCase()} database assistant. Analyze the following SQL query error and provide a correction.

**Database Type:** ${dbType.toUpperCase()}${mssqlSpecific}

**Query:**
\`\`\`sql
${query}
\`\`\`

**Error Message:**
${errorMessage}

Please analyze the error and respond in the following JSON format:
{
  "errorType": "syntax|logic|permission|ssms_syntax|other",
  "originalError": "brief description of the error",
  "suggestedFix": "step-by-step fix explanation",
  "explanation": "detailed explanation of why this error occurred",
  "confidence": "high|medium|low",
  "correctedCode": "the fully corrected SQL query"
}

Important:
- Return ONLY valid JSON, no markdown or extra text
- Ensure correctedCode is a complete, executable SQL query for programmatic execution
- Consider ${dbType} specific syntax and features
- If the query uses placeholders like {{offset}} or {{limit}}, preserve them
- Focus on fixing syntax errors, not changing business logic
- For MSSQL: Remove SSMS-only commands like USE, GO, PRINT`;
  }

  private buildSQLValidationPrompt(query: string, dbType: string): string {
    const mssqlValidation = dbType === 'mssql' ? `

**CRITICAL MSSQL Validation Checks:**
1. CHECK for "USE database_name" - This is INVALID for programmatic execution (SSMS-only)
2. CHECK for "GO" statements - This is INVALID for programmatic execution (SSMS batch separator)
3. CHECK for SSMS-specific commands (PRINT, RAISERROR with variables, etc.)
4. The query MUST be executable via node-mssql driver, NOT just in SQL Server Management Studio
5. If found: Mark isValid=false and provide correctedQuery without USE/GO` : '';

    return `You are an expert ${dbType.toUpperCase()} database validator. Analyze this SQL query for potential issues.

**Database Type:** ${dbType.toUpperCase()}${mssqlValidation}

**Query:**
\`\`\`sql
${query}
\`\`\`

Validate the query and respond in JSON format:
{
  "isValid": true|false,
  "errors": ["list of errors found"],
  "suggestions": [
    {
      "errorType": "syntax|performance|bestpractice|ssms_syntax",
      "originalError": "description",
      "suggestedFix": "how to fix",
      "explanation": "why this matters",
      "confidence": "high|medium|low",
      "correctedCode": "corrected version if applicable"
    }
  ],
  "correctedQuery": "fully corrected query if errors were found"
}

Important:
- Return ONLY valid JSON
- Check for syntax errors, SQL injection risks, performance issues
- **For MSSQL: Immediately flag queries with USE or GO as INVALID**
- Preserve placeholders like {{offset}} and {{limit}}
- The correctedQuery must be executable programmatically, not just in SSMS
- Suggest optimizations if applicable`;
  }

  private buildConnectionErrorPrompt(
    errorMessage: string,
    connectionConfig: any,
    dbType: string,
  ): string {
    const safeConfig = { ...connectionConfig };
    delete safeConfig.password; // Don't send password to AI

    return `You are a database connection troubleshooting expert. Analyze this connection error.

**Database Type:** ${dbType.toUpperCase()}

**Error Message:**
${errorMessage}

**Connection Config (password redacted):**
\`\`\`json
${JSON.stringify(safeConfig, null, 2)}
\`\`\`

Respond in JSON format:
{
  "errorType": "network|authentication|configuration|firewall|other",
  "originalError": "brief description",
  "suggestedFix": "step-by-step troubleshooting steps",
  "explanation": "detailed explanation",
  "confidence": "high|medium|low"
}

Consider common issues:
- Firewall blocking port
- Incorrect host/port
- Authentication failures
- SSL/TLS configuration
- Network connectivity`;
  }

  private buildSyncErrorPrompt(
    errorMessage: string,
    context: {
      datasourceName: string;
      recordData?: any;
      phase: string;
    },
  ): string {
    return `You are a data synchronization troubleshooting expert. Analyze this sync error.

**Sync Phase:** ${context.phase}
**Datasource:** ${context.datasourceName}

**Error Message:**
${errorMessage}

${context.recordData ? `**Sample Record Data:**\n\`\`\`json\n${JSON.stringify(context.recordData, null, 2)}\n\`\`\`` : ''}

Respond in JSON format:
{
  "errorType": "data_format|missing_field|type_mismatch|embedding_failure|upsert_failure",
  "originalError": "brief description",
  "suggestedFix": "how to resolve",
  "explanation": "detailed explanation",
  "confidence": "high|medium|low"
}

Consider:
- Data type mismatches
- Missing required fields
- Embedding generation failures
- Qdrant upsert issues
- Field mapping problems`;
  }

  private parseSQLCorrectionResponse(response: string): ErrorCorrectionSuggestion {
    try {
      // Remove markdown code blocks if present
      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);

      return {
        errorType: parsed.errorType || 'unknown',
        originalError: parsed.originalError || '',
        suggestedFix: parsed.suggestedFix || '',
        explanation: parsed.explanation || '',
        confidence: parsed.confidence || 'medium',
        correctedCode: parsed.correctedCode,
      };
    } catch (error) {
      this.logger.error(`Failed to parse AI response: ${error.message}`);
      this.logger.debug(`Raw response: ${response}`);

      // Fallback: return raw response as explanation
      return {
        errorType: 'parsing_error',
        originalError: 'Failed to parse AI response',
        suggestedFix: 'AI response could not be parsed',
        explanation: response,
        confidence: 'low',
      };
    }
  }

  private parseValidationResponse(response: string): QueryValidationResult {
    try {
      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);

      return {
        isValid: parsed.isValid ?? false,
        errors: parsed.errors || [],
        suggestions: parsed.suggestions || [],
        correctedQuery: parsed.correctedQuery,
      };
    } catch (error) {
      this.logger.error(`Failed to parse validation response: ${error.message}`);
      return {
        isValid: false,
        errors: ['Failed to parse AI validation response'],
        suggestions: [],
      };
    }
  }

  private parseConnectionCorrectionResponse(response: string): ErrorCorrectionSuggestion {
    return this.parseSQLCorrectionResponse(response);
  }

  private parseSyncCorrectionResponse(response: string): ErrorCorrectionSuggestion {
    return this.parseSQLCorrectionResponse(response);
  }
}
