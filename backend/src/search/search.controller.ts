import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Query,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SearchService } from './search.service';
import { SearchByTextDto } from './dto/search-by-text.dto';
import { Observable } from 'rxjs';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

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
      dto.limit || 10,
      dto.marca,
      dto.cliente,
      false, // Never include internet search in this endpoint
      dto.useLLMFilter || false, // Optional LLM filter (default: OFF - trust embeddings)
      dto.payloadFilters, // Optional payload filters for explicit field constraints
    );
  }

  @Sse('internet')
  searchInternet(@Query('query') query: string, @Query('collections') collections: string): Observable<MessageEvent> {
    if (!query) {
      throw new BadRequestException('Query text is required');
    }

    if (!collections) {
      throw new BadRequestException('Collections are required');
    }

    const collectionArray = collections.split(',');

    return this.searchService.searchInternetStream(query, collectionArray);
  }

  @Post('image')
  @UseInterceptors(FileInterceptor('image'))
  async searchByImage(
    @UploadedFile() file: Express.Multer.File,
    @Query('collection') collection: string,
    @Query('limit') limit?: string,
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

    const limitNum = limit ? parseInt(limit, 10) : 10;

    return await this.searchService.searchByImage(
      file.buffer,
      file.mimetype,
      collection,
      limitNum,
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
}
