import { Injectable, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ApiKeyService } from '../services/api-key.service';

/**
 * Guard de autenticación global configurable
 *
 * Modos (AUTH_MODE en environment):
 * - "none" (default): Sin autenticación, todos los endpoints públicos
 * - "jwt": Requiere JWT token (Bearer)
 * - "api-key": Requiere API Key (X-API-Key header)
 * - "both": Acepta JWT o API Key
 *
 * Endpoints marcados con @Public() siempre son públicos
 */
@Injectable()
export class GlobalAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(GlobalAuthGuard.name);
  private readonly authMode: 'none' | 'jwt' | 'api-key' | 'both';

  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
    private apiKeyService: ApiKeyService,
  ) {
    super();

    // Leer modo de autenticación
    const authEnabled = this.configService.get('AUTH_ENABLED') === 'true';
    const configuredMode = this.configService.get('AUTH_MODE') as string;

    if (!authEnabled) {
      this.authMode = 'none';
    } else if (configuredMode === 'jwt' || configuredMode === 'api-key' || configuredMode === 'both') {
      this.authMode = configuredMode;
    } else {
      // Default cuando AUTH_ENABLED=true pero no hay AUTH_MODE
      this.authMode = 'both';
    }

    const modeDescriptions = {
      'none': '🔓 Global auth DISABLED - all endpoints public',
      'jwt': '🔐 Global auth ENABLED - JWT required',
      'api-key': '🔑 Global auth ENABLED - API Key required',
      'both': '🔐 Global auth ENABLED - JWT or API Key accepted',
    };

    this.logger.log(modeDescriptions[this.authMode]);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Si auth está deshabilitado globalmente, permitir todo
    if (this.authMode === 'none') {
      return true;
    }

    // Check if route is marked as public with @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    // Intentar autenticación según el modo configurado
    if (this.authMode === 'api-key') {
      return this.validateApiKey(request, context);
    }

    if (this.authMode === 'jwt') {
      return super.canActivate(context) as Promise<boolean>;
    }

    // Modo "both": intentar API Key primero, luego JWT
    if (this.authMode === 'both') {
      const apiKey = this.extractApiKey(request);

      if (apiKey) {
        return this.validateApiKey(request, context);
      }

      // Si no hay API Key, intentar JWT
      return super.canActivate(context) as Promise<boolean>;
    }

    return false;
  }

  private async validateApiKey(request: Request, context: ExecutionContext): Promise<boolean> {
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

    // Agregar información al request para logs de auditoría
    (request as any).user = {
      sub: result.apiKey.id,
      username: result.apiKey.name,
      role: 'api-client',
      type: 'api-key',
      keyPrefix: result.apiKey.keyPrefix,
    };

    return true;
  }

  private extractApiKey(request: Request): string | null {
    const apiKeyHeader = request.headers['x-api-key'];
    if (apiKeyHeader) {
      return Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
    }
    return null;
  }

  private getClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(',')[0].trim();
    }
    return request.ip || 'unknown';
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    // Si auth está deshabilitado, no lanzar error
    if (this.authMode === 'none') {
      return user || { sub: 'anonymous', username: 'anonymous', role: 'user', type: 'anonymous' };
    }

    if (err || !user) {
      const request = context.switchToHttp().getRequest();
      this.logger.warn(`Unauthorized access attempt to ${request.method} ${request.url} from ${request.ip}`);
      throw err || new UnauthorizedException('Invalid or missing authentication');
    }

    return user;
  }
}
