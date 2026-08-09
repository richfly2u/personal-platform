// 個人平台同步伺服器 — HTTPS + /sync + /api/todo-done
const https = require('https');
const fs = require('fs');
const path = require('path');
const {execSync, spawn} = require('child_process');

const ROOT = __dirname;
const PORT = 9443;
const SERVER_HOST = '192.168.0.75';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

// ---- adb 輔助 ----
function adb(args) {
  try {
    return execSync(['adb', ...args].join(' '), {encoding: 'utf8', timeout: 15000});
  } catch (e) {
    return {error: e.message};
  }
}

function adbTap(x, y) {
  execSync(`adb shell input tap ${x} ${y}`, {timeout: 8000});
}

function adbKey(k) {
  execSync(`adb shell input keyevent ${k}`, {timeout: 8000});
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function adbDump() {
  execSync('adb shell uiautomator dump /sdcard/window_dump.xml', {timeout: 12000});
  execSync(`adb pull /sdcard/window_dump.xml "${path.join(ROOT, '.dump.xml')}"`, {timeout: 12000});
  return fs.readFileSync(path.join(ROOT, '.dump.xml'), 'utf8');
}

function boundsCenter(bounds) {
  const m = bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!m) return null;
  return {x: (parseInt(m[1])+parseInt(m[3]))/2, y: (parseInt(m[2])+parseInt(m[4]))/2};
}

// ---- 待辦回寫 easynote ----
async function todoDone(text) {
  const PKG = 'easynotes.notes.notepad.notebook.privatenotes.note';
  adbKey('KEYCODE_BACK'); await sleep(300);
  adbKey('KEYCODE_BACK'); await sleep(300);
  execSync(`adb shell am force-stop ${PKG}`, {timeout: 8000});
  await sleep(800);
  execSync(`adb shell am start -n ${PKG}/notes.easy.android.mynotes.ui.activities.SplashActivity --activity-clear-task`, {timeout: 8000});
  await sleep(2500);

  // 找「待辦」筆記並點開
  let xml = await adbDump();
  let m = xml.match(/text="待辦"[^>]*note_title[^>]*bounds="(\[[^\"]+\])"/);
  if (!m) return {ok: false, error: '找不到待辦筆記'};
  let c = boundsCenter(m[1]);
  adbTap(c.x, c.y); await sleep(1800);

  // 在筆記內找符合文字的項目，點它的 checkbox
  xml = await adbDump();
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`text="${escaped}"[^>]*class="android.widget.EditText"[^>]*bounds="(\\[[^\\"]+\\])"`);
  m = xml.match(re);
  if (!m) {
    // 部分匹配（項目文字可能被截斷）
    const fuzzy = new RegExp(`text="[^"]*${escaped.slice(0, 8)}[^"]*"[^>]*bounds="(\\[[^\\"]+\\])"`);
    m = xml.match(fuzzy);
  }
  if (!m) return {ok: false, error: '找不到該待辦項目'};

  c = boundsCenter(m[1]);
  // checkbox 在項目文字左側 x≈198
  const checkX = 198;
  adbTap(checkX, c.y); await sleep(1200);

  // 驗證 checkbox 已勾選
  xml = await adbDump();
  const checkedRe = new RegExp(`class="android.widget.CheckBox"[^>]*checked="true"[^>]*bounds="\\[[^\\"]*\\]\\[\\d+,${Math.round(c.y-120)}\\][^\\"]*\\]`);
  const anyChecked = /checked="true"/.test(xml);
  adbKey('KEYCODE_BACK'); await sleep(300);
  return {ok: anyChecked, note: anyChecked ? '已勾選' : '未能確認勾選狀態'};
}

// ---- /sync 處理 ----
function runSync() {
  return new Promise((resolve) => {
    const py = process.platform === 'win32' ? 'python' : 'python3';
    const child = spawn(py, [path.join(ROOT, 'sync', 'sync_all.py')], {
      cwd: path.join(ROOT, 'sync'),
      timeout: 180000
    });
    let out = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => out += d);
    child.on('close', code => resolve({ok: code === 0, code, output: out}));
  });
}

// ---- HTTP 伺服器 ----
const server = https.createServer({
  key: fs.readFileSync(path.join(ROOT, 'key.pem')),
  cert: fs.readFileSync(path.join(ROOT, 'cert.pem'))
}, async (req, res) => {
  const url = req.url.split('?')[0];

  // 同步
  if (url === '/sync') {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    res.write(JSON.stringify({started: true}));
    res.end();
    const result = await runSync();
    console.log('[sync] done:', result.ok, result.output.slice(-200));
    return;
  }

  // 待辦回寫
  if (url === '/api/todo-done' && req.method === 'POST') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      try {
        const {text} = JSON.parse(body);
        const result = await todoDone(text);
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ok: false, error: String(e)}));
      }
    });
    return;
  }

  // 靜態檔案
  let filePath = path.join(ROOT, url);
  if (filePath.endsWith('/')) filePath = path.join(filePath, 'index.html');
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => console.log(`HTTPS sync server on :${PORT}`));
