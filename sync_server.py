#!/usr/bin/env python3
"""個人平台同步伺服器 — HTTPS + /sync + /api/todo-done"""
import http.server, ssl, os, json, re, subprocess, sys, threading, time, datetime, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = 9443

MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
}

EASYNOTE_PKG = 'easynotes.notes.notepad.notebook.privatenotes.note'
EASYNOTE_ACT = 'notes.easy.android.mynotes.ui.activities.SplashActivity'

def sh(cmd, timeout=20):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip()
    except Exception as e:
        return str(e)

def sh_bash(cmd, timeout=20):
    """用 bash 執行（adb.exe，避免 cmd 引號轉義問題）"""
    try:
        r = subprocess.run(['bash', '-lc', cmd], capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip()
    except Exception as e:
        return str(e)

def adb_tap(x, y):
    sh(f'adb shell input tap {int(x)} {int(y)}', 8)

def adb_key(key):
    sh(f'adb shell input keyevent {key}', 8)

def adb_dump():
    sh('adb shell uiautomator dump /sdcard/window_dump.xml', 12)
    sh(f'adb pull /sdcard/window_dump.xml "{os.path.join(ROOT, ".dump.xml")}"', 12)
    with open(os.path.join(ROOT, '.dump.xml'), encoding='utf-8') as f:
        return f.read()

def bounds_center(bounds):
    m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', bounds)
    if not m:
        return None
    return (int(m.group(1)) + int(m.group(3))) // 2, (int(m.group(2)) + int(m.group(4))) // 2

def todo_done(text):
    """回寫 easynote：勾選待辦項目"""
    # 喚醒手機（若鎖定會回報，不強解 PIN）
    sh('adb shell input keyevent KEYCODE_WAKEUP', 5)
    time.sleep(1)
    sh('adb shell wm dismiss-keyguard', 5)
    time.sleep(1)

    # 關掉可能殘留的對話框 + 重開
    adb_key('KEYCODE_BACK'); time.sleep(0.3)
    adb_key('KEYCODE_BACK'); time.sleep(0.3)
    sh(f'adb shell am force-stop {EASYNOTE_PKG}', 8)
    time.sleep(0.8)
    sh(f'adb shell am start -n {EASYNOTE_PKG}/{EASYNOTE_ACT} --activity-clear-task', 8)
    time.sleep(2.5)

    # 找「待辦」筆記
    xml = adb_dump()
    # 鎖定畫面偵測
    if 'aod_' in xml or 'miui_aod' in xml or 'keyguard' in xml:
        return {'ok': False, 'error': '手機鎖定，請先解鎖'}
    m = re.search(r'text="待辦"[^>]*note_title[^>]*bounds="(\[[^"]+\])"', xml)
    if not m:
        return {'ok': False, 'error': '找不到待辦筆記'}
    x, y = bounds_center(m.group(1))
    adb_tap(x, y); time.sleep(1.8)

    # 在筆記內找符合文字的項目
    xml = adb_dump()
    esc = re.escape(text)
    m = re.search(rf'text="{esc}"[^>]*class="android.widget.EditText"[^>]*bounds="(\[[^"]+\])"', xml)
    if not m:
        # 模糊匹配（前 8 字）
        fuzzy = re.escape(text[:8])
        m = re.search(rf'text="[^"]*{fuzzy}[^"]*"[^>]*bounds="(\[[^"]+\])"', xml)
    if not m:
        return {'ok': False, 'error': '找不到該待辦項目'}

    x, y = bounds_center(m.group(1))
    # 找同一行的 CheckBox（動態定位，比固定 x 可靠）
    cb_x = None
    for cb in re.finditer(
        r'class="android.widget.CheckBox"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml):
        cy = (int(cb.group(2)) + int(cb.group(4))) // 2
        if abs(cy - y) < 120:
            cb_x = (int(cb.group(1)) + int(cb.group(3))) // 2
            break
    if cb_x is None:
        cb_x = 198  # fallback
    adb_tap(cb_x, y); time.sleep(1.2)

    # 驗證：該項目所在 y 的 CheckBox 是否 checked="true"
    xml = adb_dump()
    target_checked = False
    # CheckBox 的 y 範圍與項目文字接近（上下差 <120）
    for cb in re.finditer(
        r'class="android.widget.CheckBox"[^>]*checked="(true|false)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', xml):
        cb_cy = (int(cb.group(3)) + int(cb.group(5))) // 2
        if abs(cb_cy - y) < 120:
            target_checked = cb.group(1) == 'true'
            break
    adb_key('KEYCODE_BACK'); time.sleep(0.3)
    return {'ok': target_checked, 'note': '已勾選' if target_checked else '未勾選'}

CALENDAR_ID = '15'  # alan行事曆（Jorte 顯示的行事曆）
TZ8 = datetime.timezone(datetime.timedelta(hours=8))  # 台灣

def _day_ms(y, m, d):
    """當天 GMT+8 午夜 epoch ms（與系統行事曆儲存值一致）"""
    start = datetime.datetime(y, m, d, 0, 0, 0, tzinfo=TZ8)
    return int(start.timestamp() * 1000)

def cal_add(title, date):
    """寫入系統行事曆 → Jorte 小工具立即顯示。回傳手機端 _id 供日後刪除"""
    try:
        y, m, d = [int(x) for x in date.split('-')]
        # 用當天 UTC 午夜（provider 會以 Asia/Taipei 解讀並儲存為正確的 UTC instant）
        start_ms = int(datetime.datetime(y, m, d, 0, 0, 0, tzinfo=datetime.timezone.utc).timestamp() * 1000)
        end_ms = start_ms + 86400000
    except Exception:
        return {'ok': False, 'error': '日期格式錯誤'}
    cmd = (f'adb.exe shell "content insert --uri content://com.android.calendar/events '
           f'--bind calendar_id:i:{CALENDAR_ID} '
           f'--bind title:s:{title} '
           f'--bind dtstart:l:{start_ms} '
           f'--bind dtend:l:{end_ms} '
           f'--bind allDay:i:1 '
           f'--bind eventTimezone:s:Asia/Taipei"')
    sh_bash(cmd, 15)
    # 查回實際 _id（取最新一筆同名）
    q = sh_bash(
        f'adb.exe shell "content query --uri content://com.android.calendar/events '
        f'--projection _id:dtstart --where \\\"title=\'{title}\'\\\""', 15)
    phone_id = None
    for line in q.splitlines():
        m = re.search(r'_id=(\d+)', line)
        if m:
            phone_id = int(m.group(1))  # 取最後一筆 = 最新
    # 記錄到本機檔（供日後刪除比對）
    local_file = os.path.join(ROOT, 'data', 'cal-events-local.json')
    events = []
    if os.path.exists(local_file):
        try:
            events = json.load(open(local_file, encoding='utf-8'))
        except Exception:
            events = []
    events.append({'title': title, 'date': date, 'phone_id': phone_id})
    with open(local_file, 'w', encoding='utf-8') as f:
        json.dump(events, f, ensure_ascii=False)
    return {'ok': True, 'note': f'已寫入行事曆：{title} ({date})'}

def cal_del(title, date):
    """刪除系統行事曆事件（用記錄的 phone_id）"""
    local_file = os.path.join(ROOT, 'data', 'cal-events-local.json')
    phone_id = None
    if os.path.exists(local_file):
        try:
            events = json.load(open(local_file, encoding='utf-8'))
        except Exception:
            events = []
        for e in events:
            if e.get('title') == title and e.get('date') == date:
                phone_id = e.get('phone_id')
        events = [e for e in events if not (e.get('title') == title and e.get('date') == date)]
        with open(local_file, 'w', encoding='utf-8') as f:
            json.dump(events, f, ensure_ascii=False)
    if phone_id:
        sh_bash(f'adb.exe shell "content delete --uri content://com.android.calendar/events '
                f'--where \\\"_id={phone_id}\\\""', 15)
        return {'ok': True, 'note': f'已刪除：{title} ({date})'}
    # 沒有記錄 → 用 title+dtstart 補刪
    try:
        y, m, d = [int(x) for x in date.split('-')]
        start_ms = int(datetime.datetime(y, m, d, 0, 0, 0, tzinfo=datetime.timezone.utc).timestamp() * 1000)
    except Exception:
        return {'ok': False, 'error': '日期格式錯誤'}
    sh_bash(
        f"adb.exe shell \"content delete --uri content://com.android.calendar/events "
        f"--where \\\"title='{title}' AND dtstart={start_ms}\\\"\"", 15)
    return {'ok': True, 'note': f'已刪除（無記錄）：{title} ({date})'}

_DEEPSEEK_KEY = None

def _load_deepseek_key():
    """從 ~/.hermes/.env 讀 DEEPSEEK_API_KEY（有效的那組）"""
    global _DEEPSEEK_KEY
    if _DEEPSEEK_KEY:
        return _DEEPSEEK_KEY
    try:
        env = os.path.join(os.path.expanduser('~'), '.hermes', '.env')
        for line in open(env, encoding='utf-8'):
            line = line.strip()
            if line.startswith('DEEPSEEK_API_KEY='):
                _DEEPSEEK_KEY = line.split('=', 1)[1].strip().strip('"').strip("'")
                break
    except Exception:
        pass
    return _DEEPSEEK_KEY

def polish_text(text):
    """DeepSeek 潤稿：加標點 + 潤飾（用於日記語音）"""
    key = _load_deepseek_key()
    if not key:
        return {'ok': False, 'error': '無 DeepSeek key'}
    payload = {
        'model': 'deepseek-chat',
        'messages': [
            {'role': 'system', 'content': '你是繁體中文潤稿助手。把使用者輸入的語音轉文字加上正確標點符號並潤飾成通順的句子，保留原意與細節，不增刪事實，只輸出潤飾後的文字，不要任何解釋或前言。'},
            {'role': 'user', 'content': text}
        ],
        'temperature': 0.2,
        'max_tokens': 800
    }
    try:
        req = urllib.request.Request(
            'https://api.deepseek.com/chat/completions',
            data=json.dumps(payload).encode(),
            headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {key}'},
            method='POST')
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.loads(r.read())
        out = data['choices'][0]['message']['content'].strip()
        return {'ok': True, 'text': out}
    except Exception as e:
        return {'ok': False, 'error': str(e)}

def run_sync():
    """跑 sync_all.py（含 git push）"""
    script = os.path.join(ROOT, 'sync', 'sync_all.py')
    try:
        r = subprocess.run([sys.executable, script], capture_output=True, text=True,
                           timeout=240, cwd=os.path.join(ROOT, 'sync'))
        return {'ok': r.returncode == 0, 'code': r.returncode,
                'output': (r.stdout + r.stderr)[-2000:]}
    except subprocess.TimeoutExpired:
        return {'ok': False, 'error': '同步逾時'}

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f'[{time.strftime("%H:%M:%S")}] {fmt % args}', flush=True)

    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        # CORS 預檢（GitHub Pages 跨域連本機必經）
        self.send_response(204)
        self._cors_headers()
        self.send_header('Access-Control-Max-Age', '86400')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self._cors_headers()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = self.path.split('?')[0]
        if url == '/sync':
            # 同步（同步執行，完成才回傳）
            result = run_sync()
            self._json(result)
            return
        self._serve_file(url)

    def do_POST(self):
        url = self.path.split('?')[0]
        if url == '/api/todo-done':
            length = int(self.headers.get('Content-Length', 0))
            try:
                body = json.loads(self.rfile.read(length) or b'{}')
                text = body.get('text', '')
                if not text:
                    return self._json({'ok': False, 'error': '缺 text'})
                result = todo_done(text)
                return self._json(result)
            except Exception as e:
                return self._json({'ok': False, 'error': str(e)})
        if url == '/api/cal-add':
            length = int(self.headers.get('Content-Length', 0))
            try:
                body = json.loads(self.rfile.read(length) or b'{}')
                title = body.get('title', '')
                date = body.get('date', '')
                if not title or not date:
                    return self._json({'ok': False, 'error': '缺 title/date'})
                return self._json(cal_add(title, date))
            except Exception as e:
                return self._json({'ok': False, 'error': str(e)})
        if url == '/api/cal-del':
            length = int(self.headers.get('Content-Length', 0))
            try:
                body = json.loads(self.rfile.read(length) or b'{}')
                title = body.get('title', '')
                date = body.get('date', '')
                if not title or not date:
                    return self._json({'ok': False, 'error': '缺 title/date'})
                return self._json(cal_del(title, date))
            except Exception as e:
                return self._json({'ok': False, 'error': str(e)})
        if url == '/api/polish':
            length = int(self.headers.get('Content-Length', 0))
            try:
                body = json.loads(self.rfile.read(length) or b'{}')
                text = body.get('text', '')
                if not text:
                    return self._json({'ok': False, 'error': '缺 text'})
                return self._json(polish_text(text))
            except Exception as e:
                return self._json({'ok': False, 'error': str(e)})
        self._serve_file(url)

    def _serve_file(self, url):
        file_path = os.path.join(ROOT, url.lstrip('/'))
        if os.path.isdir(file_path):
            file_path = os.path.join(file_path, 'index.html')
        if not file_path.startswith(ROOT) or not os.path.isfile(file_path):
            self.send_response(404)
            self._cors_headers()
            self.end_headers()
            self.wfile.write(b'Not found')
            return
        ext = os.path.splitext(file_path)[1]
        with open(file_path, 'rb') as f:
            data = f.read()
        self.send_response(200)
        self._cors_headers()
        self.send_header('Content-Type', MIME.get(ext, 'application/octet-stream'))
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

if __name__ == '__main__':
    os.chdir(ROOT)
    httpd = http.server.ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(os.path.join(ROOT, 'cert.pem'), os.path.join(ROOT, 'key.pem'))
    httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
    print(f'HTTPS sync server on :{PORT}', flush=True)
    httpd.serve_forever()
