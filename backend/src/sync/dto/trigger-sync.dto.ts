import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class TriggerSyncDto {
  @IsString()
  datasourceId: string;

  @IsBoolean()
  @IsOptional()
  forceFull?: boolean = false;
}
