import { NextRequest } from 'next/server';
import { withMobileRequest } from '@/lib/server/mobile/mobile-request';
import { mobileData } from '@/lib/server/mobile/mobile-response';

export const runtime = 'nodejs';

export const GET = withMobileRequest<{ params: Promise<Record<string, string>> }>(null, (_request: NextRequest, _context, user) => mobileData(user));
