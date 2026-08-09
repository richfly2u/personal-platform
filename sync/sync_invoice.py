#!/usr/bin/env python3
"""發票載具同步 — adb 自動擷取發票明細"""
import subprocess, time, re, json, os, xml.etree.ElementTree as ET

PACKAGE = 'money.com.invoicemanager'
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
INVOICE_JSON = os.path.join(DATA_DIR, 'invoices.json')
DUMP_PATH = '/sdcard/window_dump.xml'
LOCAL_DUMP = os.path.join(DATA_DIR, 'invoice_dump.xml')

def adb(cmd):
    return subprocess.run(['adb', 'shell'] + cmd.split(), capture_output=True, text=True, timeout=15)

def adb_tap(x, y):
    subprocess.run(['adb', 'shell', 'input', 'tap', str(x), str(y)], capture_output=True, timeout=5)

def adb_swipe(x1, y1, x2, y2, ms=1000):
    subprocess.run(['adb', 'shell', 'input', 'swipe', str(x1), str(y1), str(x2), str(y2), str(ms)], capture_output=True, timeout=5)

def dump():
    subprocess.run('adb shell uiautomator dump /sdcard/window_dump.xml', shell=True, capture_output=True, timeout=10)
    subprocess.run(['adb', 'pull', '/sdcard/window_dump.xml', LOCAL_DUMP], capture_output=True, timeout=10)
    return ET.parse(LOCAL_DUMP).getroot()

def parse_invoices(root):
    """Parse invoices from dump XML"""
    elements = []
    for el in root.iter():
        text = el.get('text', '').strip()
        bounds = el.get('bounds', '')
        if not text or not bounds:
            continue
        m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', bounds)
        if m:
            x1, y1, x2, y2 = int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4))
            elements.append({'text': text, 'x': x1, 'y': y1})

    elements.sort(key=lambda e: e['y'])
    
    invoices = []
    current = None
    row_y = None  # y position of the current invoice row
    
    for e in elements:
        t = e['text']
        
        # Invoice number pattern
        if re.match(r'^[A-Z]{2}\d{8}$', t):
            if current and current.get('amount'):
                invoices.append(current)
            current = {'id': t}
            row_y = e['y']
            continue
        
        if current is None:
            continue
        
        # Amount
        m = re.match(r'^(\d+)元$', t)
        if m:
            current['amount'] = int(m.group(1))
            continue
        
        # Skip labels
        if t in ('手機條碼', '載具', '愛心碼', '消費分析'):
            continue
        
        # Date: MM/DD, far right
        if re.match(r'^\d{2}/\d{2}$', t) and e['x'] > 1000:
            current['date'] = t
            continue
        
        # Store/item: 65-120px below invoice number row
        dy = e['y'] - row_y if row_y else 999
        if 60 < dy < 130:
            if e['x'] < 500 and len(t) <= 15 and 'store' not in current:
                current['store'] = t
            elif 300 < e['x'] < 950 and 'item' not in current and t not in ('次', ''):
                current['item'] = t
    
    if current and current.get('amount'):
        invoices.append(current)
    
    return invoices

def is_locked(root):
    """檢查 dump 是否為鎖定/AOD 畫面"""
    for el in root.iter():
        r = el.get('resource-id', '') or ''
        if 'aod' in r.lower() or 'keyguard' in r.lower():
            return True
        if (el.get('package', '') or '') == 'com.miui.aod':
            return True
    return False

def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    
    # 喚醒手機（鎖定則報錯退出）
    subprocess.run('adb shell input keyevent KEYCODE_WAKEUP', shell=True, capture_output=True, timeout=8)
    time.sleep(1)
    subprocess.run('adb shell wm dismiss-keyguard', shell=True, capture_output=True, timeout=8)
    time.sleep(1)
    if is_locked(dump()):
        print('❌ 手機鎖定，請先解鎖')
        return
    
    if os.path.exists(INVOICE_JSON):
        with open(INVOICE_JSON, encoding='utf-8') as f:
            existing = json.load(f)
        existing_ids = {i['id'] for i in existing}
    else:
        existing, existing_ids = [], set()
    
    # Open app
    subprocess.run(['adb', 'shell', 'am', 'start', '-n',
        f'{PACKAGE}/com.firemaptech.invoicecarrier.ui.main.MainActivity'], capture_output=True, timeout=10)
    time.sleep(2)
    
    # 我的發票 tab
    adb_tap(961, 2567)
    time.sleep(2)
    
    # Scroll to top: swipe down several times
    for _ in range(5):
        adb_swipe(640, 800, 640, 1800, 300)
        time.sleep(0.5)
    time.sleep(1)
    
    all_ids = set()
    all_invoices = {}
    prev_total = -1
    stall_count = 0
    
    for page in range(20):
        root = dump()
        invoices = parse_invoices(root)
        
        new_count = 0
        for inv in invoices:
            if inv['id'] not in all_ids:
                all_ids.add(inv['id'])
                all_invoices[inv['id']] = inv
                new_count += 1
        
        total = len(all_ids)
        if total == prev_total:
            stall_count += 1
            if stall_count >= 3:
                break
        else:
            stall_count = 0
        
        prev_total = total
        print(f'  第{page+1}頁: +{new_count} 筆 (共 {total} 筆)')
        
        # Scroll up (swipe upward = scroll down in list)
        adb_swipe(640, 1700, 640, 700, 800)
        time.sleep(2)
    
    # Merge with existing data
    for inv in existing:
        if inv['id'] not in all_invoices:
            all_invoices[inv['id']] = inv
    
    result = list(all_invoices.values())
    result.sort(key=lambda x: x.get('date', '00/00'), reverse=True)
    
    with open(INVOICE_JSON, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    new = len(all_invoices) - len(existing_ids & set(all_invoices.keys()))
    print(f'發票同步完成：{len(result)} 筆（新增 {new} 筆）')
    return result

if __name__ == '__main__':
    main()
