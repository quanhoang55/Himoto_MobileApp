import 'server-only';
import type { NextRequest } from 'next/server';

export class MobileBodyError extends Error {}

export async function readMobileJson(request: NextRequest, maxBytes = 4096): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new MobileBodyError('Yêu cầu JSON không hợp lệ.');
  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new MobileBodyError('Yêu cầu quá lớn.');
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new MobileBodyError('Yêu cầu JSON không hợp lệ.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MobileBodyError('Yêu cầu JSON không hợp lệ.');
  return value as Record<string, unknown>;
}
