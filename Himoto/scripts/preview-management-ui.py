"""Capture the five management screens. Requires the locally available Playwright."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://localhost:3000')
parser.add_argument('--output', default='docs/qa/2026-10-06/management')
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
results = []
errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(timezone_id='Asia/Ho_Chi_Minh', reduced_motion='reduce')
    context.route('https://fonts.googleapis.com/**', lambda route: route.abort())
    context.route('https://fonts.gstatic.com/**', lambda route: route.abort())
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    for viewport in [{'width': 1440, 'height': 1000}, {'width': 375, 'height': 812}]:
        page.set_viewport_size(viewport)
        for route, title, count in [('staff', 'Nhân sự', 10), ('customers', 'Khách hàng', 10), ('contracts', 'Danh sách hợp đồng', 10), ('stores', 'Cơ sở', 4), ('vehicles', 'Danh sách xe', 10)]:
            page.goto(f'{args.url}/{route}', wait_until='domcontentloaded', timeout=120000)
            page.get_by_role('heading', name=title, exact=False).wait_for(timeout=60000)
            page.locator('.mg-table tbody .mg-code').first.wait_for()
            assert page.locator('.mg-table tbody tr').count() == count, route
            overflow = page.evaluate('document.documentElement.scrollWidth > window.innerWidth')
            assert not overflow, f'Page overflow at {route}, {viewport}'
            path = output / f'{route}-{viewport["width"]}.png'
            page.screenshot(path=str(path), full_page=True)
            results.append({'route': route, 'viewport': viewport, 'rows': count, 'page_overflow': overflow, 'screenshot': str(path)})
    assert not errors, errors
    browser.close()
(output / 'preview-results.json').write_text(json.dumps({'screens': results, 'browser_errors': errors}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'screenshots': len(results), 'browser_errors': errors}, ensure_ascii=False))
