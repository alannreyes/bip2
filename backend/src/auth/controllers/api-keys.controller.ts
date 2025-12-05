import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ApiKeyService, CreateApiKeyDto } from '../services/api-key.service';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { RolesGuard } from '../roles.guard';
import { Roles } from '../roles.decorator';
import { Public } from '../decorators/public.decorator';

/**
 * Controller para administrar API Keys
 * Solo accesible por admins con JWT
 */
@ApiTags('api-keys')
@Controller('api-keys')
export class ApiKeysController {
  private readonly logger = new Logger(ApiKeysController.name);

  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear nueva API Key para una aplicación' })
  @ApiResponse({
    status: 201,
    description: 'API Key creada. La key solo se muestra UNA VEZ.',
  })
  async createApiKey(@Body() dto: CreateApiKeyDto) {
    const result = await this.apiKeyService.createApiKey(dto);

    this.logger.log(`API Key created for: ${dto.name}`);

    return {
      message: '⚠️ IMPORTANTE: Guarda esta API Key. No se puede recuperar después.',
      apiKey: {
        id: result.apiKey.id,
        name: result.apiKey.name,
        keyPrefix: result.apiKey.keyPrefix,
        expiresAt: result.apiKey.expiresAt,
        createdAt: result.apiKey.createdAt,
      },
      // La key en texto plano SOLO se muestra aquí, una vez
      key: result.plainTextKey,
      usage: {
        header: 'X-API-Key',
        example: `curl -H "X-API-Key: ${result.plainTextKey}" http://servidor/api/search/text`,
      },
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar todas las API Keys' })
  async listApiKeys() {
    const keys = await this.apiKeyService.listApiKeys();

    return {
      total: keys.length,
      apiKeys: keys.map(key => ({
        id: key.id,
        name: key.name,
        description: key.description,
        keyPrefix: key.keyPrefix,
        isActive: key.isActive,
        allowedIps: key.allowedIps,
        allowedEndpoints: key.allowedEndpoints,
        expiresAt: key.expiresAt,
        lastUsedAt: key.lastUsedAt,
        usageCount: key.usageCount,
        createdBy: key.createdBy,
        createdAt: key.createdAt,
      })),
    };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener detalle de una API Key' })
  async getApiKey(@Param('id') id: string) {
    const key = await this.apiKeyService.getApiKeyById(id);

    if (!key) {
      return { error: 'API Key not found' };
    }

    return { apiKey: key };
  }

  @Patch(':id/revoke')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revocar (desactivar) una API Key' })
  async revokeApiKey(@Param('id') id: string) {
    await this.apiKeyService.revokeApiKey(id);

    this.logger.log(`API Key revoked: ${id}`);

    return { message: 'API Key revoked successfully' };
  }

  @Patch(':id/activate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivar una API Key' })
  async activateApiKey(@Param('id') id: string) {
    await this.apiKeyService.activateApiKey(id);

    this.logger.log(`API Key activated: ${id}`);

    return { message: 'API Key activated successfully' };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar permanentemente una API Key' })
  async deleteApiKey(@Param('id') id: string) {
    await this.apiKeyService.deleteApiKey(id);

    this.logger.log(`API Key deleted: ${id}`);

    return { message: 'API Key deleted permanently' };
  }

  /**
   * Endpoint público para verificar si una API Key es válida
   * Útil para que las aplicaciones verifiquen su key
   */
  @Post('verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verificar si una API Key es válida' })
  async verifyApiKey(@Body() body: { apiKey: string }) {
    const result = await this.apiKeyService.validateApiKey(body.apiKey);

    if (result.valid) {
      return {
        valid: true,
        name: result.apiKey.name,
        expiresAt: result.apiKey.expiresAt,
      };
    }

    return {
      valid: false,
      reason: result.reason,
    };
  }
}
