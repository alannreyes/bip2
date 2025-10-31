import { IsString, IsArray, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class WebhookSyncDto {
  @IsString()
  collection: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  codes: string[];
}
