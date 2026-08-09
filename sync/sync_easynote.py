#!/usr/bin/env python3
"""easynote 待辦同步 — 直接從筆記畫面擷取清單項目"""
import subprocess, time, re, json, os, xml.etree.ElementTree as ET

PACKAGE = 'easynotes.notes.notepad.notebook.privatenotes.note'
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
TODO_JSON = os.path.join(DATA_DIR, 'todos.json')
LOCAL_DUMP = os.path.join(DATA_DIR, 'easynote_dump.xml')

def sh(cmd):
    subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=15)

def dump():
    sh('adb shell uiautomator dump /sdcard/window_dump.xml')
    sh(f'adb pull /sdcard/window_dump.xml "{LOCAL_DUMP}"')
    return ET.parse(LOCAL_DUMP).getroot()

def get_center(el):
    m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', el.get('bounds', ''))
    return ((int(m.group(1)) + int(m.group(3))) // 2,
            (int(m.group(2)) + int(m.group(4))) // 2)

def parse_checklist_items(root):
    """Parse checklist items from note detail view"""
    items = []
    in_checklist = False
    for el in root.iter():
        t = el.get('text', '').strip()
        rid = el.get('resource-id', '') or ''
        cls = el.get('class', '') or ''
        
        if 'detail_title' in rid:
            in_checklist = True
            continue
        if not in_checklist:
            continue
        if '新增項目' in t:
            break
        if 'EditText' in cls and t:
            if t not in items:
                items.append(t)
    return items

def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    
    # Dismiss + force stop + fresh start
    sh('adb shell input keyevent KEYCODE_BACK')
    time.sleep(0.3)
    sh('adb shell input keyevent KEYCODE_BACK')
    time.sleep(0.3)
    sh(f'adb shell am force-stop {PACKAGE}')
    time.sleep(1)
    sh(f'adb shell am start -n {PACKAGE}/notes.easy.android.mynotes.ui.activities.SplashActivity --activity-clear-task')
    time.sleep(3)
    
    # Find and tap "待辦" note
    root = dump()
    todo_el = None
    for el in root.iter():
        if el.get('text', '') == '待辦' and 'note_title' in (el.get('resource-id', '') or ''):
            todo_el = el
            break
    
    if todo_el is None:
        print('找不到待辦筆記')
        return
    
    x, y = get_center(todo_el)
    sh(f'adb shell input tap {x} {y}')
    time.sleep(2)
    
    # Parse items
    root = dump()
    items = parse_checklist_items(root)
    
    if not items:
        print('找不到待辦項目')
        return
    
    # Back to main
    sh('adb shell input keyevent KEYCODE_BACK')
    
    todos = {
        'updated': time.strftime('%Y-%m-%d %H:%M:%S'),
        'items': [{'text': t, 'completed': False, 'source': 'easynote'} for t in items]
    }
    
    with open(TODO_JSON, 'w', encoding='utf-8') as f:
        json.dump(todos, f, ensure_ascii=False, indent=2)
    
    print(f'待辦同步完成：{len(items)} 項')
    for i in items:
        print(f'  - {i}')

if __name__ == '__main__':
    main()
