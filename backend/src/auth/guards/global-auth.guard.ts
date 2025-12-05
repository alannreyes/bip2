import { Injectable, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Guard de autenticación global configurable
 *
 * Se activa SOLO cuando AUTH_ENABLED=true en el environment
 * Cuando está desactivado, todos los endpoints son públicos
 *
 * Endpoints marcados con @Public() siempre son públicos
 */
@Injectable()
export class GlobalAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(GlobalAuthGuard.name);
  private readonly authEnabled: boolean;

  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {
    super();
    this.authEnabled = this.configService.get('AUTH_ENABLED') === 'true';

    if (this.authEnabled) {
      this.logger.log('🔐 Global authentication ENABLED - endpoints require JWT');
    } else {
      this.logger.log('🔓 Global authentication DISABLED - all endpoints are public');
    }
  }

  canActivate(context: ExecutionContext) {
    // Si auth está deshabilitado globalmente, permitir todo
    if (!this.authEnabled) {
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

    // Validar JWT
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    // Si auth está deshabilitado, no lanzar error
    if (!this.authEnabled) {
      return user || { sub: 'anonymous', username: 'anonymous', role: 'user' };
    }

    if (err || !user) {
      const request = context.switchToHttp().getRequest();
      this.logger.warn(`Unauthorized access attempt to ${request.method} ${request.url} from ${request.ip}`);
      throw err || new UnauthorizedException('Invalid or missing authentication token');
    }

    return user;
  }
}
