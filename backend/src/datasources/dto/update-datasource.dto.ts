import { PartialType } from '@nestjs/mapped-types';
import { CreateDatasourceDto } from './create-datasource.dto';
import { IsEnum, IsOptional } from 'class-validator';

export class UpdateDatasourceDto extends PartialType(CreateDatasourceDto) {
  @IsOptional()
  @IsEnum(['active', 'paused', 'error'])
  status?: 'active' | 'paused' | 'error';
}
