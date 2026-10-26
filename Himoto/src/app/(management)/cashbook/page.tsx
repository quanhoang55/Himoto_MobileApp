import type { Metadata } from 'next';
import { CashbookPage } from '@/components/management/CashbookPage';

export const metadata: Metadata = { title: 'Sổ quỹ / Sổ két — HIMOTO', description: 'Tra cứu phiếu thu và phiếu chi HIMOTO theo ngày, giờ, người thực hiện, lý do và nội dung.' };
export default function CashbookRoute() { return <CashbookPage />; }
