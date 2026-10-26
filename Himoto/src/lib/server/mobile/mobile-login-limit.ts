import 'server-only';
import { createHash } from 'node:crypto';
import { ownerDatabase } from '../himoto-database';
import { LoginError } from '../management-session';

type Database = Pick<typeof ownerDatabase, 'query'>;
const hashLogin = (email: string) => createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

export async function checkMobileLoginLimit(email: string, database: Database = ownerDatabase) {
  const result = await database.query(`INSERT INTO himoto.management_mobile_login_attempts(login_hash,attempts,window_expires_at)
    VALUES($1,1,now()+interval '15 minutes')
    ON CONFLICT(login_hash) DO UPDATE SET
      attempts=CASE WHEN himoto.management_mobile_login_attempts.window_expires_at<=now() THEN 1
                    ELSE LEAST(himoto.management_mobile_login_attempts.attempts+1,11) END,
      window_expires_at=CASE WHEN himoto.management_mobile_login_attempts.window_expires_at<=now()
                             THEN now()+interval '15 minutes' ELSE himoto.management_mobile_login_attempts.window_expires_at END
    RETURNING attempts`, [hashLogin(email)]);
  if (Number(result.rows[0]?.attempts) > 10) throw new LoginError('Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.', 429);
}

export async function clearMobileLoginLimit(email: string, database: Database = ownerDatabase) {
  await database.query('DELETE FROM himoto.management_mobile_login_attempts WHERE login_hash=$1', [hashLogin(email)]);
}
