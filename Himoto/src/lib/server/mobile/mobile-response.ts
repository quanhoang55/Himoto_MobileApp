import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

const headers = { 'Cache-Control': 'no-store' };

export function mobileData<T>(data: T, status = 200) {
  return NextResponse.json({ data, meta: { requestId: randomUUID() } }, { status, headers });
}

export function mobileError(code: string, message: string, status: number) {
  const requestId = randomUUID();
  return NextResponse.json({ error: { code, message }, requestId }, { status, headers });
}
