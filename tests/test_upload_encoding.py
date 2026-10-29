"""Regression: a damaged UTF-8 cell must not corrupt Korean header detection."""
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
TABLE = '<table><tr><th>판매액</th><th>판매량</th><th>판매일</th><th>중분류</th><th>다나와상품명</th></tr><tr><td>1000</td><td>2</td><td>2026-10-01</td><td>침실가구</td><td>침대NAME</td></tr></table>'
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page = browser.new_page()
    page.route('http://dashboard.test/**', lambda route: route.fulfill(path=str(ROOT / route.request.url.split('http://dashboard.test/')[1].split('?')[0])))
    page.goto('http://dashboard.test/editor.html')
    page.wait_for_function('()=>typeof parseFile==="function" && data.length>0')
    for label, blob, damaged in [
        ('utf8', TABLE.replace('NAME', '').encode(), False),
        ('euckr', TABLE.replace('NAME', '').encode('euc-kr'), False),
        ('damaged-bom', b'\xef\xbb\xbf' + TABLE.encode().replace(b'NAME', b'\xff'), True),
        ('damaged-no-bom', TABLE.encode().replace(b'NAME', b'\xff'), True),
    ]:
        result = page.evaluate('''async bytes=>{const rows=await parseFile(new File([new Uint8Array(bytes)],'test.xls'));return {n:rows.length,rev:rows[0].rev,qty:rows[0].qty,name:rows[0].name,warnings:rows.warnings};}''', list(blob))
        assert result['n'] == 1 and result['rev'] == 1000 and result['qty'] == 2, (label, result)
        assert result['name'] == ('침대�' if damaged else '침대'), (label, result)
        assert bool(result['warnings']) == damaged, (label, result)
    browser.close()
print('PASS UTF-8, EUC-KR, damaged UTF-8 with and without BOM; amounts and warnings')
