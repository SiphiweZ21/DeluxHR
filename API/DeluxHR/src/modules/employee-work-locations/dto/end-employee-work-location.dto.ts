import { IsISO8601 } from 'class-validator';
export class EndEmployeeWorkLocationDto {
  @IsISO8601() effectiveTo!: string;
}
