import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request } from 'express';

/**
 * Interceptor de auditoría para registrar acciones importantes
 * Registra: quién, qué, cuándo, desde dónde, resultado
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AUDIT');

  // Endpoints que requieren auditoría detallada
  private readonly auditedPaths = [
    '/api/datasources',      // CRUD de datasources
    '/api/sync',             // Sincronizaciones
    '/api/collections',      // Gestión de colecciones
    '/api/duplicates/rules', // Reglas de duplicados
    '/api/prompts',          // Gestión de prompts
    '/api/webhooks',         // Webhooks
  ];

  // Métodos que modifican datos
  private readonly mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, ip, headers } = request;
    const userAgent = headers['user-agent'] || 'unknown';
    const startTime = Date.now();

    // Solo auditar paths importantes o métodos que modifican datos
    const shouldAudit =
      this.auditedPaths.some(path => url.startsWith(path)) ||
      this.mutatingMethods.includes(method);

    if (!shouldAudit) {
      return next.handle();
    }

    // Extraer usuario del JWT si existe
    const user = (request as any).user;
    const userId = user?.sub || user?.userId || 'anonymous';
    const username = user?.username || 'anonymous';

    // Extraer IP real (considerando proxies)
    const realIp = headers['x-forwarded-for'] as string ||
                   headers['x-real-ip'] as string ||
                   ip ||
                   'unknown';

    // Log de inicio de request
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return next.handle().pipe(
      tap((response) => {
        const duration = Date.now() - startTime;

        // Log estructurado para auditoría
        this.logger.log(
          JSON.stringify({
            requestId,
            timestamp: new Date().toISOString(),
            type: 'SUCCESS',
            method,
            url,
            userId,
            username,
            ip: realIp,
            userAgent: userAgent.substring(0, 100), // Truncar user-agent largo
            duration: `${duration}ms`,
            statusCode: 200,
          })
        );
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;

        // Log de error para auditoría
        this.logger.warn(
          JSON.stringify({
            requestId,
            timestamp: new Date().toISOString(),
            type: 'ERROR',
            method,
            url,
            userId,
            username,
            ip: realIp,
            userAgent: userAgent.substring(0, 100),
            duration: `${duration}ms`,
            statusCode: error.status || 500,
            error: error.message,
          })
        );

        throw error;
      }),
    );
  }
}
