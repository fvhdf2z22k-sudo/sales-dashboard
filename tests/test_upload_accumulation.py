"""Cumulative XLS uploads: scoped replacement, retention, conflicts and persistence."""
from pathlib import Path
from urllib.parse import urlparse
import json
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
def row(pid, date, rev, **more):
    return dict(channel='danawa', year=int(date[:4]), date=date, rev=rev, qty=1,
                mid='침실가구', sub='매트리스', det='스프링', name=pid, pid=pid,
                brand='테스트', mall='테스트몰', source='old.xls', **more)
original = [row('old-start','2026-10-01',10), row('replace-a','2026-10-02',20),
            row('replace-b','2026-10-02',30), row('gap','2026-10-03',40),
            row('old-end','2026-10-05',50), row('prior','2025-10-02',60),
            {**row('other-category','2026-10-02',70),'mid':'침구/커튼/카페트','sub':'침구'},
            {**row('other-channel','2026-10-02',80),'channel':'enuri','cat':'12020406'}]
def upload_file(name='new.xls', amount=200):
    headers=['판매액','판매량','판매일','중분류','소분류','다나와상품명','D코드']
    rows=[[amount,1,'2026-10-02','침실가구','매트리스','new-a','new-a'],
          [100,1,'2026-10-02','침실가구','매트리스','new-b','new-b'],
          [400,1,'2026-10-04','침실가구','매트리스','added','added']]
    html='<table>'+''.join('<tr>'+''.join(f'<td>{v}</td>' for v in r)+'</tr>' for r in [headers,*rows])+'</table>'
    return dict(name=name,mimeType='application/vnd.ms-excel',buffer=html.encode())
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    def serve(route):
        path=urlparse(route.request.url).path.lstrip('/') or 'index.html'
        if path=='data/public.json':route.fulfill(json=dict(version=30,rows=original,audit=[dict(file='old.xls',rows=8,rev=460)],internalSnapshots=[]))
        else:route.fulfill(path=str(ROOT/path))
    page.route('http://dashboard.test/**',serve)
    page.goto('http://dashboard.test/editor.html');page.wait_for_function('()=>publicReady')
    page.locator('[data-tab="upload"]').click()
    baseline=page.evaluate('data')
    def select(files):
        page.locator('#files').set_input_files(files)
        page.wait_for_function('()=>!document.querySelector("#upload-preview").textContent.includes("파일을 읽고")')
    select(upload_file())
    assert page.evaluate('data')==baseline # Preview must not change data.
    assert '나머지 기존 6행' in page.locator('#upload-preview').inner_text()
    page.locator('#apply-upload').click()
    expected_ids={'old-start','gap','old-end','prior','other-category','other-channel','new-a','new-b','added'}
    rows=page.evaluate('data');assert {r['pid'] for r in rows}==expected_ids and len(rows)==9
    retained=[r for r in baseline if r['pid'] not in {'replace-a','replace-b'}]
    assert all(r in rows for r in retained)
    assert sum(r['rev'] for r in rows)==1010
    assert sum(r['rows'] for r in page.evaluate('audit'))==9
    assert sum(r['rev'] for r in page.evaluate('audit'))==1010
    select(upload_file('renamed.xls'));page.locator('#apply-upload').click()
    assert len(page.evaluate('data'))==9 and page.evaluate('sum(data)')==1010
    select(upload_file('corrected.xls',300));page.locator('#apply-upload').click()
    assert len(page.evaluate('data'))==9 and page.evaluate('sum(data)')==1110
    before=page.evaluate('currentPayload()')
    select([upload_file('one.xls'),upload_file('two.xls')])
    assert '겹칩니다' in page.locator('#upload-preview').inner_text()
    assert page.locator('#apply-upload').count()==0 and page.evaluate('currentPayload()')==before
    page.reload();page.wait_for_function('()=>draftDirty && data.length===9')
    assert page.evaluate('currentPayload()')==before
    page.on('dialog',lambda d:d.accept())
    with page.expect_download() as downloaded:page.locator('#public-export').click()
    payload=json.loads(Path(downloaded.value.path()).read_text())
    assert payload==before and all(r in payload['rows'] for r in retained)
    assert not errors,errors
    browser.close()
print('PASS cumulative dates, scoped overlap, retained gaps/channels/categories/years, repeat upload, corrections, conflicting files, audit, reload and public JSON export')
