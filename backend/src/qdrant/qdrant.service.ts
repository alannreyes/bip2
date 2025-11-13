import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QdrantCollection } from './entities/qdrant-collection.entity';

@Injectable()
export class QdrantService {
  private readonly logger = new Logger(QdrantService.name);
  private client: QdrantClient;
  private clientCache: Map<string, QdrantClient> = new Map();

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(QdrantCollection)
    private readonly qdrantCollectionRepository: Repository<QdrantCollection>,
  ) {
    const host = this.configService.get('QDRANT_HOST');
    const port = this.configService.get('QDRANT_PORT');
    const apiKey = this.configService.get('QDRANT_API_KEY');

    this.client = new QdrantClient({
      url: `http://${host}:${port}`,
      apiKey: apiKey || undefined,
    });

    this.logger.log(`Qdrant client initialized: ${host}:${port}`);
  }

  /**
   * Get or create a Qdrant client for the specified host and port.
   * If no host/port is provided, returns the default client from env variables.
   */
  private getClientForDatasource(host?: string, port?: number): QdrantClient {
    // Use default client if no custom host/port
    if (!host && !port) {
      return this.client;
    }

    // Use env defaults if only one param is provided
    const finalHost = host || this.configService.get('QDRANT_HOST');
    const finalPort = port || this.configService.get('QDRANT_PORT');
    const cacheKey = `${finalHost}:${finalPort}`;

    // Return cached client if exists
    if (this.clientCache.has(cacheKey)) {
      return this.clientCache.get(cacheKey);
    }

    // Create new client
    const apiKey = this.configService.get('QDRANT_API_KEY');
    const newClient = new QdrantClient({
      url: `http://${finalHost}:${finalPort}`,
      apiKey: apiKey || undefined,
    });

    this.clientCache.set(cacheKey, newClient);
    this.logger.log(`Created new Qdrant client: ${finalHost}:${finalPort}`);

    return newClient;
  }

  async createCollection(
    name: string,
    vectorSize: number = 3072,
    distance: 'Cosine' | 'Euclid' | 'Dot' = 'Cosine',
    datasourceId?: string,
    qdrantHost?: string,
    qdrantPort?: number,
  ): Promise<QdrantCollection> {
    try {
      const client = this.getClientForDatasource(qdrantHost, qdrantPort);

      // Create collection in Qdrant
      await client.createCollection(name, {
        vectors: {
          size: vectorSize,
          distance,
        },
        optimizers_config: {
          indexing_threshold: 20000,
        },
        hnsw_config: {
          m: 16,
          ef_construct: 100,
        },
      });

      this.logger.log(`Created Qdrant collection: ${name}`);

      // Save metadata in PostgreSQL
      const collection = this.qdrantCollectionRepository.create({
        name,
        vectorSize,
        distance,
        datasourceId,
        totalPoints: 0,
      });

      return await this.qdrantCollectionRepository.save(collection);
    } catch (error) {
      this.logger.error(`Failed to create collection ${name}: ${error.message}`);
      throw new BadRequestException(`Failed to create collection: ${error.message}`);
    }
  }

  async registerExistingCollection(
    name: string,
    datasourceId?: string,
  ): Promise<QdrantCollection> {
    try {
      // Check if collection exists in Qdrant
      const qdrantInfo = await this.client.getCollection(name);
      const vectorSize = (qdrantInfo as any).config.params.vectors.size;
      const distance = (qdrantInfo as any).config.params.vectors.distance;
      const totalPoints = (qdrantInfo as any).points_count || 0;

      // Check if already registered in PostgreSQL
      const existing = await this.qdrantCollectionRepository.findOne({ where: { name } });
      if (existing) {
        this.logger.log(`Collection ${name} already registered, updating...`);
        existing.totalPoints = totalPoints;
        existing.datasourceId = datasourceId || existing.datasourceId;
        return await this.qdrantCollectionRepository.save(existing);
      }

      // Register in PostgreSQL
      const collection = this.qdrantCollectionRepository.create({
        name,
        vectorSize,
        distance,
        datasourceId,
        totalPoints,
      });

      this.logger.log(`Registered existing Qdrant collection: ${name}`);
      return await this.qdrantCollectionRepository.save(collection);
    } catch (error) {
      this.logger.error(`Failed to register collection ${name}: ${error.message}`);
      throw new BadRequestException(`Failed to register collection: ${error.message}`);
    }
  }

  async getCollection(name: string): Promise<any> {
    try {
      const collection = await this.client.getCollection(name);
      return collection;
    } catch (error) {
      this.logger.error(`Failed to get collection ${name}: ${error.message}`);
      throw new BadRequestException(`Collection not found: ${name}`);
    }
  }

  async listCollections(): Promise<QdrantCollection[]> {
    try {
      // Get collections from Qdrant
      const qdrantCollections = await this.client.getCollections();

      // Get metadata from PostgreSQL
      const dbCollections = await this.qdrantCollectionRepository.find({
        relations: ['datasource'],
        order: { createdAt: 'DESC' },
      });

      // Update point counts from Qdrant
      for (const dbCollection of dbCollections) {
        const qdrantCollection = qdrantCollections.collections.find(
          (c: any) => c.name === dbCollection.name,
        );
        if (qdrantCollection) {
          // Get detailed collection info to get points_count
          const detailedInfo = await this.client.getCollection(dbCollection.name);
          dbCollection.totalPoints = (detailedInfo as any).points_count || 0;
          await this.qdrantCollectionRepository.save(dbCollection);
        }
      }

      return dbCollections;
    } catch (error) {
      this.logger.error(`Failed to list collections: ${error.message}`);
      throw new BadRequestException(`Failed to list collections: ${error.message}`);
    }
  }

  async deleteCollection(name: string): Promise<void> {
    try {
      // Delete from Qdrant
      await this.client.deleteCollection(name);
      this.logger.log(`Deleted Qdrant collection: ${name}`);

      // Delete metadata from PostgreSQL
      const collection = await this.qdrantCollectionRepository.findOne({ where: { name } });
      if (collection) {
        await this.qdrantCollectionRepository.remove(collection);
      }
    } catch (error) {
      this.logger.error(`Failed to delete collection ${name}: ${error.message}`);
      throw new BadRequestException(`Failed to delete collection: ${error.message}`);
    }
  }

  async upsertPoints(
    collectionName: string,
    points: any[],
    qdrantHost?: string,
    qdrantPort?: number,
  ): Promise<void> {
    try {
      const client = this.getClientForDatasource(qdrantHost, qdrantPort);

      this.logger.debug(`Upserting ${points.length} points to ${collectionName}`);
      this.logger.debug(`First point: ${JSON.stringify(points[0], null, 2)}`);

      await client.upsert(collectionName, {
        wait: true,
        points,
      });

      this.logger.debug(`Upserted ${points.length} points to ${collectionName}`);
    } catch (error) {
      // Check if error is "collection not found" and try to create it
      const errorMsg = error.message || error.data?.status?.error || '';
      if (errorMsg.includes('doesn\'t exist') || errorMsg.includes('not found') || errorMsg.includes('Not Found')) {
        this.logger.warn(`Collection ${collectionName} not found, creating it automatically...`);

        try {
          const client = this.getClientForDatasource(qdrantHost, qdrantPort);

          // Create collection with default settings (3072-dim vectors for Gemini embeddings)
          await client.createCollection(collectionName, {
            vectors: {
              size: 3072,
              distance: 'Cosine',
            },
            optimizers_config: {
              indexing_threshold: 20000,
            },
            hnsw_config: {
              m: 16,
              ef_construct: 100,
            },
          });

          this.logger.log(`Auto-created Qdrant collection: ${collectionName}`);

          // Register collection in PostgreSQL database
          const existingCollection = await this.qdrantCollectionRepository.findOne({
            where: { name: collectionName },
          });

          if (!existingCollection) {
            const collection = this.qdrantCollectionRepository.create({
              name: collectionName,
              vectorSize: 3072,
              distance: 'Cosine',
              totalPoints: 0,
            });
            await this.qdrantCollectionRepository.save(collection);
            this.logger.log(`Registered collection ${collectionName} in database`);
          }

          // Retry upserting points
          await client.upsert(collectionName, {
            wait: true,
            points,
          });

          this.logger.debug(`Upserted ${points.length} points to ${collectionName} after creating collection`);
          return; // Success!
        } catch (createError) {
          this.logger.error(`Failed to auto-create collection ${collectionName}: ${createError.message}`);
          throw new BadRequestException(`Failed to create collection: ${createError.message}`);
        }
      }

      // If not a "not found" error, log and throw original error
      this.logger.error(`Failed to upsert points to ${collectionName}: ${error.message}`);

      // Log detailed error information
      if (error.response) {
        this.logger.error(`HTTP Status: ${error.response.status}`);
        this.logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
      }

      if (error.data) {
        this.logger.error(`Error data: ${JSON.stringify(error.data)}`);
      }

      // Log sample of points that failed
      this.logger.error(`Failed batch size: ${points.length}`);
      this.logger.error(`First point in batch: ${JSON.stringify(points[0], null, 2)}`);
      if (points.length > 1) {
        this.logger.error(`Last point in batch: ${JSON.stringify(points[points.length - 1], null, 2)}`);
      }

      // Check if any point IDs are invalid
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const invalidIds = points.filter(p => !uuidRegex.test(p.id));
      if (invalidIds.length > 0) {
        this.logger.error(`Found ${invalidIds.length} invalid UUIDs!`);
        this.logger.error(`Sample invalid IDs: ${JSON.stringify(invalidIds.slice(0, 3).map(p => p.id))}`);
      }

      throw new BadRequestException(`Failed to upsert points: ${error.message}`);
    }
  }

  async deletePoints(collectionName: string, pointIds: string[]): Promise<void> {
    try {
      await this.client.delete(collectionName, {
        wait: true,
        points: pointIds,
      });

      this.logger.debug(`Deleted ${pointIds.length} points from ${collectionName}`);
    } catch (error) {
      this.logger.error(`Failed to delete points from ${collectionName}: ${error.message}`);
      throw new BadRequestException(`Failed to delete points: ${error.message}`);
    }
  }

  async search(
    collectionName: string,
    vector: number[],
    limit: number = 10,
    filter?: any,
    qdrantHost?: string,
    qdrantPort?: number,
  ): Promise<any[]> {
    try {
      const client = this.getClientForDatasource(qdrantHost, qdrantPort);

      const searchResult = await client.search(collectionName, {
        vector,
        limit,
        filter,
        with_payload: true,
      });

      return searchResult;
    } catch (error) {
      this.logger.error(`Search failed in ${collectionName}: ${error.message}`);
      throw new BadRequestException(`Search failed: ${error.message}`);
    }
  }

  async recommend(
    collectionName: string,
    positiveIds: string[],
    negativeIds: string[] = [],
    limit: number = 10,
    qdrantHost?: string,
    qdrantPort?: number,
  ): Promise<any[]> {
    try {
      const client = this.getClientForDatasource(qdrantHost, qdrantPort);

      this.logger.debug(
        `Recommending from collection ${collectionName}: ` +
        `positive=[${positiveIds.join(', ')}], negative=[${negativeIds.join(', ')}], limit=${limit}`
      );

      const recommendResult = await client.recommend(collectionName, {
        positive: positiveIds,
        negative: negativeIds.length > 0 ? negativeIds : undefined,
        limit,
        with_payload: true,
      });

      this.logger.debug(`Recommend found ${recommendResult.length} results`);
      return recommendResult;
    } catch (error) {
      this.logger.error(`Recommend failed in ${collectionName}: ${error.message}`);
      throw new BadRequestException(`Recommend failed: ${error.message}`);
    }
  }

  async getCollectionInfo(name: string): Promise<any> {
    try {
      const info = await this.client.getCollection(name);
      return info;
    } catch (error) {
      this.logger.error(`Failed to get collection info ${name}: ${error.message}`);
      throw new BadRequestException(`Failed to get collection info: ${error.message}`);
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    try {
      await this.client.getCollections();
      return { healthy: true, message: 'Qdrant is healthy' };
    } catch (error) {
      this.logger.error(`Qdrant health check failed: ${error.message}`);
      return { healthy: false, message: error.message };
    }
  }

  /**
   * Get collection metadata from database (includes datasourceId)
   */
  async getCollectionMetadata(name: string): Promise<QdrantCollection | null> {
    try {
      return await this.qdrantCollectionRepository.findOne({
        where: { name },
        relations: ['datasource'],
      });
    } catch (error) {
      this.logger.error(`Failed to get collection metadata for ${name}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get a single point (product) by ID from a collection with all its payload fields
   * Useful for seeing all available payload fields and their values
   */
  async getPointById(
    collectionName: string,
    pointId: string,
    qdrantHost?: string,
    qdrantPort?: number,
  ): Promise<any> {
    try {
      const client = this.getClientForDatasource(qdrantHost, qdrantPort);

      this.logger.debug(`Retrieving point ${pointId} from collection ${collectionName}`);

      // Retrieve the point with all payload data
      const result = await client.retrieve(collectionName, {
        ids: [pointId],
        with_payload: true,
      });

      if (!result || result.length === 0) {
        this.logger.warn(`Point ${pointId} not found in collection ${collectionName}`);
        return null;
      }

      const point = result[0];

      this.logger.log(`Retrieved point ${pointId} from ${collectionName} successfully`);

      return {
        id: point.id,
        score: point.score || 'N/A',
        payload: point.payload || {},
        vector_size: point.vector ? point.vector.length : 0,
      };
    } catch (error) {
      this.logger.error(`Failed to retrieve point ${pointId}: ${error.message}`);
      throw new BadRequestException(`Failed to retrieve point: ${error.message}`);
    }
  }

  getClient(): QdrantClient {
    return this.client;
  }
}
