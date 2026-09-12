import { Module } from '@nestjs/common';
import { DatabaseModule } from './database.module';
import { ReminderWorker } from '../services/reminder.worker';

@Module({ imports: [DatabaseModule], providers: [ReminderWorker] })
export class CollectionsModule {}
