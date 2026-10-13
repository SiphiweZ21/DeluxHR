"use client";
import {FeatureSetupWorkspace} from "../../components/feature-setup-workspace";
import {EmployeeSetup} from '../../components/onboarding/employee-setup';
import {EmployeeDocumentsSetup} from '../../components/onboarding/employee-documents';
import {WhatsAppEmployeeSetup} from '../../components/whatsapp-employee-setup';
export default function Page(){return <FeatureSetupWorkspace title="Employee import, verification & documents"><EmployeeSetup/><EmployeeDocumentsSetup/><WhatsAppEmployeeSetup/></FeatureSetupWorkspace>;}
