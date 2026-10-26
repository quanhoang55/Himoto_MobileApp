import 'server-only';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ownerDatabase } from '../himoto-database';
import { userById, type SessionUser } from '../management-session';

export const MOBILE_ACCESS_SECONDS = 15 * 60;
export const MOBILE_REFRESH_SECONDS = 30 * 24 * 60 * 60;

type Database = Pick<typeof ownerDatabase, 'query'>;
type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
};

const TOKEN_PATTERN = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;

export class MobileSessionError extends Error {
  constructor(message = 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.', public status = 401) {
    super(message);
  }
}

function makeToken(sessionId: string) {
  return `${sessionId}.${randomBytes(32).toString('base64url')}`;
}

function tokenParts(token: string | undefined) {
  if (!token || token.length >= 100) return null;
  const match = TOKEN_PATTERN.exec(token);
  if (!match) return null;
  return { id: match[1], hash: createHash('sha256').update(token).digest('hex') };
}

export async function issueMobileSession(userId: number, database: Database = ownerDatabase, now = new Date()): Promise<SessionTokens> {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new MobileSessionError();
  const id = randomUUID();
  const accessToken = makeToken(id);
  const refreshToken = makeToken(id);
  const accessExpiresAt = new Date(now.getTime() + MOBILE_ACCESS_SECONDS * 1000).toISOString();
  const refreshExpiresAt = new Date(now.getTime() + MOBILE_REFRESH_SECONDS * 1000).toISOString();
  await database.query(`INSERT INTO himoto.management_mobile_sessions
    (id,user_id,access_token_hash,refresh_token_hash,access_expires_at,refresh_expires_at)
    VALUES($1,$2,$3,$4,$5,$6)`, [id, userId, tokenParts(accessToken)!.hash, tokenParts(refreshToken)!.hash, accessExpiresAt, refreshExpiresAt]);
  return { accessToken, refreshToken, accessExpiresAt, refreshExpiresAt };
}

export async function resolveMobileSession(token: string | undefined, database: Database = ownerDatabase): Promise<SessionUser | null> {
  const parts = tokenParts(token);
  if (!parts) return null;
  const result = await database.query(`SELECT user_id FROM himoto.management_mobile_sessions
    WHERE id=$1 AND access_token_hash=$2 AND access_expires_at>now()
      AND refresh_expires_at>now() AND revoked_at IS NULL`, [parts.id, parts.hash]);
  const userId = Number(result.rows[0]?.user_id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  const user = await userById(userId, database);
  if (!user) await database.query('UPDATE himoto.management_mobile_sessions SET revoked_at=now() WHERE id=$1', [parts.id]);
  return user;
}

export async function rotateMobileSession(refreshToken: string | undefined, database: Database = ownerDatabase, now = new Date()) {
  const parts = tokenParts(refreshToken);
  if (!parts) throw new MobileSessionError();
  const accessToken = makeToken(parts.id);
  const nextRefreshToken = makeToken(parts.id);
  const requestedAccessExpiry = new Date(now.getTime() + MOBILE_ACCESS_SECONDS * 1000).toISOString();
  const result = await database.query(`UPDATE himoto.management_mobile_sessions
    SET access_token_hash=$1,refresh_token_hash=$2,
        access_expires_at=LEAST($3::timestamptz,refresh_expires_at),rotated_at=now()
    WHERE id=$4 AND refresh_token_hash=$5 AND refresh_expires_at>now() AND revoked_at IS NULL
    RETURNING user_id,access_expires_at,refresh_expires_at`,
    [tokenParts(accessToken)!.hash, tokenParts(nextRefreshToken)!.hash, requestedAccessExpiry, parts.id, parts.hash]);
  const row = result.rows[0];
  if (!row) throw new MobileSessionError();
  const user = await userById(Number(row.user_id), database);
  if (!user) {
    await database.query('UPDATE himoto.management_mobile_sessions SET revoked_at=now() WHERE id=$1', [parts.id]);
    throw new MobileSessionError();
  }
  return {
    user,
    accessToken,
    refreshToken: nextRefreshToken,
    accessExpiresAt: new Date(row.access_expires_at).toISOString(),
    refreshExpiresAt: new Date(row.refresh_expires_at).toISOString(),
  };
}

export async function revokeMobileSession(refreshToken: string | undefined, database: Database = ownerDatabase): Promise<void> {
  const parts = tokenParts(refreshToken);
  if (!parts) return;
  await database.query(`UPDATE himoto.management_mobile_sessions SET revoked_at=now()
    WHERE id=$1 AND refresh_token_hash=$2 AND revoked_at IS NULL`, [parts.id, parts.hash]);
}
