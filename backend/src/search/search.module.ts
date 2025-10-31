import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { QdrantModule } from '../qdrant/qdrant.module';
import { DatasourcesModule } from '../datasources/datasources.module';

@Module({
  imports: [EmbeddingsModule, QdrantModule, DatasourcesModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
