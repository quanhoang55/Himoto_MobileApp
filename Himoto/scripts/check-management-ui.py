"""Functional browser checks for the five management tables; no production API writes."""
import argparse
import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://localhost:3000')
parser.add_argument('--output', default='docs/qa/2026-10-06/management')
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
results, errors, api_writes = [], [], []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce', accept_downloads=True)
    context.route('https://fonts.googleapis.com/**', lambda route: route.abort())
    context.route('https://fonts.gstatic.com/**', lambda route: route.abort())
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: api_writes.append(request.url) if '/api/' in request.url and request.method != 'GET' else None)

    def navigate(label):
        page.get_by_role('navigation', name='Điều hướng quản lý').get_by_role('link', name=label, exact=True).click()
        routes = {'Nhân sự': 'staff', 'Khách hàng': 'customers', 'Danh sách hợp đồng': 'contracts', 'Cơ sở': 'stores', 'Danh sách xe': 'vehicles'}
        expect(page).to_have_url(args.url + '/' + routes[label])
        expect(page.get_by_role('heading', name=label, exact=False, level=1)).to_be_visible()
        page.locator('.mg-table tbody .mg-code').first.wait_for()

    def fill(label, value):
        page.get_by_role('dialog').get_by_label(label, exact=False).fill(value)

    def save():
        page.get_by_role('dialog').get_by_role('button', name='Lưu dữ liệu mẫu').click()
        expect(page.get_by_role('dialog')).to_have_count(0)

    def record(name):
        results.append(name)

    try:
        page.goto(args.url + '/staff', wait_until='domcontentloaded', timeout=120000)
        page.locator('.mg-table tbody .mg-code').first.wait_for()
        page.get_by_role('searchbox').fill('dang thanh ha')
        expect(page.locator('.mg-table tbody tr')).to_have_count(2)
        assert all('Đặng Thanh Hà' in row for row in page.locator('.mg-table tbody tr').all_text_contents())
        page.get_by_role('searchbox').fill('no-such-person-000')
        expect(page.get_by_text('Không tìm thấy kết quả', exact=True)).to_be_visible()
        page.get_by_role('button', name='Xóa bộ lọc', exact=True).first.click()
        page.get_by_label('Số dòng mỗi trang').select_option('20')
        expect(page.locator('.mg-table tbody tr')).to_have_count(20)
        page.get_by_role('button', name='Trang sau', exact=True).click()
        expect(page.locator('.mg-table tbody tr')).to_have_count(8)
        record('accent-insensitive search, empty search, page size and last-page count')

        navigate('Danh sách xe')
        page.get_by_label('Số dòng mỗi trang').select_option('50')
        page.get_by_role('button', name='Sắp xếp theo Giá thuê / ngày', exact=True).click()
        assert page.get_by_role('columnheader', name='Giá thuê / ngày').get_attribute('aria-sort') == 'ascending'
        prices = [int(value.replace('.', '').replace('₫', '').strip()) for value in page.locator('.mg-table tbody tr td:nth-child(7)').all_text_contents()]
        assert prices == sorted(prices)
        page.get_by_label('Lọc trạng thái', exact=True).select_option('ready')
        expect(page.locator('.mg-table tbody tr')).to_have_count(16)
        page.get_by_label('Cơ sở đang xem').select_option('2')
        page.wait_for_function("Array.from(document.querySelectorAll('.mg-table tbody tr')).length > 0 && Array.from(document.querySelectorAll('.mg-table tbody tr')).every(row => row.querySelector('td:nth-child(6)')?.textContent === 'Cầu Giấy')")
        assert all('Cầu Giấy' in row for row in page.locator('.mg-table tbody tr').all_text_contents())
        page.get_by_role('button', name='Xóa bộ lọc', exact=True).click()
        page.get_by_label('Ẩn hiện cột').click()
        page.locator('.mg-column-menu').get_by_label('Giá thuê / ngày', exact=True).uncheck()
        expect(page.get_by_role('columnheader', name='Giá thuê / ngày')).to_have_count(0)
        page.locator('.mg-column-menu').get_by_label('Giá thuê / ngày', exact=True).check()
        page.get_by_role('heading', name='Danh sách xe', exact=False).click()
        with page.expect_download() as download_info:
            page.get_by_role('button', name='Xuất CSV', exact=True).click()
        download = download_info.value
        download.save_as(str(output / 'vehicles-export.csv'))
        assert len((output / 'vehicles-export.csv').read_text(encoding='utf-8-sig').splitlines()) == 41
        record('numeric sort, combined filters, column visibility and actual CSV download')

        page.get_by_role('button', name='Thêm xe', exact=True).click()
        page.get_by_role('dialog').get_by_role('button', name='Lưu dữ liệu mẫu').click()
        assert page.get_by_role('dialog').locator('[aria-invalid="true"]').count() >= 3
        fill('Tên / dòng xe', 'Xe kiểm thử giao diện')
        fill('Biển số', 'DEMO-QA-001'); fill('Hãng xe', 'Honda')
        fill('Giá thuê / ngày', '250000'); fill('Số km', '0')
        save()
        page.get_by_role('searchbox').fill('Xe kiểm thử giao diện')
        expect(page.locator('.mg-table tbody tr')).to_have_count(1)
        page.get_by_role('button', name='Sửa XE-041', exact=True).click()
        fill('Tên / dòng xe', 'Xe mẫu đã chỉnh sửa')
        save()
        page.get_by_role('searchbox').fill('Xe mẫu đã chỉnh sửa')
        expect(page.locator('.mg-table tbody tr')).to_have_count(1)
        navigate('Nhân sự'); navigate('Danh sách xe')
        page.get_by_role('searchbox').fill('Xe mẫu đã chỉnh sửa')
        expect(page.locator('.mg-table tbody tr')).to_have_count(1)
        record('vehicle form validation, create, edit, and persistence across navigation')

        navigate('Nhân sự')
        page.get_by_role('button', name='Thêm nhân sự', exact=True).click()
        fill('Họ và tên', 'Nhân sự kiểm thử'); fill('Số điện thoại', '0900000991')
        fill('Email', 'qa-staff@example.test')
        page.get_by_role('dialog').get_by_label('Cơ sở', exact=False).select_option('2')
        save()
        page.get_by_role('searchbox').fill('Nhân sự kiểm thử')
        expect(page.locator('.mg-table tbody tr')).to_have_count(1)
        navigate('Cơ sở')
        row = page.locator('.mg-table tbody tr').filter(has_text='Cầu Giấy')
        assert row.locator('td:nth-child(8)').inner_text() == '8'
        page.get_by_role('button', name='Thêm cơ sở', exact=True).click()
        fill('Tên cơ sở', 'Cơ sở kiểm thử'); fill('Số điện thoại', '0900000992')
        fill('Người phụ trách', 'Quản lý mẫu'); fill('Địa chỉ', 'Địa chỉ kiểm thử, Hà Nội')
        save()
        expect(page.locator('.mg-table tbody tr')).to_have_count(5)
        record('staff create, relational branch counts, and branch create')

        navigate('Khách hàng')
        page.get_by_role('button', name='Thêm khách hàng', exact=True).click()
        fill('Họ và tên', 'Khách hàng kiểm thử'); fill('Số điện thoại', '0900000993')
        save()
        page.get_by_role('searchbox').fill('Khách hàng kiểm thử')
        expect(page.locator('.mg-table tbody tr')).to_have_count(1)
        page.get_by_role('searchbox').fill('KH-001')
        page.get_by_role('button', name='Xem KH-001', exact=True).click()
        page.get_by_role('dialog').get_by_role('link', name='Xem hợp đồng liên quan').click()
        expect(page).to_have_url(re.compile(r'/contracts\?customer_id=1$'))
        expect(page.locator('.mg-table tbody tr')).to_have_count(2)
        page.get_by_role('button', name='Xóa bộ lọc', exact=True).click()
        expect(page.locator('.mg-table tbody tr')).to_have_count(10)
        assert page.locator('.mg-heading-actions button').count() == 3
        expect(page.get_by_role('button', name='Nhập hợp đồng', exact=True)).to_be_visible()
        assert page.locator('.mg-row-actions button[aria-label^="Sửa"]').count() > 0
        assert page.locator('.mg-row-actions button[aria-label^="Sao chép hợp đồng"]').count() > 0
        page.get_by_role('button', name='Xem HD-2610-001', exact=True).click()
        expect(page.get_by_role('dialog')).to_be_visible()
        expect(page.get_by_role('dialog').get_by_text('Chi tiết hợp đồng: HD-2610-001')).to_be_visible()
        expect(page.get_by_role('button', name='In hợp đồng', exact=True)).to_be_visible()
        page.keyboard.press('Escape')
        expect(page.get_by_role('dialog')).to_have_count(0)
        page.get_by_label('Từ ngày', exact=True).fill('2026-10-03')
        page.get_by_label('Đến ngày', exact=True).fill('2026-10-05')
        expect(page.locator('.mg-table tbody tr')).to_have_count(6)
        assert page.locator('.mg-table tbody .mg-code').count() > 0
        for value in page.locator('.mg-table tbody tr td:nth-child(6)').all_text_contents():
            day, month, year = value.split('/')
            assert '2026-10-03' <= f'{year}-{month}-{day}' <= '2026-10-05'
        record('customer create, related contracts, contract copy/edit actions, reused detail and date range')

        page.set_viewport_size({'width': 375, 'height': 812})
        page.get_by_role('button', name='Mở menu', exact=True).click()
        expect(page.get_by_role('dialog', name='Menu điều hướng')).to_be_visible()
        page.get_by_role('dialog', name='Menu điều hướng').get_by_role('link', name='Danh sách xe', exact=True).click()
        expect(page.get_by_role('dialog')).to_have_count(0)
        assert not page.locator('.mg-mobile-nav').is_visible()
        page.locator('.mg-table-scroll').evaluate('(element) => element.scrollLeft = element.scrollWidth - element.clientWidth')
        assert not page.evaluate('document.documentElement.scrollWidth > window.innerWidth')
        assert page.locator('.mg-table').is_visible()
        page.get_by_role('button', name='Thêm xe', exact=True).click()
        for _ in range(14):
            page.keyboard.press('Tab')
            assert page.get_by_role('dialog').evaluate('(element) => element.contains(document.activeElement)')
        page.keyboard.press('Escape')
        assert not page.locator('.mg-dialog').is_visible()
        page.screenshot(path=str(output / 'vehicles-mobile-scrolled.png'), full_page=True)
        record('mobile navigation, horizontal table scroll, keyboard focus trap and Escape')

        recovery = context.new_page()
        recovery.add_init_script("window.qaFailClone = true; const clone = window.structuredClone.bind(window); window.structuredClone = (...args) => { if (window.qaFailClone) throw new Error('Lỗi tải dữ liệu kiểm thử'); return clone(...args); };")
        recovery.goto(args.url + '/vehicles', wait_until='domcontentloaded', timeout=120000)
        expect(recovery.get_by_text('Không tải được dữ liệu', exact=True)).to_be_visible()
        assert recovery.locator('.mg-table tbody .mg-code').count() == 0
        recovery.screenshot(path=str(output / 'error-state.png'), full_page=True)
        recovery.evaluate('window.qaFailClone = false')
        recovery.get_by_role('button', name='Thử lại', exact=True).click()
        expect(recovery.locator('.mg-table tbody .mg-code')).to_have_count(10)
        recovery.close()
        record('load failure clears rows, shows error, and retry recovers')
        assert not api_writes, api_writes
        assert not errors, errors
        record('no API writes and no uncaught browser errors')
    finally:
        (output / 'functional-results.json').write_text(json.dumps({'passed': len(results), 'checks': results, 'browser_errors': errors, 'api_writes': api_writes}, ensure_ascii=False, indent=2), encoding='utf-8')
        browser.close()
print(json.dumps({'passed': len(results), 'browser_errors': errors, 'api_writes': api_writes}, ensure_ascii=False))
