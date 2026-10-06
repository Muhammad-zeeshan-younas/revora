import { Controller, Get, Headers, Inject, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { WhatsAppService } from '../services/whatsapp.service';

interface WebhookRequest extends Request {
  rawBody?: Buffer;
}

@Controller('whatsapp/webhook')
export class WhatsAppWebhookController {
  constructor(@Inject(WhatsAppService) private readonly whatsapp: WhatsAppService) {}

  @Get()
  verify(@Query() query: Record<string, string>): string {
    return this.whatsapp.verifyChallenge(
      query['hub.mode'] ?? '',
      query['hub.verify_token'] ?? '',
      query['hub.challenge'] ?? '',
    );
  }

  @Post()
  async receive(
    @Req() request: WebhookRequest,
    @Headers('x-hub-signature-256') signature: string | undefined,
  ): Promise<{ ok: boolean }> {
    await this.whatsapp.webhook(request.rawBody, signature, request.body as object);

    return { ok: true };
  }
}
