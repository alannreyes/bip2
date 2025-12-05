import { Module, Global } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AIErrorCorrectionService } from './ai-error-correction.service';
import { AuditInterceptor } from './interceptors/audit.interceptor';

@Global()
@Module({
  providers: [
    AIErrorCorrectionService,
    // Interceptor global de auditoría
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [AIErrorCorrectionService],
})
export class CommonModule {}
