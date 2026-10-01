import {
  IsString,
  MaxLength,
} from 'class-validator';

export class KioskAuthDto {
  @IsString()
  @MaxLength(80)
  deviceCode!: string;

  @IsString()
  @MaxLength(200)
  deviceSecret!: string;
}
