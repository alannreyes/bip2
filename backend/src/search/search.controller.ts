import {
  Controller,
  Post,
  Get,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Query,
  Param,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SearchService } from './search.service';
import { SearchByTextDto } from './dto/search-by-text.dto';
import { QdrantService } from '../qdrant/qdrant.service';

@Controller('search')
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly qdrantService: QdrantService,
  ) {}

  @Get('product/:collection/:productId')
  async getProductPayload(
    @Param('collection') collection: string,
    @Param('productId') productId: string,
  ) {
    if (!collection) {
      throw new BadRequestException('Collection name is required');
    }

    if (!productId) {
      throw new BadRequestException('Product ID is required');
    }

    const product = await this.qdrantService.getPointById(collection, productId);

    if (!product) {
      throw new BadRequestException(`Product ${productId} not found in collection ${collection}`);
    }

    return {
      collection,
      productId,
      ...product,
      payload_fields: product.payload ? Object.keys(product.payload) : [],
    };
  }

  @Post('text')
  async searchByText(@Body() dto: SearchByTextDto) {
    if (!dto.query) {
      throw new BadRequestException('Query text is required');
    }

    if (!dto.collections || dto.collections.length === 0) {
      throw new BadRequestException('At least one collection must be selected');
    }

    return await this.searchService.searchByTextMultipleCollections(
      dto.query,
      dto.collections,
      dto.limit ?? 3, // Default 3 for precision-focused results
      dto.marca,
      dto.cliente,
      false, // Never include internet search in this endpoint
      dto.useLLMFilter ?? false, // Optional LLM filter (default: OFF - trust embeddings)
      dto.payloadFilters, // Optional payload filters for explicit field constraints
      dto.minRelevancia, // Dynamic default in service: 0.65 with LLM, 0.68 without LLM
    );
  }

  @Post('image')
  @UseInterceptors(FileInterceptor('image'))
  async searchByImage(
    @UploadedFile() file: Express.Multer.File,
    @Query('collection') collection: string,
    @Query('limit') limit?: string,
    @Query('useLLMFilter') useLLMFilter?: string,
    @Query('minRelevancia') minRelevancia?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No image or PDF file provided');
    }

    if (!collection) {
      throw new BadRequestException('Collection name is required');
    }

    // Validate file type - allow images and PDFs
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Allowed: JPEG, PNG, WEBP, PDF');
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds 10MB limit');
    }

    const limitNum = limit ? parseInt(limit, 10) : 3; // Default 3 for precision-focused results
    const useLLM = useLLMFilter === 'true';
    const minRel = minRelevancia ? parseFloat(minRelevancia) : undefined;

    return await this.searchService.searchByImage(
      file.buffer,
      file.mimetype,
      collection,
      limitNum,
      useLLM,
      minRel,
    );
  }

  @Post('recommend')
  async recommend(
    @Body('collection') collection: string,
    @Body('positiveIds') positiveIds: string[],
    @Body('negativeIds') negativeIds?: string[],
    @Body('limit') limit?: number,
  ) {
    if (!collection) {
      throw new BadRequestException('Collection name is required');
    }

    if (!positiveIds || positiveIds.length === 0) {
      throw new BadRequestException('At least one positive ID is required');
    }

    const limitNum = limit || 10;

    return await this.searchService.recommend(
      collection,
      positiveIds,
      negativeIds || [],
      limitNum,
    );
  }

  @Post('raw-vectorial')
  async getRawVectorialResults(@Body() dto: SearchByTextDto) {
    if (!dto.query) {
      throw new BadRequestException('Query text is required');
    }

    if (!dto.collections || dto.collections.length === 0) {
      throw new BadRequestException('At least one collection must be selected');
    }

    return await this.searchService.getRawVectorialResults(
      dto.query,
      dto.collections,
      dto.limit || 20,
    );
  }

  // SECURITY: Internet search endpoint removed - was causing firewall alerts
  // due to Google Search Grounding visiting external URLs
}