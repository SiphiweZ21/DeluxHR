'use client';
import { useParams } from 'next/navigation';
import { AnnouncementDetail } from '../../../../components/people-services/announcement-detail';
export default function Page() { const { id } = useParams<{ id: string }>(); return <AnnouncementDetail id={id} admin/>; }
