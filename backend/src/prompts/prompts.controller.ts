import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { PromptsService } from './prompts.service';
import { CreatePromptDto } from './dto/create-prompt.dto';
import { TestPromptDto } from './dto/test-prompt.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('prompts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class PromptsController {
  constructor(private readonly promptsService: PromptsService) {}

  /**
   * GET /api/prompts
   * List all prompts with their status
   */
  @Get()
  async findAll() {
    return this.promptsService.findAll();
  }

  /**
   * GET /api/prompts/:name
   * Get active prompt content by name
   */
  @Get(':name')
  async getActivePrompt(@Param('name') name: string) {
    return this.promptsService.getActivePrompt(name);
  }

  /**
   * GET /api/prompts/:name/history
   * Get all versions of a prompt
   */
  @Get(':name/history')
  async getHistory(@Param('name') name: string) {
    return this.promptsService.getHistory(name);
  }

  /**
   * POST /api/prompts
   * Create a new draft prompt
   */
  @Post()
  async createDraft(@Body() dto: CreatePromptDto, @Request() req: any) {
    const username = req.user?.username || 'unknown';
    return this.promptsService.createDraft(dto, username);
  }

  /**
   * POST /api/prompts/:id/test
   * Test a draft prompt with sample data
   */
  @Post(':id/test')
  async testPrompt(@Param('id') id: string, @Body() testData: TestPromptDto) {
    return this.promptsService.testPrompt(id, testData);
  }

  /**
   * POST /api/prompts/:id/activate
   * Activate a tested draft prompt
   */
  @Post(':id/activate')
  async activatePrompt(@Param('id') id: string, @Request() req: any) {
    const username = req.user?.username || 'unknown';
    return this.promptsService.activatePrompt(id, username);
  }

  /**
   * POST /api/prompts/:name/rollback
   * Rollback to a previous version
   */
  @Post(':name/rollback')
  async rollback(
    @Param('name') name: string,
    @Body('version') version: number,
    @Request() req: any,
  ) {
    const username = req.user?.username || 'unknown';
    return this.promptsService.rollback(name, version, username);
  }

  /**
   * POST /api/prompts/:name/reset
   * Reset prompt to default (archive all custom versions)
   */
  @Post(':name/reset')
  async resetToDefault(@Param('name') name: string, @Request() req: any) {
    const username = req.user?.username || 'unknown';
    return this.promptsService.resetToDefault(name, username);
  }
}
