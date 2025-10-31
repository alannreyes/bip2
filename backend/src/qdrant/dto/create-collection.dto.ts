import { IsString, IsNumber, IsEnum, IsOptional, Min } from 'class-validator';

export enum DistanceMetric {
  COSINE = 'Cosine',
  EUCLIDEAN = 'Euclid',
  DOT = 'Dot',
}

export class CreateCollectionDto {
  @IsString()
  name: string;

  @IsNumber()
  @Min(1)
  vectorSize: number;

  @IsEnum(DistanceMetric)
  @IsOptional()
  distance?: DistanceMetric = DistanceMetric.COSINE;

  @IsNumber()
  @IsOptional()
  @Min(4)
  hnswM?: number = 16;

  @IsNumber()
  @IsOptional()
  @Min(4)
  hnswEfConstruct?: number = 100;
}
