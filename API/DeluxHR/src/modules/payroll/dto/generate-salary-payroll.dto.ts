import {IsNumber,IsOptional,Min,IsString,MaxLength} from 'class-validator';
import {CreatePayrollRunDto} from './create-payroll-run.dto';
export class GenerateSalaryPayrollDto extends CreatePayrollRunDto {
 @IsOptional() @IsNumber() @Min(0) taxableAllowance?:number;
 @IsOptional() @IsNumber() @Min(0) additionalDeduction?:number;
 @IsOptional() @IsString() @MaxLength(500) adjustmentReason?:string;
}
