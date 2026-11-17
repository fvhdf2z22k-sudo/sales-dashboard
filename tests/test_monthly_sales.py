"""Calendar-month charts preserve scope, missing months and existing period views."""
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
rows = []
def add(year, month, rev, brand='A', mall='X', channel='danawa', sub='침구'):
    rows.append(dict(channel=channel, year=year, date=f'{year}-{month:02}-01',
                     rev=rev, qty=1, brand=brand, mall=mall, name='상품', pid=brand,
                     mid='침구/커튼/카페트', sub=sub, det='기타'))
for year in (2025, 2026):
    add(year, 1, 100)
    add(year, 2, 70)
    add(year, 2, -20)
    add(year, 3, 0)
    add(year, 2, 500, brand='B', mall='Y')
    add(year, 2, 900, channel='enuri')
    add(year, 2, 800, sub='커튼')
add(2026, 12, 25)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for mode in ('index', 'editor'):
        page = browser.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        def serve(route):
            path = route.request.url.split('http://dashboard.test/')[1].split('?')[0]
            if path == 'data/public.json':
                route.fulfill(json={'version': 30, 'rows': rows, 'audit': [], 'internalSnapshots': []})
            else:
                route.fulfill(path=str(ROOT / path))
        page.route('http://dashboard.test/**', serve)
        page.goto(f'http://dashboard.test/{mode}.html')
        page.wait_for_function('()=>publicReady')
        page.select_option('#channel', 'danawa')
        page.select_option('#subcategory', '["침구/커튼/카페트","침구"]')
        page.select_option('#comparison', 'calendar')
        page.locator('#start').fill('2026-02-01')
        page.locator('#end').fill('2026-02-01')
        page.locator('#end').dispatch_event('change')
        page.locator('[data-tab="products"]').click()
        page.select_option('#brand-mall-brand', 'A')
        def chart_data(id):
            return page.evaluate('(id)=>Chart.getChart(document.getElementById(id)).data.datasets.map(s=>s.data)', id)
        expected = [[100, 50, 0] + [None]*9, [100, 50, 0] + [None]*8 + [25]]
        assert chart_data('brand-monthly') == expected
        # Period table stays limited to February, unlike the annual chart.
        assert page.locator('#brand-mall-table tbody tr').first.locator('td').nth(1).inner_text() == '50'
        page.select_option('#brand-mall-brand', 'B')
        assert chart_data('brand-monthly')[1] == [None, 500] + [None]*10
        page.locator('[data-tab="malls"]').click()
        page.select_option('#mall-select', 'X')
        assert chart_data('mall-monthly') == expected
        assert chart_data('mall-daily') == [[50], [50]]
        page.select_option('#mall-select', 'Y')
        assert chart_data('mall-monthly')[1] == [None, 500] + [None]*10
        page.select_option('#mall-select', 'all')
        assert chart_data('mall-monthly')[1][1] == 550
        page.select_option('#previous', '2026')
        page.select_option('#current', '2025')
        page.locator('#start').fill('2025-02-01')
        page.locator('#end').fill('2025-02-01')
        page.locator('#end').dispatch_event('change')
        assert chart_data('mall-monthly')[0][11] == 25
        assert chart_data('mall-monthly')[1][11] is None
        assert not page.locator('#error').inner_text() and not errors, errors
        page.close()
    browser.close()
print('PASS monthly totals, refunds, zero/missing months, scope, selectors, year changes and existing daily/period views in viewer/editor')
