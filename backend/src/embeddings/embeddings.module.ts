import { Module } from '@nestjs/common';
import { GeminiEmbeddingService } from './gemini-embedding.service';

@Module({
  providers: [GeminiEmbeddingService],
  exports: [GeminiEmbeddingService],
})
export class EmbeddingsModule {}
