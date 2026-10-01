import { IsDateString } from 'class-validator';
export class EndShiftAssignmentDto { @IsDateString() effectiveTo!: string; }
