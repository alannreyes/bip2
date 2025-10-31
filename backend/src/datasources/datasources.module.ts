import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatasourcesController } from './datasources.controller';
import { DatasourcesService } from './datasources.service';
import { Datasource } from './entities/datasource.entity';
import { SyncJob } from '../sync/entities/sync-job.entity';
import { MssqlConnector } from './connectors/mssql.connector';
import { MysqlConnector } from './connectors/mysql.connector';
import { PostgresqlConnector } from './connectors/postgresql.connector';
import { QdrantModule } from '../qdrant/qdrant.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Datasource, SyncJob]),
    QdrantModule,
    CommonModule,
  ],
  controllers: [DatasourcesController],
  providers: [
    DatasourcesService,
    MssqlConnector,
    MysqlConnector,
    PostgresqlConnector,
  ],
  exports: [
    DatasourcesService,
    MssqlConnector,
    MysqlConnector,
    PostgresqlConnector,
  ],
})
export class DatasourcesModule {}
