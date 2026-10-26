import { NextRequest } from 'next/server';
import { withMobileRequest } from '@/lib/server/mobile/mobile-request';
import { mobileData, mobileError } from '@/lib/server/mobile/mobile-response';
import { ManagementTableError, MobileListError, readMobileList } from '@/lib/server/mobile/mobile-lists';
import { readMobileJson, MobileBodyError } from '@/lib/server/mobile/mobile-body';
import { createMobileCustomer, MobileCustomerCreateError, parseMobileCustomerCreate } from '@/lib/server/mobile/mobile-customer-create';

export const runtime = 'nodejs';

export const GET = withMobileRequest<{ params: Promise<Record<string, string>> }>('customers.read', async (request: NextRequest) => {
  try { return mobileData(await readMobileList('customers', request.nextUrl.searchParams)); }
  catch (error) {
    if (error instanceof MobileListError || error instanceof ManagementTableError) return mobileError('INVALID_INPUT', error.message, 400);
    return mobileError('UNAVAILABLE', 'Không tải được danh sách khách hàng.', 503);
  }
});

export const POST = withMobileRequest<{ params: Promise<Record<string, string>> }>('customers.write', async (request: NextRequest, _context, user) => {
  try {
    const input = parseMobileCustomerCreate(await readMobileJson(request));
    if (!user.scope_all && input.storeId !== user.store_id) return mobileError('FORBIDDEN', 'Cơ sở nằm ngoài phạm vi được phân công.', 403);
    return mobileData(await createMobileCustomer(input), 201);
  } catch (error) {
    if (error instanceof MobileBodyError) return mobileError('INVALID_INPUT', error.message, 400);
    if (error instanceof MobileCustomerCreateError) return mobileError(error.status === 409 ? 'CONFLICT' : 'INVALID_INPUT', error.message, error.status);
    return mobileError('UNAVAILABLE', 'Không lưu được khách hàng. Vui lòng thử lại.', 503);
  }
}, 'customer_create');
