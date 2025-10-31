import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QdrantController } from './qdrant.controller';
import { QdrantService } from './qdrant.service';
import { QdrantCollection } from './entities/qdrant-collection.entity';

@Module({
  imports: [TypeOrmModule.forFeature([QdrantCollection])],
  controllers: [QdrantController],
  providers: [QdrantService],
  exports: [QdrantService],
})
export class QdrantModule {}
