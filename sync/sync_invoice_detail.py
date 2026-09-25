#!/usr/bin/env python3
"""發票載具 — 消費細項同步（tap 進每張發票明細頁，擷取品項明細）

用法：
  python sync_invoice_detail.py            # 全部缺 items 的發票
  python sync_invoice_detail.py --limit 3 # 只抓前 3 張（測試）
  python sync_invoice_detail.py --force   # 全部重抓（含已有 items 的）
"""
import subprocess, time, re, json, os, sys, xml.etree.ElementTree as ET

PACKAGE = 'money.com.invoicemanager'
ACTIVITY = 'money.com.invoicemanager/.activity.SplashActivity'
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
INVOICE_JSON = os.path.join(DATA_DIR, 'invoices.json')
LOCAL_DUMP = os.path.join(DATA_DIR, 'detail_dump.xml')

def sh(cmd):
    subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=15)

def dump():
    subprocess.run('adb shell uiautomator dump /sdcard/window_dump.xml',
                   shell=True, capture_output=True, timeout=10)
    subprocess.run(['adb', 'pull', '/sdcard/window_dump.xml', LOCAL_DUMP],
                   capture_output=True, timeout=10)
    return ET.parse(LOCAL_DUMP).getroot()

def all_text(root):
    """回傳 [{text, cx, y}]，依 y 排序"""
    out = []
    for el in root.iter():
        t = el.get('text', '').strip()
        b = el.get('bounds', '')
        m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', b)
        if t and m:
            x1, y1, x2, y2 = map(int, m.groups())
            out.append({'text': t, 'cx': (x1 + x2) // 2, 'y': y1})
    out.sort(key=lambda e: e['y'])
    return out

def screen_text(root):
    return [e['text'] for e in all_text(root)]

def is_locked(root):
    for el in root.iter():
        r = (el.get('resource-id', '') or '').lower()
        if 'aod' in r or 'keyguard' in r:
            return True
        if (el.get('package', '') or '') == 'com.miui.aod':
            return True
    return False

def parse_items(root):
    """解析消費品項：每列 = 名稱($單價) + x數量 + 金額"""
    els = all_text(root)
    qty_els = [e for e in els if re.match(r'^x\d+$', e['text'])]
    items = []
    for q in qty_els:
        name = ''
        amount = ''
        for e in els:
            if e is q:
                continue
            if abs(e['y'] - q['y']) <= 20:
                if e['cx'] < q['cx'] - 50:
                    name = e['text']
                elif e['cx'] > q['cx'] + 50:
                    amount = e['text']
        nm = name
        unit = None
        m2 = re.search(r'\s\$(-?\d+)\s*$', name)
        if m2:
            nm = name[:m2.start()].strip()
            unit = int(m2.group(1))
        qty = int(q['text'][1:]) if q['text'][1:].isdigit() else 1
        amt = None
        if amount.lstrip('-').isdigit():
            amt = int(amount)
        items.append({'name': nm, 'unit_price': unit, 'qty': qty, 'amount': amt})
    return items

def wait_detail(timeout=12):
    """等明細載入完成：『明細更新中』消失 或 出現 x數量 品項 或 逾時"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        root = dump()
        texts = screen_text(root)
        if any(re.match(r'^x\d+$', t) for t in texts):
            return root  # 品項已載入
        if not any('明細更新中' in t for t in texts) and any('總金額' in t for t in texts):
            # 沒有品項區塊但有總金額 → 可能無明細或載入完但沒品項
            if any('財政部' in t for t in texts) and not any(re.match(r'^x\d+$', t) for t in texts):
                return root  # 已到底（無品項）
        time.sleep(2)
    return dump()

def find_invoice_tap(root):
    """找列表第一張發票的 tap 座標（發票號碼 AA12345678）"""
    for el in root.iter():
        t = el.get('text', '').strip()
        if re.match(r'^[A-Z]{2}\d{8}$', t):
            b = el.get('bounds', '')
            m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', b)
            if m:
                x1, y1, x2, y2 = map(int, m.groups())
                return ((x1 + x2) // 2, (y1 + y2) // 2), t
    return None, None

def main():
    limit = None
    force = False
    if '--limit' in sys.argv:
        limit = int(sys.argv[sys.argv.index('--limit') + 1])
    if '--force' in sys.argv:
        force = True

    os.makedirs(DATA_DIR, exist_ok=True)

    # 讀現有發票
    existing = []
    if os.path.exists(INVOICE_JSON):
        with open(INVOICE_JSON, encoding='utf-8') as f:
            existing = json.load(f)
    by_id = {i['id']: i for i in existing}

    # 喚醒 + 解鎖
    sh('adb shell input keyevent KEYCODE_WAKEUP')
    time.sleep(1)
    sh('adb shell wm dismiss-keyguard')
    time.sleep(1)
    if is_locked(dump()):
        print('❌ 手機鎖定，請先解鎖')
        return

    # 開 app（SplashActivity + clear-task）
    sh(f'adb shell am force-stop {PACKAGE}')
    time.sleep(1)
    sh(f'adb shell am start -n {ACTIVITY} --activity-clear-task')
    time.sleep(4)

    # 我的發票 tab
    sh('adb shell input tap 961 2593')
    time.sleep(3)

    todo = []
    if force:
        todo = list(by_id.keys())
    else:
        todo = [i['id'] for i in existing if 'items' not in i or not i['items']]
    if not todo:
        print('所有發票都有品項了，無需同步（用 --force 重抓）')
        return
    if limit:
        todo = todo[:limit]

    print(f'準備抓 {len(todo)} 張發票的消費細項')

    done = 0
    remaining = set(todo)
    processed = set()
    scroll_stall = 0
    prev_visible = None

    # 先捲回列表頂端
    for _ in range(5):
        sh('adb shell input swipe 640 800 640 1800 300')
        time.sleep(0.4)
    time.sleep(1)

    while remaining and scroll_stall < 4:
        root = dump()
        visible = []
        for el in root.iter():
            t = el.get('text', '').strip()
            if re.match(r'^[A-Z]{2}\d{8}$', t):
                b = el.get('bounds', '')
                m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', b)
                if m:
                    x1, y1, x2, y2 = map(int, m.groups())
                    visible.append((t, (x1 + x2) // 2, (y1 + y2) // 2))
        visible_ids = tuple(v[0] for v in visible)

        # 處理這一屏上、待抓、尚未處理的發票
        for inv_id, x, y in visible:
            if inv_id not in remaining or inv_id in processed:
                continue
            sh(f'adb shell input tap {x} {y}')
            time.sleep(3)
            detail_root = wait_detail()
            items = parse_items(detail_root)

            if items:
                by_id[inv_id]['items'] = items
                names = ', '.join(f"{it['name']}×{it['qty']}" for it in items)
                print(f'  ✓ {inv_id}: {names}')
            else:
                texts = screen_text(detail_root)
                if any('明細更新中' in t for t in texts):
                    print(f'  ⏳ {inv_id}: 明細仍在更新（逾時略過）')
                else:
                    print(f'  - {inv_id}: 無品項明細')

            processed.add(inv_id)
            remaining.discard(inv_id)
            done += 1
            # 每張寫回，避免中斷丟失
            with open(INVOICE_JSON, 'w', encoding='utf-8') as f:
                json.dump(existing, f, ensure_ascii=False, indent=2)
            # 回列表（保持捲動位置）
            sh('adb shell input keyevent KEYCODE_BACK')
            time.sleep(2)

        # 捲動找下一屏；連續多屏無新發票即到底
        if visible_ids == prev_visible:
            scroll_stall += 1
        else:
            scroll_stall = 0
        prev_visible = visible_ids

        if remaining:
            sh('adb shell input swipe 640 1700 640 700 800')
            time.sleep(2)

    # 回到首頁
    sh('adb shell input keyevent KEYCODE_BACK')
    print(f'\n完成：處理 {done} 張，剩餘 {len(remaining)} 張未抓到，已寫回 {INVOICE_JSON}')

if __name__ == '__main__':
    main()
