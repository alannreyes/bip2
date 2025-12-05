import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { ApiKey } from '../entities/api-key.entity';

export interface CreateApiKeyDto {
  name: string;
  description?: string;
  allowedIps?: string[];
  allowedEndpoints?: string[];
  expiresInDays?: number; // null = nunca expira
  createdBy?: string;
}

export interface ApiKeyValidationResult {
  valid: boolean;
  apiKey?: ApiKey;
  reason?: string;
}

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
  ) {}

  /**
   * Genera una nueva API Key
   * Retorna la key en texto plano UNA SOLA VEZ (no se almacena)
   */
  async createApiKey(dto: CreateApiKeyDto): Promise<{ apiKey: ApiKey; plainTextKey: string }> {
    // Generar key aleatoria: bip2_xxxxxxxxxxxxxxxxxxxxxxxxxxxx (32 chars random)
    const randomPart = randomBytes(24).toString('base64url');
    const plainTextKey = `bip2_${randomPart}`;
    const keyPrefix = plainTextKey.substring(0, 8);
    const keyHash = this.hashKey(plainTextKey);

    const apiKey = this.apiKeyRepository.create({
      name: dto.name,
      description: dto.description,
      keyHash,
      keyPrefix,
      allowedIps: dto.allowedIps,
      allowedEndpoints: dto.allowedEndpoints,
      expiresAt: dto.expiresInDays
        ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
        : null,
      createdBy: dto.createdBy,
      isActive: true,
    });

    const savedKey = await this.apiKeyRepository.save(apiKey);

    this.logger.log(`API Key created: ${dto.name} (${keyPrefix}...)`);

    return {
      apiKey: savedKey,
      plainTextKey, // ⚠️ Solo se muestra una vez
    };
  }

  /**
   * Valida una API Key
   */
  async validateApiKey(
    plainTextKey: string,
    requestIp?: string,
    requestEndpoint?: string,
  ): Promise<ApiKeyValidationResult> {
    if (!plainTextKey || !plainTextKey.startsWith('bip2_')) {
      return { valid: false, reason: 'Invalid API Key format' };
    }

    const keyHash = this.hashKey(plainTextKey);

    const apiKey = await this.apiKeyRepository.findOne({
      where: { keyHash },
    });

    if (!apiKey) {
      return { valid: false, reason: 'API Key not found' };
    }

    if (!apiKey.isActive) {
      return { valid: false, reason: 'API Key is disabled' };
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return { valid: false, reason: 'API Key has expired' };
    }

    // Validar IP si hay restricciones
    if (apiKey.allowedIps && apiKey.allowedIps.length > 0 && requestIp) {
      const cleanIp = requestIp.replace('::ffff:', ''); // Limpiar IPv6-mapped IPv4
      if (!apiKey.allowedIps.includes(cleanIp) && !apiKey.allowedIps.includes(requestIp)) {
        return { valid: false, reason: `IP ${cleanIp} not allowed for this API Key` };
      }
    }

    // Validar endpoint si hay restricciones
    if (apiKey.allowedEndpoints && apiKey.allowedEndpoints.length > 0 && requestEndpoint) {
      const endpointAllowed = apiKey.allowedEndpoints.some(
        allowed => requestEndpoint.startsWith(allowed)
      );
      if (!endpointAllowed) {
        return { valid: false, reason: `Endpoint ${requestEndpoint} not allowed for this API Key` };
      }
    }

    // Actualizar último uso (async, no bloqueante)
    this.updateLastUsed(apiKey.id).catch(err =>
      this.logger.error(`Failed to update lastUsedAt: ${err.message}`)
    );

    return { valid: true, apiKey };
  }

  /**
   * Actualiza el último uso de la API Key
   */
  private async updateLastUsed(id: string): Promise<void> {
    await this.apiKeyRepository.update(id, {
      lastUsedAt: new Date(),
      usageCount: () => 'usageCount + 1',
    });
  }

  /**
   * Lista todas las API Keys (sin mostrar el hash)
   */
  async listApiKeys(): Promise<Omit<ApiKey, 'keyHash'>[]> {
    const keys = await this.apiKeyRepository.find({
      order: { createdAt: 'DESC' },
    });

    return keys.map(({ keyHash, ...rest }) => rest);
  }

  /**
   * Obtiene una API Key por ID
   */
  async getApiKeyById(id: string): Promise<Omit<ApiKey, 'keyHash'> | null> {
    const key = await this.apiKeyRepository.findOne({ where: { id } });
    if (!key) return null;

    const { keyHash, ...rest } = key;
    return rest;
  }

  /**
   * Desactiva una API Key
   */
  async revokeApiKey(id: string): Promise<void> {
    const key = await this.apiKeyRepository.findOne({ where: { id } });
    if (!key) {
      throw new Error('API Key not found');
    }

    key.isActive = false;
    await this.apiKeyRepository.save(key);

    this.logger.log(`API Key revoked: ${key.name} (${key.keyPrefix}...)`);
  }

  /**
   * Reactiva una API Key
   */
  async activateApiKey(id: string): Promise<void> {
    const key = await this.apiKeyRepository.findOne({ where: { id } });
    if (!key) {
      throw new Error('API Key not found');
    }

    key.isActive = true;
    await this.apiKeyRepository.save(key);

    this.logger.log(`API Key activated: ${key.name} (${key.keyPrefix}...)`);
  }

  /**
   * Elimina una API Key permanentemente
   */
  async deleteApiKey(id: string): Promise<void> {
    const key = await this.apiKeyRepository.findOne({ where: { id } });
    if (!key) {
      throw new Error('API Key not found');
    }

    await this.apiKeyRepository.remove(key);

    this.logger.log(`API Key deleted: ${key.name} (${key.keyPrefix}...)`);
  }

  /**
   * Hash SHA-256 de la key
   */
  private hashKey(plainTextKey: string): string {
    return createHash('sha256').update(plainTextKey).digest('hex');
  }
}
