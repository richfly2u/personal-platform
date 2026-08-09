#!/usr/bin/env python3
"""個人平台同步伺服器 — HTTPS + /sync + /api/todo-done"""
import http.server, ssl, os, json, re, subprocess, sys, threading, time

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

def sh(cmd, timeout=15):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
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
    # checkbox 在項目文字左側 x≈198
    adb_tap(198, y); time.sleep(1.2)

    # 驗證：有 checked="true"
    xml = adb_dump()
    any_checked = 'checked="true"' in xml
    adb_key('KEYCODE_BACK'); time.sleep(0.3)
    return {'ok': any_checked, 'note': '已勾選' if any_checked else '未能確認勾選狀態'}

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

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
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
        self._serve_file(url)

    def _serve_file(self, url):
        file_path = os.path.join(ROOT, url.lstrip('/'))
        if os.path.isdir(file_path):
            file_path = os.path.join(file_path, 'index.html')
        if not file_path.startswith(ROOT) or not os.path.isfile(file_path):
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'Not found')
            return
        ext = os.path.splitext(file_path)[1]
        with open(file_path, 'rb') as f:
            data = f.read()
        self.send_response(200)
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
