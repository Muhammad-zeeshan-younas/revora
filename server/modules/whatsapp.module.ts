import { Module } from '@nestjs/common';
import { DatabaseModule } from './database.module';
import { WhatsAppWebhookController } from '../controllers/whatsapp-webhook.controller';
import { WhatsAppService } from '../services/whatsapp.service';

@Module({
  imports: [DatabaseModule],
  controllers: [WhatsAppWebhookController],
  providers: [WhatsAppService],
})
export class WhatsAppModule {}
