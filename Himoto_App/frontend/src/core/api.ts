import * as SecureStore from 'expo-secure-store';

export type User = { id: number; name: string; email: string; role: string; access_role?: string; permissions?: string[]; store_id?: number | null; scope_all?: boolean };
type Tokens = { accessToken: string; refreshToken: string; accessExpiresAt: string; refreshExpiresAt: string };
type Envelope<T> = { data: T; meta?: { requestId: string } };
type Failure = { error?: { code?: string; message?: string } };
const TOKEN_KEY = 'himoto-mobile-session-v1';
const origin = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
let tokens: Tokens | null = null;
let refreshPromise: Promise<boolean> | null = null;
let sessionExpired: (() => void) | null = null;

export class ApiError extends Error {
  constructor(message: string, public status: number, public code = 'UNKNOWN') { super(message); }
}

export function onSessionExpired(callback: () => void) { sessionExpired = callback; return () => { if (sessionExpired === callback) sessionExpired = null; }; }
export async function restoreTokens() {
  const saved = await SecureStore.getItemAsync(TOKEN_KEY);
  try { tokens = saved ? JSON.parse(saved) as Tokens : null; } catch { tokens = null; }
  return tokens !== null;
}
async function saveTokens(value: Tokens | null) {
  tokens = value;
  if (value) await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(value));
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}
function endpoint(path: string) {
  if (!origin || !/^https?:\/\//.test(origin)) throw new ApiError('Thiếu EXPO_PUBLIC_API_BASE_URL.', 0, 'CONFIGURATION');
  return `${origin}/api/mobile/v1${path}`;
}
async function send<T>(path: string, init: RequestInit = {}, bearer?: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(endpoint(path), { ...init, signal: controller.signal, headers: {
      Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...init.headers,
    } });
    const responseText = await response.text();
    let payload: Envelope<T> & Failure;
    try { payload = JSON.parse(responseText) as Envelope<T> & Failure; }
    catch {
      const message = response.status === 404
        ? 'Máy chủ này chưa triển khai Mobile API (/api/mobile/v1).'
        : `Máy chủ trả phản hồi không hợp lệ (HTTP ${response.status}).`;
      throw new ApiError(message, response.status, 'INVALID_RESPONSE');
    }
    if (!response.ok) throw new ApiError(payload.error?.message || 'Yêu cầu không thành công.', response.status, payload.error?.code);
    return payload.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(error instanceof Error && error.name === 'AbortError' ? 'Kết nối đã hết thời gian chờ.' : 'Không kết nối được máy chủ.', 0, 'NETWORK');
  } finally { clearTimeout(timeout); }
}
async function refresh() {
  if (!tokens) return false;
  if (!refreshPromise) refreshPromise = (async () => {
    try {
      const next = await send<Tokens & { user: User }>('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: tokens?.refreshToken }) });
      await saveTokens(next);
      return true;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      await saveTokens(null);
      sessionExpired?.();
      return false;
    }
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}
async function authorized<T>(path: string, init: RequestInit): Promise<T> {
  if (!tokens) throw new ApiError('Vui lòng đăng nhập.', 401, 'UNAUTHENTICATED');
  const attemptedToken = tokens.accessToken;
  try { return await send<T>(path, init, attemptedToken); }
  catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    if (tokens?.accessToken === attemptedToken && !(await refresh())) throw error;
    try { return await send<T>(path, init, tokens?.accessToken); }
    catch (retryError) {
      if (retryError instanceof ApiError && retryError.status === 401) {
        await saveTokens(null);
        sessionExpired?.();
      }
      throw retryError;
    }
  }
}
export function apiGet<T>(path: string): Promise<T> { return authorized<T>(path, {}); }
export const apiPost = <T,>(path: string, body: unknown): Promise<T> => authorized<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const apiPatch = <T,>(path: string, body: unknown): Promise<T> => authorized<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const apiDelete = <T,>(path: string, body: unknown): Promise<T> => authorized<T>(path, { method: 'DELETE', body: JSON.stringify(body) });
export async function signIn(email: string, password: string) {
  const result = await send<Tokens & { user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  await saveTokens(result);
  return result.user;
}
export async function signOut() {
  const refreshToken = tokens?.refreshToken;
  if (refreshToken) await send('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) });
  await saveTokens(null);
}
