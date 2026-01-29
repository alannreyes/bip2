import { IsString, IsArray, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class ScoreCandidatesDto {
  @IsString()
  query: string;

  @IsString()
  collection: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one candidate ID is required' })
  @ArrayMaxSize(50, { message: 'Maximum 50 candidate IDs allowed' })
  @IsString({ each: true })
  candidateIds: string[];
}
