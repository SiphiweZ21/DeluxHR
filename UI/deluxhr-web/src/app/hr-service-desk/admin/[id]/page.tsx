'use client';
import { useParams } from 'next/navigation';
import { HrRequestDetail } from '../../../../components/people-services/hr-request-detail';
export default function Page() { const { id } = useParams<{ id: string }>(); return <HrRequestDetail id={id} admin/>; }
