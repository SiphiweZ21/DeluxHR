"use client";
import {FeatureSetupWorkspace} from "../../components/feature-setup-workspace";
import {LeaveSetup,OpeningLeave} from '../../components/onboarding/leave-setup';
export default function Page(){return <FeatureSetupWorkspace title="Leave settings, holidays & opening balances"><LeaveSetup/><OpeningLeave/></FeatureSetupWorkspace>;}
