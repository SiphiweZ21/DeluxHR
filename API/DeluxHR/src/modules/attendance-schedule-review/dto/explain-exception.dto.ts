import { IsString, MinLength, MaxLength } from 'class-validator';
export class ExplainExceptionDto { @IsString() @MinLength(5) @MaxLength(2000) explanation!: string; }
