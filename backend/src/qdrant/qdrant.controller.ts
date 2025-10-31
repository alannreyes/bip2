import { Controller, Get, Post, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { QdrantService } from './qdrant.service';

@Controller('collections')
export class QdrantController {
  constructor(private readonly qdrantService: QdrantService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCollection(
    @Body()
    body: {
      name: string;
      vectorSize?: number;
      distance?: 'Cosine' | 'Euclid' | 'Dot';
      datasourceId?: string;
    },
  ) {
    return await this.qdrantService.createCollection(
      body.name,
      body.vectorSize,
      body.distance,
      body.datasourceId,
    );
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async registerExistingCollection(
    @Body()
    body: {
      name: string;
      datasourceId?: string;
    },
  ) {
    return await this.qdrantService.registerExistingCollection(
      body.name,
      body.datasourceId,
    );
  }

  @Get()
  async listCollections() {
    return await this.qdrantService.listCollections();
  }

  @Get(':name')
  async getCollection(@Param('name') name: string) {
    return await this.qdrantService.getCollection(name);
  }

  @Get(':name/info')
  async getCollectionInfo(@Param('name') name: string) {
    return await this.qdrantService.getCollectionInfo(name);
  }

  @Delete(':name')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCollection(@Param('name') name: string) {
    await this.qdrantService.deleteCollection(name);
  }
}
