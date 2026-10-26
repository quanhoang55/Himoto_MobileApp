"""Login UI checks; never submits a real account password or mutates business data."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:3000')
parser.add_argument('--source', choices=['api', 'demo'], default='demo')
parser.add_argument('--session-cookie-file', help='Ignored local QA cookie JSON; contains no passwords')
parser.add_argument('--output', default='docs/qa/login')
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
checks, errors = [], []

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.url + '/')
    expect(page).to_have_url(args.url + '/login')
    expect(page.get_by_role('heading', name='Chào mừng trở lại')).to_be_visible()
    image = page.locator('.hm-login-art img')
    expect(image).to_be_visible()
    assert image.evaluate('(image) => image.complete && image.naturalWidth > 0')
    page.screenshot(path=str(output / 'login-desktop.png'), full_page=True)
    checks.append('home opens login with the existing HIMOTO image loaded')

    if args.source == 'api':
        page.get_by_role('button', name='Đăng nhập', exact=True).click()
        expect(page.locator('#login-error')).to_have_text('Vui lòng nhập email hợp lệ.')
        expect(page.get_by_label('Email', exact=True)).to_be_focused()
        page.get_by_label('Email', exact=True).fill('qa-does-not-exist@example.invalid')
        page.get_by_role('button', name='Đăng nhập', exact=True).click()
        expect(page.locator('#login-error')).to_have_text('Vui lòng nhập mật khẩu.')
        password = page.get_by_label('Mật khẩu', exact=True)
        expect(password).to_be_focused()
        password.fill('not-a-real-account-password')
        page.get_by_role('button', name='Hiện mật khẩu').click()
        expect(password).to_have_attribute('type', 'text')
        page.get_by_role('button', name='Ẩn mật khẩu').click()
        expect(password).to_have_attribute('type', 'password')
        page.get_by_role('button', name='Đăng nhập', exact=True).click()
        expect(page.locator('#login-error')).to_contain_text('Email hoặc mật khẩu không chính xác', timeout=30000)
        expect(page.get_by_role('button', name='Đăng nhập', exact=True)).to_be_enabled()
        assert context.request.get(args.url + '/api/auth/customers').status == 401
        response = context.request.post(args.url + '/api/session', headers={'Origin': 'https://other.invalid'}, data={'email': 'qa@example.invalid', 'password': 'invalid'})
        assert response.status == 403
        page.goto(args.url + '/contracts/drafts')
        expect(page).to_have_url(args.url + '/login')
        checks.append('validation focuses invalid fields; password toggle and failed-login retry work; anonymous/cross-origin access is blocked')
    else:
        expect(page.get_by_role('button', name='Đăng nhập', exact=True)).to_be_disabled()
        expect(page.get_by_label('Email', exact=True)).to_be_disabled()
        page.get_by_role('link', name='Xem bản demo', exact=True).click()
        expect(page).to_have_url(args.url + '/vehicles')
        page.locator('.mg-sidebar').get_by_role('link', name='Log', exact=True).click()
        expect(page.get_by_role('heading', name='Log', exact=False)).to_be_visible()
        checks.append('demo login is clearly marked; demo entry and Log navigation work')

    page.goto(args.url + '/login')
    for width in [768, 375]:
        page.set_viewport_size({'width': width, 'height': 900})
        expect(page.get_by_role('heading', name='Chào mừng trở lại')).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(output / 'login-mobile.png'), full_page=True)
    page.keyboard.press('Tab')
    assert page.evaluate('document.activeElement.matches("input,button,a")')
    checks.append('tablet/mobile form has no horizontal overflow and supports keyboard access')

    if args.source == 'api' and args.session_cookie_file:
        context.add_cookies(json.loads(Path(args.session_cookie_file).read_text(encoding='utf-8')))
        assert context.request.get(args.url + '/api/session').ok
        page.goto(args.url + '/contracts/drafts')
        expect(page.get_by_role('heading', name='Log', exact=False)).to_be_visible()
        expect(page.locator('.mg-table')).to_have_attribute('aria-busy', 'false', timeout=60000)
        page.set_viewport_size({'width': 1440, 'height': 1000})
        page.get_by_label('Menu người dùng', exact=True).click()
        page.get_by_role('button', name='Đăng xuất', exact=True).click()
        expect(page).to_have_url(args.url + '/login')
        assert context.request.get(args.url + '/api/auth/customers').status == 401
        assert not any(cookie['name'] == 'himoto_management_session' for cookie in context.cookies())
        checks.append('authorized session opens live drafts and logout clears access and the HttpOnly cookie')
    assert not errors, errors
    checks.append('no browser JavaScript errors')
    browser.close()

result = {'source': args.source, 'passed': len(checks), 'checks': checks, 'browser_errors': errors}
(output / f'{args.source}-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=True, indent=2))
