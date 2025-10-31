import { Module, Global } from '@nestjs/common';
import { AIErrorCorrectionService } from './ai-error-correction.service';

@Global()
@Module({
  providers: [AIErrorCorrectionService],
  exports: [AIErrorCorrectionService],
})
export class CommonModule {}
