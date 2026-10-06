import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './modules/auth.module';
import { CollectionsModule } from './modules/collections.module';
import { HealthModule } from './modules/health.module';
import { WorkspaceModule } from './modules/workspace.module';
import { WhatsAppModule } from './modules/whatsapp.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AuthModule,
    WorkspaceModule,
    WhatsAppModule,
    CollectionsModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
