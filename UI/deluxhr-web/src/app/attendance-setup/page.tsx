"use client";
import {FeatureSetupWorkspace} from "../../components/feature-setup-workspace";
import {StructureSetup} from '../../components/onboarding/company-setup';
import {AttendanceReview} from '../../components/attendance/review';
export default function Page(){return <FeatureSetupWorkspace title="Work locations & shifts"><StructureSetup mode="attendance"/><AttendanceReview setupOnly/></FeatureSetupWorkspace>;}
