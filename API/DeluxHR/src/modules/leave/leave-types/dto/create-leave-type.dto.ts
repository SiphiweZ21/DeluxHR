import { IsNotEmpty, IsString } from 'class-validator';

export class CreateLeaveTypeDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}
