import {
  Controller,
  Post,
  Body,
  Param,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { WebhookSyncDto } from './dto/webhook-sync.dto';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post(':datasourceId/sync')
  @HttpCode(HttpStatus.ACCEPTED)
  async handleWebhook(
    @Param('datasourceId') datasourceId: string,
    @Headers('authorization') authorization: string,
    @Body() webhookSyncDto: WebhookSyncDto,
  ) {
    // Validate authorization header
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = authorization.substring(7); // Remove "Bearer "

    // Validate webhook
    const isValid = await this.webhooksService.validateWebhook(datasourceId, token);
    if (!isValid) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    // Validate codes array
    if (!webhookSyncDto.codes || webhookSyncDto.codes.length === 0) {
      throw new BadRequestException('Codes array cannot be empty');
    }

    if (webhookSyncDto.codes.length > 500) {
      throw new BadRequestException('Maximum 500 codes per request');
    }

    // Trigger webhook sync
    const job = await this.webhooksService.processSyncRequest(datasourceId, webhookSyncDto.codes);

    return {
      jobId: job.id,
      totalCodes: webhookSyncDto.codes.length,
      status: 'queued',
      message: 'Sync job created, processing in background',
    };
  }
}
