import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ApiKeyService } from '../services/api-key.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Guard para validar API Keys
 * Busca la key en el header X-API-Key
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = this.extractApiKey(request);

    if (!apiKey) {
      throw new UnauthorizedException('API Key required. Use header: X-API-Key');
    }

    const ip = this.getClientIp(request);
    const endpoint = request.path;

    const result = await this.apiKeyService.validateApiKey(apiKey, ip, endpoint);

    if (!result.valid) {
      this.logger.warn(
        `API Key validation failed: ${result.reason} | IP: ${ip} | Endpoint: ${endpoint}`
      );
      throw new UnauthorizedException(result.reason);
    }

    // Agregar información de la API Key al request para logs de auditoría
    (request as any).apiKeyInfo = {
      id: result.apiKey.id,
      name: result.apiKey.name,
      keyPrefix: result.apiKey.keyPrefix,
    };

    // También agregar como "user" para compatibilidad con el sistema existente
    (request as any).user = {
      sub: result.apiKey.id,
      username: result.apiKey.name,
      role: 'api-client',
      type: 'api-key',
    };

    return true;
  }

  private extractApiKey(request: Request): string | null {
    // Primero buscar en header X-API-Key
    const apiKeyHeader = request.headers['x-api-key'];
    if (apiKeyHeader) {
      return Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
    }

    // También soportar en query param para facilitar pruebas (no recomendado en producción)
    const apiKeyQuery = request.query['api_key'];
    if (apiKeyQuery && typeof apiKeyQuery === 'string') {
      return apiKeyQuery;
    }

    return null;
  }

  private getClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(',')[0].trim();
    }

    const realIp = request.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    return request.ip || 'unknown';
  }
}
