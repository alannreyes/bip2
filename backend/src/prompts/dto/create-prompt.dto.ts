import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class CreatePromptDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(50, { message: 'Prompt content must be at least 50 characters' })
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeDescription?: string;
}

export class UpdatePromptDto {
  @IsString()
  @MinLength(50, { message: 'Prompt content must be at least 50 characters' })
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeDescription?: string;
}
