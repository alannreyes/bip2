import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulerService } from './scheduler.service';
import { Datasource } from '../datasources/entities/datasource.entity';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [TypeOrmModule.forFeature([Datasource]), SyncModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
