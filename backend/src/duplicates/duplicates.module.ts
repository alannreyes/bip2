import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DuplicatesController } from './duplicates.controller';
import { DuplicateRulesController } from './duplicate-rules.controller';
import { DuplicatesService } from './duplicates.service';
import { DuplicateRulesService } from './duplicate-rules.service';
import { DuplicateRules } from './entities/duplicate-rules.entity';
import { QdrantModule } from '../qdrant/qdrant.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DuplicateRules]),
    QdrantModule,
    EmbeddingsModule,
  ],
  controllers: [DuplicatesController, DuplicateRulesController],
  providers: [DuplicatesService, DuplicateRulesService],
  exports: [DuplicatesService, DuplicateRulesService],
})
export class DuplicatesModule {}
