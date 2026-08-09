#!/usr/bin/env python3
"""行事曆同步 — 從系統行事曆 Provider 撈全部事件"""
import subprocess, json, os, re, time, datetime

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
CAL_JSON = os.path.join(DATA_DIR, 'calendar.json')

def sh(cmd, timeout=20):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip()
    except Exception as e:
        return str(e)

def parse_rows(text):
    """content query 輸出 → rows 列表（dict）"""
    rows = []
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith('Row:'):
            continue
        row = {}
        # 去掉 "Row: N " 前綴
        body = re.sub(r'^Row:\s*\d+\s+', '', line)
        for m in re.finditer(r'(\w+)=(?:"([^"]*)"|([^,\s]+))', body):
            k = m.group(1)
            v = m.group(2) if m.group(2) is not None else m.group(3)
            row[k] = v
        rows.append(row)
    return rows

def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    # 行事曆清單
    cal_text = sh('adb shell "content query --uri content://com.android.calendar/calendars --projection _id:name:account_name"')
    cals = parse_rows(cal_text)
    cal_names = {r['_id']: r.get('name', '?') for r in cals}

    # 事件（全部，排除已刪除）
    ev_text = sh('adb shell "content query --uri content://com.android.calendar/events --projection calendar_id:title:dtstart:allDay --where \\"deleted=0\\""')
    events = parse_rows(ev_text)

    result = []
    for e in events:
        cid = e.get('calendar_id', '0')
        title = e.get('title', '').strip()
        dtstart = e.get('dtstart', '0')
        try:
            ms = int(dtstart)
        except ValueError:
            continue
        # epoch ms → 本地日期 (Asia/Taipei)
        dt = datetime.datetime.fromtimestamp(ms / 1000, datetime.timezone(datetime.timedelta(hours=8)))
        result.append({
            'title': title,
            'calendar': cal_names.get(cid, '?'),
            'cal_id': cid,
            'date': dt.strftime('%Y-%m-%d'),
            'allDay': e.get('allDay', '0') == '1'
        })

    result.sort(key=lambda x: x['date'])

    with open(CAL_JSON, 'w', encoding='utf-8') as f:
        json.dump({'updated': time.strftime('%Y-%m-%d %H:%M:%S'), 'events': result},
                  f, ensure_ascii=False, indent=2)

    # 統計
    by_cal = {}
    for r in result:
        by_cal[r['calendar']] = by_cal.get(r['calendar'], 0) + 1
    print(f'行事曆同步完成：{len(result)} 筆事件')
    for name, n in by_cal.items():
        print(f'  - {name}: {n} 筆')

if __name__ == '__main__':
    main()
