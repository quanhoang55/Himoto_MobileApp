"""Exercise both cashbook tables, shared columns, read-only interactions and mobile scrolling."""
import argparse
import csv
import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://localhost:3001')
parser.add_argument('--output', default='docs/qa/cashbook')
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
checks, errors, writes = [], [], []
columns = ['ID', 'Ngày', 'Giờ', 'Loại phiếu', 'Người thực hiện', 'Lý do', 'Nội dung']

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce', accept_downloads=True)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: writes.append(request.url) if '/api/' in request.url and request.method not in ['GET', 'HEAD'] else None)
    page.goto(args.url + '/cashbook', wait_until='networkidle')
    income = page.locator('#cashbook-income')
    expense = page.locator('#cashbook-expense')
    expect(income.locator('tbody .mg-code')).to_have_count(5)
    expect(expense.locator('tbody .mg-code')).to_have_count(5)
    expect(page.locator('.mg-cashbook-table')).to_have_count(2)
    for panel, label in [(income, 'Phiếu thu'), (expense, 'Phiếu chi')]:
        assert panel.locator('th button span').all_inner_texts() == columns
        expect(panel.get_by_role('heading')).to_contain_text(label)
        expect(panel.locator('.mg-title-count')).to_have_text('24')
        assert all(value == label for value in panel.locator('tbody td:nth-child(4)').all_inner_texts())
        for value in panel.locator('tbody td:nth-child(3)').all_inner_texts():
            assert re.fullmatch(r'\d{2}:\d{2}:\d{2}', value)
    assert not page.get_by_role('button', name=re.compile('Tạo phiếu|Thêm phiếu')).count()
    page.screenshot(path=str(output / 'cashbook-1440.png'), full_page=True)
    checks.append('both tables render simultaneously with the exact seven columns and correct voucher direction, creator, date and time')

    original_expense = expense.locator('tbody .mg-code').all_inner_texts()
    original_income = income.locator('tbody .mg-code').all_inner_texts()
    income.get_by_role('button', name='Trang sau phiếu thu', exact=True).click()
    expect(income.get_by_label('Trang hiện tại phiếu thu', exact=True)).to_have_text('2')
    assert income.locator('tbody .mg-code').all_inner_texts() != original_income
    assert expense.locator('tbody .mg-code').all_inner_texts() == original_expense
    expect(expense.get_by_label('Trang hiện tại phiếu chi', exact=True)).to_have_text('1')
    income.get_by_label('Số dòng mỗi trang phiếu thu', exact=False).select_option('10')
    expect(income.locator('tbody .mg-code')).to_have_count(10)
    expect(expense.locator('tbody .mg-code')).to_have_count(5)
    income.get_by_role('button', name='Sắp xếp phiếu thu theo ID', exact=True).click()
    expect(income.locator('th').first).to_have_attribute('aria-sort', 'ascending')
    expect(income.locator('tbody .mg-code').first).to_have_text('PT-2610-001')
    assert expense.locator('tbody .mg-code').all_inner_texts() == original_expense
    checks.append('pagination, page size and sorting are independent for income and expense tables, with accessible sorting state')

    search = page.get_by_role('searchbox')
    search.fill('bao duong')
    expect(income.get_by_text('Không tìm thấy kết quả', exact=True)).to_be_visible()
    expect(expense.locator('.mg-title-count')).to_have_text('6')
    search.fill('PC-2610-002')
    expect(expense.locator('tbody .mg-code')).to_have_text('PC-2610-002')
    search.fill('khong-co-phieu-mau')
    for panel in [income, expense]:
        expect(panel.get_by_text('Không tìm thấy kết quả', exact=True)).to_be_visible()
    page.locator('.mg-cashbook-filters').get_by_role('button', name='Xóa bộ lọc', exact=True).click()
    expect(income.locator('.mg-title-count')).to_have_text('24')
    expect(expense.locator('.mg-title-count')).to_have_text('24')
    checks.append('shared ID/reason/content search works without Vietnamese accents and handles empty results in both tables')

    page.get_by_label('Từ ngày', exact=False).fill('2026-10-02')
    page.get_by_label('Đến ngày', exact=False).fill('2026-10-02')
    for panel in [income, expense]:
        expect(panel.locator('.mg-title-count')).to_have_text('4')
        assert all(value == '02/10/2026' for value in panel.locator('tbody td:nth-child(2)').all_inner_texts())
    page.locator('#cashbook-actor').select_option('id:2')
    page.get_by_label('Cơ sở đang xem', exact=False).select_option('2')
    # Changing branch clears the actor; apply it again to test the combined filter.
    page.locator('#cashbook-actor').select_option('id:2')
    for panel in [income, expense]:
        expect(panel.locator('tbody .mg-code')).to_have_count(1)
        expect(panel.locator('tbody td:nth-child(5)')).to_have_text('Trần Hoài Linh')
    with page.expect_download() as download_info:
        page.get_by_role('button', name='Xuất CSV', exact=True).click()
    csv_path = output / 'cashbook-export.csv'
    download_info.value.save_as(csv_path)
    with csv_path.open(encoding='utf-8-sig', newline='') as file:
        exported = list(csv.reader(file))
    assert exported[0] == columns
    assert len(exported) == 3
    assert {row[3] for row in exported[1:]} == {'Phiếu thu', 'Phiếu chi'}
    assert all(len(row) == 7 and row[4] == 'Trần Hoài Linh' for row in exported[1:])
    page.get_by_label('Từ ngày', exact=False).fill('2026-10-06')
    expect(page.locator('#cashbook-date-error')).to_be_visible()
    expect(page.get_by_role('button', name='Xuất CSV', exact=True)).to_be_disabled()
    assert page.locator('.mg-cashbook-filters [aria-invalid="true"]').count() == 2
    page.locator('.mg-cashbook-filters').get_by_role('button', name='Xóa bộ lọc', exact=True).click()
    checks.append('inclusive dates, exact creator IDs and shared branch filters combine; CSV exports both filtered groups with seven fields and rejects reversed dates')

    page.evaluate('''() => {
      const original = window.structuredClone.bind(window); window.__cashbookOriginalClone = original;
      window.structuredClone = value => Array.isArray(value) ? new Promise(resolve => setTimeout(() => resolve(original(value)), 900)) : original(value);
    }''')
    page.get_by_role('button', name='Tải lại', exact=True).click()
    expect(income.locator('table')).to_have_attribute('aria-busy', 'true')
    expect(expense.locator('table')).to_have_attribute('aria-busy', 'true')
    expect(income.locator('.mg-title-count')).to_have_text('—')
    expect(income.locator('tbody .mg-code')).to_have_count(10)
    page.evaluate('''() => { window.structuredClone = value => { if (Array.isArray(value)) throw new Error('Lỗi tải sổ quỹ kiểm thử'); return window.__cashbookOriginalClone(value); }; }''')
    page.get_by_role('button', name='Tải lại', exact=True).click()
    for panel in [income, expense]:
        expect(panel.get_by_role('alert')).to_contain_text('Lỗi tải sổ quỹ kiểm thử')
        expect(panel.locator('tbody .mg-code')).to_have_count(0)
    page.evaluate('window.structuredClone = window.__cashbookOriginalClone')
    income.get_by_role('button', name='Thử lại', exact=True).click()
    expect(income.locator('.mg-title-count')).to_have_text('24')
    expect(expense.locator('.mg-title-count')).to_have_text('24')
    checks.append('loading hides old rows and counts; errors render in both tables and retry restores the data without false success')

    page.locator('.mg-sidebar').get_by_role('link', name='Khách hàng', exact=True).click()
    expect(page.locator('.mg-page-heading h1')).to_contain_text('Khách hàng')
    page.locator('.mg-sidebar').get_by_role('link', name='Sổ quỹ / Sổ két', exact=True).click()
    expect(page).to_have_url(args.url + '/cashbook')
    expect(income.locator('.mg-title-count')).to_have_text('24')
    for width in [768, 1024, 375]:
        page.set_viewport_size({'width': width, 'height': 1000 if width > 600 else 812})
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), f'Page overflow at {width}'
        if width == 375:
            for panel in [income, expense]:
                region = panel.get_by_role('region')
                assert region.evaluate('(element) => element.scrollWidth > element.clientWidth')
                region.focus()
                page.keyboard.press('End')
                region.evaluate('(element) => { element.scrollLeft = element.scrollWidth; }')
                panel.screenshot(path=str(output / ('income-scrolled-375.png' if panel == income else 'expense-scrolled-375.png')))
                region.evaluate('(element) => { element.scrollLeft = 0; }')
            if page.get_by_role('button', name='Đóng thông báo', exact=True).count():
                page.get_by_role('button', name='Đóng thông báo', exact=True).click()
            page.locator('h1').click()
            page.evaluate('window.scrollTo(0, 0)')
            page.screenshot(path=str(output / 'cashbook-375.png'), full_page=True)
            page.get_by_role('button', name='Mở menu', exact=True).click()
            expect(page.locator('.mg-mobile-nav').get_by_role('link', name='Sổ quỹ / Sổ két', exact=True)).to_be_visible()
            page.keyboard.press('Escape')
    checks.append('new navigation works; 375/768/1024px layouts keep both tables, permit horizontal table scrolling and avoid page overflow')

    assert not errors, errors
    assert not writes, writes
    checks.append('no browser JavaScript errors or financial/rental/API writes')
    browser.close()

result = {'passed': len(checks), 'checks': checks, 'browser_errors': errors, 'api_writes': writes}
(output / 'functional-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=True, indent=2))
