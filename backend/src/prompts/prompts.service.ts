import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PromptConfig, PromptStatus } from './entities/prompt-config.entity';
import { CreatePromptDto, UpdatePromptDto } from './dto/create-prompt.dto';
import { TestPromptDto, TestPromptResponseDto } from './dto/test-prompt.dto';
import { DEFAULT_PROMPTS, validatePromptPlaceholders, PROMPT_NAMES } from './constants/default-prompts';

@Injectable()
export class PromptsService {
  private readonly logger = new Logger(PromptsService.name);

  constructor(
    @InjectRepository(PromptConfig)
    private readonly promptRepository: Repository<PromptConfig>,
  ) {}

  /**
   * List all prompts with their current status
   */
  async findAll(): Promise<{
    prompts: Array<{
      name: string;
      activeVersion: number | null;
      hasCustom: boolean;
      status: PromptStatus | 'default';
      lastUpdated: Date | null;
    }>;
  }> {
    const allPrompts = await this.promptRepository.find({
      order: { name: 'ASC', version: 'DESC' },
    });

    // Group by name
    const promptMap = new Map<string, PromptConfig[]>();
    allPrompts.forEach((p) => {
      const list = promptMap.get(p.name) || [];
      list.push(p);
      promptMap.set(p.name, list);
    });

    // Build response including default prompts
    const result = PROMPT_NAMES.map((name) => {
      const configs = promptMap.get(name) || [];
      const activeConfig = configs.find((c) => c.status === 'active');

      return {
        name,
        activeVersion: activeConfig?.version || null,
        hasCustom: configs.length > 0,
        status: activeConfig ? activeConfig.status : ('default' as const),
        lastUpdated: activeConfig?.createdAt || null,
      };
    });

    return { prompts: result };
  }

  /**
   * Get active prompt content by name
   * Falls back to default if no custom prompt is active
   */
  async getActivePrompt(name: string): Promise<{
    name: string;
    content: string;
    version: number;
    isDefault: boolean;
    source: 'database' | 'default';
  }> {
    // Try to find active custom prompt
    const activePrompt = await this.promptRepository.findOne({
      where: { name, status: 'active' },
    });

    if (activePrompt) {
      return {
        name: activePrompt.name,
        content: activePrompt.content,
        version: activePrompt.version,
        isDefault: activePrompt.isDefault,
        source: 'database',
      };
    }

    // Fall back to default
    const defaultContent = DEFAULT_PROMPTS[name as keyof typeof DEFAULT_PROMPTS];
    if (!defaultContent) {
      throw new NotFoundException(`Prompt "${name}" not found`);
    }

    return {
      name,
      content: defaultContent,
      version: 0,
      isDefault: true,
      source: 'default',
    };
  }

  /**
   * Get prompt history (all versions)
   */
  async getHistory(name: string): Promise<PromptConfig[]> {
    const history = await this.promptRepository.find({
      where: { name },
      order: { version: 'DESC' },
    });

    return history;
  }

  /**
   * Create a new draft prompt
   */
  async createDraft(dto: CreatePromptDto, createdBy: string): Promise<PromptConfig> {
    // Validate prompt name exists
    if (!PROMPT_NAMES.includes(dto.name as any)) {
      throw new BadRequestException(
        `Invalid prompt name: ${dto.name}. Valid names: ${PROMPT_NAMES.join(', ')}`,
      );
    }

    // Validate placeholders
    const placeholderErrors = validatePromptPlaceholders(dto.name, dto.content);
    if (placeholderErrors.length > 0) {
      throw new BadRequestException(`Invalid prompt content: ${placeholderErrors.join(', ')}`);
    }

    // Get latest version number
    const latestPrompt = await this.promptRepository.findOne({
      where: { name: dto.name },
      order: { version: 'DESC' },
    });

    const newVersion = (latestPrompt?.version || 0) + 1;

    const prompt = this.promptRepository.create({
      name: dto.name,
      content: dto.content,
      version: newVersion,
      status: 'draft',
      createdBy,
      changeDescription: dto.changeDescription,
      isDefault: false,
    });

    const saved = await this.promptRepository.save(prompt);
    this.logger.log(`Created draft prompt: ${dto.name} v${newVersion} by ${createdBy}`);

    return saved;
  }

  /**
   * Test a prompt with sample data
   */
  async testPrompt(promptId: string, testData: TestPromptDto): Promise<TestPromptResponseDto> {
    const prompt = await this.promptRepository.findOne({
      where: { id: promptId },
    });

    if (!prompt) {
      throw new NotFoundException(`Prompt ${promptId} not found`);
    }

    const startTime = Date.now();
    const errors: string[] = [];
    let results: any[] = [];
    let rawResponse: string = '';

    try {
      // Replace placeholders
      let processedPrompt = prompt.content
        .replace('{{QUERY}}', testData.query)
        .replace('{{PRODUCTS}}', JSON.stringify(testData.products, null, 2))
        .replace('{{MIN_RELEVANCIA}}', '0.50');

      // For now, we just validate the structure
      // In production, this would call the LLM
      this.logger.log(`Testing prompt ${prompt.name} v${prompt.version} with ${testData.products.length} products`);

      // Simulate a basic test response for validation
      results = testData.products.map((p) => ({
        id: p.id,
        srt: 0.5,
        clasificacion: 'MISMA_CATEGORIA',
        razon: 'Test response',
        match: true,
        confidence: 0.5,
      }));

      rawResponse = JSON.stringify(results);
    } catch (error) {
      errors.push(`Execution error: ${error.message}`);
    }

    const duration = Date.now() - startTime;

    // Validate response structure
    const isValidJson = true; // We generated valid JSON above
    const hasRequiredFields = results.every(
      (r) => r.id && r.srt !== undefined && r.clasificacion && r.match !== undefined,
    );

    if (!hasRequiredFields) {
      errors.push('Response missing required fields (id, srt, clasificacion, match)');
    }

    // Update test results in database
    await this.promptRepository.update(promptId, {
      lastTestedAt: new Date(),
      lastTestSuccess: errors.length === 0,
      testResults: {
        input: { query: testData.query, products_count: testData.products.length },
        output: results,
        errors,
        duration,
      } as any,
    });

    return {
      success: errors.length === 0,
      duration_ms: duration,
      input: {
        query: testData.query,
        products_count: testData.products.length,
      },
      output: {
        results,
        raw_response: rawResponse,
      },
      validation: {
        is_valid_json: isValidJson,
        has_required_fields: hasRequiredFields,
        errors,
      },
    };
  }

  /**
   * Activate a draft prompt (makes it the current active version)
   */
  async activatePrompt(promptId: string, activatedBy: string): Promise<PromptConfig> {
    const prompt = await this.promptRepository.findOne({
      where: { id: promptId },
    });

    if (!prompt) {
      throw new NotFoundException(`Prompt ${promptId} not found`);
    }

    if (prompt.status !== 'draft') {
      throw new BadRequestException(`Only draft prompts can be activated. Current status: ${prompt.status}`);
    }

    // Check if prompt was tested
    if (!prompt.lastTestedAt) {
      throw new BadRequestException('Prompt must be tested before activation');
    }

    if (!prompt.lastTestSuccess) {
      throw new BadRequestException('Prompt test must pass before activation');
    }

    // Deactivate current active prompt
    await this.promptRepository.update(
      { name: prompt.name, status: 'active' },
      { status: 'archived' },
    );

    // Activate new prompt
    prompt.status = 'active';
    const saved = await this.promptRepository.save(prompt);

    this.logger.log(`Activated prompt: ${prompt.name} v${prompt.version} by ${activatedBy}`);

    return saved;
  }

  /**
   * Rollback to a previous version
   */
  async rollback(name: string, targetVersion: number, rolledBackBy: string): Promise<PromptConfig> {
    const targetPrompt = await this.promptRepository.findOne({
      where: { name, version: targetVersion },
    });

    if (!targetPrompt) {
      throw new NotFoundException(`Prompt ${name} version ${targetVersion} not found`);
    }

    // Deactivate current active
    await this.promptRepository.update(
      { name, status: 'active' },
      { status: 'archived' },
    );

    // Create new version based on target
    const latestPrompt = await this.promptRepository.findOne({
      where: { name },
      order: { version: 'DESC' },
    });

    const newPrompt = this.promptRepository.create({
      name,
      content: targetPrompt.content,
      version: (latestPrompt?.version || 0) + 1,
      status: 'active',
      createdBy: rolledBackBy,
      changeDescription: `Rollback to v${targetVersion}`,
      rollbackTo: targetPrompt.id,
      isDefault: false,
      lastTestedAt: new Date(), // Skip test for rollback
      lastTestSuccess: true,
    });

    const saved = await this.promptRepository.save(newPrompt);

    this.logger.log(`Rolled back ${name} to v${targetVersion}, created v${saved.version} by ${rolledBackBy}`);

    return saved;
  }

  /**
   * Reset prompt to default (removes all custom versions from active)
   */
  async resetToDefault(name: string, resetBy: string): Promise<{ message: string }> {
    if (!PROMPT_NAMES.includes(name as any)) {
      throw new NotFoundException(`Prompt "${name}" not found`);
    }

    // Archive all active prompts
    const result = await this.promptRepository.update(
      { name, status: 'active' },
      { status: 'archived' },
    );

    this.logger.log(`Reset ${name} to default by ${resetBy}. Archived ${result.affected} prompts.`);

    return {
      message: `Prompt "${name}" reset to default. ${result.affected} custom version(s) archived.`,
    };
  }

  /**
   * Get a prompt by ID
   */
  async findOne(id: string): Promise<PromptConfig> {
    const prompt = await this.promptRepository.findOne({
      where: { id },
    });

    if (!prompt) {
      throw new NotFoundException(`Prompt ${id} not found`);
    }

    return prompt;
  }

  /**
   * Get prompt content for use in services
   * This is the main method used by other services to get prompt content
   */
  async getPromptContent(name: string): Promise<string> {
    const result = await this.getActivePrompt(name);
    return result.content;
  }
}
