import { NextRequest } from 'next/server';
import { withMobileRequest } from '@/lib/server/mobile/mobile-request';
import { mobileData, mobileError } from '@/lib/server/mobile/mobile-response';
import { MobileListError, mobileRecordId, readMobileDetail } from '@/lib/server/mobile/mobile-lists';
import { himotoPool } from '@/lib/server/himoto-database';
import { readMobileJson, MobileBodyError } from '@/lib/server/mobile/mobile-body';

export const runtime = 'nodejs';

export const GET = withMobileRequest<{ params: Promise<{ id: string }> }>('customers.read', async (_request: NextRequest, context) => {
  try {
    const id = mobileRecordId((await context.params).id);
    const item = await readMobileDetail('customers', id);
    return item ? mobileData(item) : mobileError('NOT_FOUND', 'Không tìm thấy khách hàng.', 404);
  } catch (error) {
    if (error instanceof MobileListError) return mobileError('INVALID_INPUT', error.message, 400);
    return mobileError('UNAVAILABLE', 'Không tải được khách hàng.', 503);
  }
});

export const PATCH = withMobileRequest<{ params: Promise<{ id: string }> }>('customers.write', async (request: NextRequest, context, user) => {
  let client;
  try {
    const id = mobileRecordId((await context.params).id);
    const body = await readMobileJson(request, 8192);
    if (Object.keys(body).some(key => !['name','phone','email','address','idCard','revision'].includes(key))) return mobileError('INVALID_INPUT', 'Thông tin khách hàng không hợp lệ.', 400);
    const text = (key: string) => typeof body[key] === 'string' ? (body[key] as string).trim() : '';
    const name=text('name'), phone=text('phone'), email=text('email'), address=text('address'), idCard=text('idCard').replace(/\s/g,'');
    const revision=text('revision');
    if (!name || name.length>255 || !/^\+?\d{9,13}$/.test(phone.replace(/[\s.()-]/g,'')) || address.length>2000 || email.length>320 || email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || idCard && !/^\d{9}$|^\d{12}$/.test(idCard) || !/^\d{1,20}$/.test(revision)) return mobileError('INVALID_INPUT', 'Kiểm tra họ tên, số điện thoại, giấy tờ, email và địa chỉ.', 400);
    client=await himotoPool.connect();
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    if(idCard){
      await client.query('LOCK TABLE himoto.customers IN SHARE ROW EXCLUSIVE MODE');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`customer:${idCard}`]);
    }
    const current=await client.query('SELECT id,store_id,xmin::text AS revision FROM himoto.customers WHERE id=$1 FOR UPDATE',[id]);
    if(!current.rowCount){await client.query('ROLLBACK');return mobileError('NOT_FOUND','Không tìm thấy khách hàng.',404);}
    if(current.rows[0].revision!==revision){await client.query('ROLLBACK');return mobileError('CONFLICT','Hồ sơ đã được thay đổi. Hãy tải lại trước khi lưu.',409);}
    if(!user.scope_all&&Number(current.rows[0].store_id)!==Number(user.store_id)){await client.query('ROLLBACK');return mobileError('FORBIDDEN','Khách hàng nằm ngoài phạm vi được phân công.',403);}
    if(idCard){
      const duplicate=await client.query('SELECT id FROM himoto.find_customer_duplicate($2,\'\',$1) AS id WHERE id IS NOT NULL',[id,idCard]);
      if(duplicate.rowCount){await client.query('ROLLBACK');return mobileError('CONFLICT','CCCD/CMND đã thuộc hồ sơ khách hàng khác.',409);}
    }
    const result=await client.query(`UPDATE himoto.customers SET name=$2,phone=$3,email=NULLIF($4,''),address=NULLIF($5,''),id_card=NULLIF($6,''),updated_at=now() WHERE id=$1 RETURNING id,name,email,phone,address,id_card,xmin::text AS revision`,[id,name,phone,email,address,idCard]);
    await client.query('COMMIT');
    return mobileData({id:Number(result.rows[0].id),name:String(result.rows[0].name),email:String(result.rows[0].email||''),phone:String(result.rows[0].phone),address:String(result.rows[0].address||''),idCard:String(result.rows[0].id_card||''),revision:String(result.rows[0].revision)});
  } catch(error) {
    if(client) await client.query('ROLLBACK').catch(()=>{});
    if(error instanceof MobileBodyError||error instanceof MobileListError)return mobileError('INVALID_INPUT',error.message,400);
    return mobileError('UNAVAILABLE','Không lưu được thay đổi khách hàng.',503);
  } finally {client?.release();}
});

export const DELETE = withMobileRequest<{ params: Promise<{ id: string }> }>('customers.write', async (_request, context, user) => {
  let client;
  try {
    const id=mobileRecordId((await context.params).id);
    client=await himotoPool.connect();await client.query('BEGIN');
    const current=await client.query('SELECT id,store_id FROM himoto.customers WHERE id=$1 FOR UPDATE',[id]);
    if(!current.rowCount){await client.query('ROLLBACK');return mobileError('NOT_FOUND','Không tìm thấy khách hàng.',404);}
    if(!user.scope_all&&Number(current.rows[0].store_id)!==Number(user.store_id)){await client.query('ROLLBACK');return mobileError('FORBIDDEN','Khách hàng nằm ngoài phạm vi được phân công.',403);}
    const linked=await client.query('SELECT count(*)::int AS count FROM himoto.orders WHERE customer_id=$1',[id]);
    const count=Number(linked.rows[0]?.count||0);
    if(count){await client.query('ROLLBACK');return mobileError('CONFLICT',`Không thể xóa vì hồ sơ liên kết với ${count} hợp đồng.`,409);}
    await client.query('DELETE FROM himoto.customers WHERE id=$1',[id]);await client.query('COMMIT');return mobileData({id,deleted:true});
  } catch {if(client)await client.query('ROLLBACK').catch(()=>{});return mobileError('UNAVAILABLE','Không xóa được khách hàng.',503);}
  finally{client?.release();}
});
