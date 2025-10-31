import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { DatasourcesService } from './datasources.service';
import { CreateDatasourceDto, TestConnectionDto } from './dto/create-datasource.dto';
import { UpdateDatasourceDto } from './dto/update-datasource.dto';

@Controller('datasources')
export class DatasourcesController {
  constructor(private readonly datasourcesService: DatasourcesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createDatasourceDto: CreateDatasourceDto) {
    return await this.datasourcesService.create(createDatasourceDto);
  }

  @Get()
  async findAll() {
    return await this.datasourcesService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.datasourcesService.findOne(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() updateDatasourceDto: UpdateDatasourceDto) {
    return await this.datasourcesService.update(id, updateDatasourceDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.datasourcesService.remove(id);
  }

  @Post(':id/test')
  async testConnection(@Param('id') id: string) {
    return await this.datasourcesService.testConnection(id);
  }

  @Post('test-connection')
  async testConnectionConfig(@Body() body: TestConnectionDto) {
    return await this.datasourcesService.testConnectionWithConfig(body.type, body.connectionConfig);
  }

  @Get(':id/preview')
  async previewData(@Param('id') id: string, @Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 5;
    return await this.datasourcesService.previewData(id, limitNum);
  }

  @Post(':id/validate-query')
  async validateQuery(@Param('id') id: string, @Body() body: { query?: string }) {
    return await this.datasourcesService.validateQuery(id, body.query);
  }

  @Post(':id/regenerate-webhook-secret')
  async regenerateWebhookSecret(@Param('id') id: string) {
    return await this.datasourcesService.regenerateWebhookSecret(id);
  }

  @Get(':id/stats')
  async getStats(@Param('id') id: string) {
    return await this.datasourcesService.getStats(id);
  }

  @Post(':id/validate-query-ai')
  async validateQueryWithAI(@Param('id') id: string, @Body() body: { query?: string }) {
    return await this.datasourcesService.validateQueryWithAI(id, body.query);
  }

  @Post(':id/analyze-error')
  async analyzeError(
    @Param('id') id: string,
    @Body() body: { errorMessage: string; errorType?: 'sql' | 'connection' | 'sync' },
  ) {
    return await this.datasourcesService.analyzeError(id, body.errorMessage, body.errorType);
  }

  @Post(':id/preview-with-ai')
  async previewDataWithAI(@Param('id') id: string, @Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 5;
    return await this.datasourcesService.previewDataWithAI(id, limitNum);
  }
}
