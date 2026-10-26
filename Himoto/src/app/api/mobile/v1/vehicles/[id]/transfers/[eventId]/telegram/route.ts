import { after, NextRequest } from 'next/server';
import { VehicleTransferTelegramError, readVehicleTransferTelegram, saveVehicleTransferTelegram } from '@/lib/server/vehicle-transfer-telegram';
import { ownerDatabase } from '@/lib/server/himoto-database';
import { MobileBodyError, readMobileJson } from '@/lib/server/mobile/mobile-body';
import { mobileData, mobileError } from '@/lib/server/mobile/mobile-response';
import { MobileListError, mobileRecordId } from '@/lib/server/mobile/mobile-lists';
import { withMobileRequest } from '@/lib/server/mobile/mobile-request';
import { dispatchContractNotifications } from '@/lib/server/contract-notifications';
import type { SessionUser } from '@/lib/server/management-session';

export const runtime='nodejs';
export const maxDuration=300;
type Context={params:Promise<{id:string;eventId:string}>};

async function handle(context:Context,write:boolean,request?:NextRequest,user?:SessionUser) {
  let client;
  try {
    const {id,eventId}=await context.params,vehicleId=mobileRecordId(id),transferEventId=mobileRecordId(eventId);
    if(write){const body=await readMobileJson(request!,100);if(Object.keys(body).length!==1||body.action!=='send')throw new MobileBodyError('Chọn thao tác gửi hợp lệ.');}
    client=await ownerDatabase.connect();await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='15s'");
    const state=write?await saveVehicleTransferTelegram(client,vehicleId,transferEventId,user!):(await readVehicleTransferTelegram(client,vehicleId,transferEventId,user!)).state;
    await client.query('COMMIT');
    if(write||['pending','sending'].includes(state.status||''))after(async()=>{await dispatchContractNotifications(undefined,2,undefined,undefined,[transferEventId]);});
    return mobileData(state);
  }catch(error){
    if(client)await client.query('ROLLBACK').catch(()=>{});
    if(error instanceof MobileBodyError||error instanceof MobileListError)return mobileError('INVALID_INPUT',error.message,400);
    if(error instanceof VehicleTransferTelegramError)return mobileError(error.status===403?'FORBIDDEN':error.status===404?'NOT_FOUND':'INVALID_INPUT',error.message,error.status);
    return mobileError('UNAVAILABLE','Không xử lý được Telegram của lượt luân chuyển.',503);
  }finally{client?.release();}
}

export const GET=withMobileRequest<Context>('vehicles.read',async(_request,context,_user)=>handle(context,false,undefined,_user));
export const POST=withMobileRequest<Context>('vehicles.write',async(request,context,user)=>handle(context,true,request,user));
