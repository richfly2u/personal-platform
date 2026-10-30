/* === 個人平台 PWA — 主邏輯（動態類別版） === */

const STORAGE_KEY = 'personal_platform_data_v2';

// 預設類別
const BUILTIN_CATEGORIES = [
  {id: 'todo',    name: '待辦事項', icon: '✓'},
  {id: 'diary',   name: '日記',     icon: '📅'},
  {id: 'expense', name: '收支',     icon: '💰'},
  {id: 'idea',    name: '靈感',     icon: '💡'}
];

// === 內嵌 SVG 圖示（不用 emoji，避免部分環境沒有 emoji 字型顯示成 □）===
const ICON_PATHS = {
  home: '<path d="M3 10.6 12 3.2l9 7.4"/><path d="M5.6 9.6V20h12.8V9.6"/>',
  check: '<polyline points="20 6.5 9.2 17 4 11.8"/>',
  calendar: '<rect x="3.4" y="5.2" width="17.2" height="15.2" rx="2.6"/><path d="M8 3v4.2M16 3v4.2M3.4 10.2h17.2"/>',
  money: '<rect x="2.6" y="6.4" width="18.8" height="11.2" rx="2.6"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.01M18 12h.01"/>',
  bulb: '<path d="M9.4 18.2h5.2"/><path d="M10.4 21h3.2"/><path d="M12 3a5.9 5.9 0 0 0-3.5 10.6c.5.4.8.9.9 1.5l.1.5h5l.1-.5c.1-.6.4-1.1.9-1.5A5.9 5.9 0 0 0 12 3Z"/>',
  chart: '<path d="M4 20.5V10M10 20.5V4M16 20.5v-7M22 20.5H2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m16.4 16.4 4.6 4.6"/>',
  download: '<path d="M12 3.5v11.5"/><path d="m7.2 11 4.8 4.8 4.8-4.8"/><path d="M4.2 20.2h15.6"/>',
  upload: '<path d="M12 20.2V8.6"/><path d="m7.2 12 4.8-4.8L16.8 12"/><path d="M4.2 4.2h15.6"/>',
  bento: '<rect x="3" y="6.2" width="18" height="13" rx="2.6"/><path d="M9.2 6.2v13M14.8 6.2v13"/>',
  building: '<path d="M5 21V6.4L12 3.2l7 3.2V21"/><path d="M9.4 21v-5.2h5.2V21"/><path d="M9.2 9.4h.01M14.8 9.4h.01M9.2 12.8h.01M14.8 12.8h.01"/>',
  temple: '<path d="M12 3.2 3.2 8.2h17.6L12 3.2Z"/><path d="M6.4 8.2V20M17.6 8.2V20M10 20.4v-5.6h4v5.6"/><path d="M3.6 20.4h16.8"/>',
  utensils: '<path d="M7 3.2v7.4c0 1.2.9 2.2 2 2.2v8"/><path d="M7 3.2v5.4M11 3.2v5.4"/><path d="M16.6 3.2c1.6 0 2.6 2 2.6 5.4 0 2.4-1 3.6-2.6 3.9v8.1"/>',
  edit: '<path d="M4.2 19.8h4L19 9l-4-4L4.2 15.8v4Z"/><path d="m13.6 6.4 4 4"/>',
  trash: '<path d="M4.2 7h15.6"/><path d="M9.4 7V4.2h5.2V7"/><path d="M6.2 7 7.2 20.4h9.6L17.8 7"/>',
  mic: '<rect x="9" y="3" width="6" height="10" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3"/>',
  eye: '<path d="M2.8 12S6.5 5.8 12 5.8 21.2 12 21.2 12 17.5 18.2 12 18.2 2.8 12 2.8 12Z"/><circle cx="12" cy="12" r="3"/>',
  share: '<path d="M12 15.5V4"/><path d="m8 7.8 4-3.8 4 3.8"/><path d="M5 13.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5.5"/>'
};
const CAT_ICON = { todo: 'check', diary: 'calendar', expense: 'money', idea: 'bulb', habits: 'chart' };

function ico(name, size) {
  const p = ICON_PATHS[name];
  if (!p) return '';
  const s = size || 18;
  return `<svg class="ico" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}
// 分類圖示：內建分類走 SVG；自訂分類沿用使用者選的 emoji
function catIcon(cat, size) {
  const key = cat && CAT_ICON[cat.id];
  if (key) return ico(key, size);
  return `<span class="ico-emoji">${escHtml((cat && cat.icon) || '•')}</span>`;
}

// === 自動更新偵測（v18：不再自動重載，避免抖動迴圈）===
// 舊版（v16 之前）看到 version.txt 空值也會停止重載 → 一舉停止所有迴圈
const APP_VERSION = '71';
const MONTHLY_INCOME = 38000;  // 每月固定收入（內定）
const MONTHLY_HOUSING = 8000;  // 每月固定住房支出（內定）
fetch('version.txt?v=' + Date.now())
  .then(r => r.text())
  .then(t => { if (t.trim() && t.trim() !== APP_VERSION) console.log('有新版本，請重新整理'); })
  .catch(() => {});

// 資料結構
let appData = {
  categories: [...BUILTIN_CATEGORIES],
  items: {},          // catId -> [{id, text, completed?, store?, amount?, date, source}]
  calEvents: [],      // 本機新增的行事曆事件
  syncEvents: []      // 同步進來的行事曆事件
};

let currentTab = 'todo';
let editingId = null;  // 目前正在編輯的項目 id
let newQuad = 1;
let diaryCurId = null;   // 目前正在寫的日記（隨寫隨存，不用按新增）        // 新增待辦時選的四象限（1 重要且緊急 … 4 不重要不緊急）
let diaryFresh = false;  // 進入日記頁一律從空白開始（前賢 2026-10-30 要求）
let diaryMood = '';      // 日記心情（奶油日常，2026-10-30）
const DIARY_MOODS = ['喜', '怒', '哀', '樂', '平靜'];
const DIARY_MOOD_EMOJI = { '喜': '😄', '怒': '😠', '哀': '😢', '樂': '🥳', '平靜': '😌' };
const DIARY_MOOD_CLS = { '喜': 'xi', '怒': 'nu', '哀': 'ai', '樂': 'le', '平靜': 'calm' };
let diaryQuery = '';                    // 日記搜尋字
let diaryMoodFilter = '';               // 日記心情篩選（空 = 全部）
const diaryClosedMonths = new Set();    // 已收合的月份
let expenseView = { year: null, month: null };  // 收支檢視月份（null=本月）
let dashboardOpen = false;  // 養成好習慣 iframe 是否開啟
let homeOpen = true;  // 首頁（整合五項目摘要）是否顯示
const DASH_URL = 'https://richfly2u.github.io/daily-dashboard/';
let voiceSupported = false;  // 瀏覽器是否支援語音辨識（決定是否顯示麥克風按鈕）
const NAV_KEY = 'personal_platform_nav';  // 目前頁面狀態（重整後維持）
let autoSaveTimer = null;  // 語音後 5 秒未觸碰 → 自動存入計時
const AUTOSAVE_MS = 5000;
// 本次剛新增的項目 id（只存在記憶體，重新整理後就歸位到原本位置）
const pendingIds = new Set();
// 收支「明細」目前展開哪些分類（記憶體；重新渲染後要維持展開狀態）
const openCats = new Set();

function clearAutoSave() {
  if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
}
// 輸入框自動長高（文字多時可完整看到，最高 200px 後可捲動）
function autoGrowInput(el) {
  if (!el) return;
  const MAX = 200;
  el.style.height = 'auto';
  const h = el.scrollHeight;
  el.style.height = (h > MAX ? MAX : h) + 'px';
  el.style.overflowY = h > MAX ? 'auto' : 'hidden';
}
// 語音停止且有文字時，啟動 5 秒自動存入（前賢觸碰螢幕/輸入會重設）
function startAutoSave() {
  clearAutoSave();
  const addText = document.getElementById('addText');
  if (!addText || !addTextValue(addText).trim()) return;
  autoSaveTimer = setTimeout(() => { autoSaveTimer = null; submitAddText(); }, AUTOSAVE_MS);
}

// 取值工具：日記用 div 內嵌編輯器（可放圖），其他分頁仍是 textarea
function addTextValue(el) {
  const n = el || document.getElementById('addText');
  if (!n) return '';
  if (n.tagName === 'TEXTAREA' || n.tagName === 'INPUT') return n.value || '';
  if (window.DiaryUI && window.DiaryUI.edValue) return window.DiaryUI.edValue(n);
  return n.innerText || '';
}

// === 初始化 ===
async function init() {
  loadData();
  migrateOldData();
  setupVoice();
  restoreNav();  // 重整後回到上次的頁面
  // 支援直接連結：?tab=diary / ?tab=todo …（前賢 2026-10-30 要日記的連結）
  try {
    const t = new URLSearchParams(location.search).get('tab');
    if (t && (t === 'habits' || appData.categories.some(c => c.id === t))) {
      currentTab = t;
      homeOpen = false;
      dashboardOpen = (t === 'habits');
      if (t === 'diary') diaryFresh = true;
    }
  } catch (e) {}
  // 先顯示本機資料，避免遠端發票服務慢或離線時整個首頁卡住。
  if (dashboardOpen) showDashboard();
  else renderAll();
  loadSyncData().then(() => {
    // 同步只補資料，不應打斷使用者正在輸入或編輯的畫面。
    if (!editingId && !addTextValue(document.getElementById('addText')).trim()) renderAll();
  }).catch(() => {});
}

// === 導航狀態讀寫（重整後維持目前頁面）===
function saveNav() {
  try {
    localStorage.setItem(NAV_KEY, JSON.stringify({ currentTab, homeOpen, dashboardOpen }));
  } catch(e) {}
}
function restoreNav() {
  try {
    const s = JSON.parse(localStorage.getItem(NAV_KEY) || 'null');
    if (s) {
      if (typeof s.currentTab === 'string') currentTab = s.currentTab;
      // 若存的頁面已不存在（如已撤銷的便利貼 sticky）→ 退回第一個類別
      // habits 是模組頁（不在 categories 內）
      if (currentTab !== 'habits' && !appData.categories.some(c => c.id === currentTab)) currentTab = (appData.categories[0] || {}).id || 'todo';
      homeOpen = !!s.homeOpen;
      dashboardOpen = !!s.dashboardOpen;
      if (currentTab === 'diary') diaryFresh = true;   // 重開 App 停在日記頁也是空白開始
    }
  } catch(e) {}
}

// === 資料讀寫 ===
function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const saved = JSON.parse(raw);
      // 移除已刪除的「便利貼 sticky」分類（v23 撤銷，但舊 localStorage 仍殘留 sticky 分類→導航還看得到便利貼）
      if (saved.categories) appData.categories = saved.categories.filter(c => c.id !== 'sticky');
      if (saved.items) { appData.items = saved.items; delete appData.items.sticky; }
      // 舊分類修正：崇德發是餐廳（食），曾因 /崇德/ 關鍵字被歸「道場」而存在項目裡
      for (const it of (appData.items.expense || [])) {
        if (it.cat === '道場' && /崇德發/.test((it.store || '') + (it.text || ''))) it.cat = '食';
      }
    } catch(e) {}
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    return true;
  } catch (e) {
    // 儲存空間滿、瀏覽器限制或隱私模式失敗時，不讓錯誤中斷整個介面。
    if (!saveData._warned) {
      saveData._warned = true;
      if (typeof showUtilityNotice === 'function') showUtilityNotice('資料未能儲存！請立即匯出備份，並清理裝置儲存空間。', true);
      else console.error('個人平台資料儲存失敗', e);
    }
    return false;
  }
}

// 舊格式遷移（v1 → v2）
function migrateOldData() {
  const old = localStorage.getItem('personal_platform_data');
  if (!old) return;
  try {
    const d = JSON.parse(old);
    const items = {};
    for (const cat of BUILTIN_CATEGORIES) {
      const key = {todo:'todos', diary:'diaries', expense:'expenses', idea:'ideas'}[cat.id];
      if (d[key]) items[cat.id] = d[key];
    }
    // 合併：不覆蓋新資料
    for (const k of Object.keys(items)) {
      if (!appData.items[k]) appData.items[k] = items[k];
    }
    saveData();
    localStorage.removeItem('personal_platform_data');
  } catch(e) {}
}

// 確保每個類別都有陣列
function getItems(catId) {
  if (!appData.items[catId]) appData.items[catId] = [];
  return appData.items[catId];
}

// 依 id 找出項目真正所在的陣列
// （收支頁渲染用的 items 是「當月過濾後的複本」，對它 splice 不會刪到資料）
// 供日記明細勾選回寫用
window.__ppFindItem = function (id) {
  for (const key of Object.keys(appData.items || {})) {
    const arr = appData.items[key] || [];
    const hit = arr.find(x => x.id === id);
    if (hit) return hit;
  }
  return null;
};

function findItemById(id) {
  for (const catId of Object.keys(appData.items)) {
    const arr = appData.items[catId];
    if (!Array.isArray(arr)) continue;
    const idx = arr.findIndex(i => i.id === id);
    if (idx >= 0) return { arr, idx };
  }
  return null;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function today() {
  const d = new Date();
  return `${d.getMonth()+1}/${d.getDate()}`;
}

// 日期＋時間（日記用：自動紀錄「此時此刻」）
function nowStamp() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth()+1}/${d.getDate()} ${hh}:${mm}`;
}

// === 同步資料 ===
async function loadSyncData() {
  try {
    // 優先讀 VPS 即時發票；設定逾時，避免離線時拖住初始化。
    // 不再把私人發票明細打包進公開網站原始碼；遠端不可用時保留本機既有紀錄即可。
    let invoices = null;
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 3500);
      try {
        const remote = await fetch(INVOICE_REMOTE_URL, { cache: 'no-store', signal: ctl.signal });
        if (remote.ok) invoices = await remote.json();
      } finally { clearTimeout(timer); }
    } catch (e) { /* 離線或服務暫時不可用，使用者仍可正常操作本機資料 */ }
    if (Array.isArray(invoices)) {
      const expenseItems = getItems('expense');
      const existingById = new Map(expenseItems.filter(e=>e.source==='invoice').map(e=>[e.id, e]));
      for (const inv of invoices) {
        if (existingById.has(inv.id)) {
          // 更新既有發票的明細（保留使用者手動改的 store/date）
          const existing = existingById.get(inv.id);
          existing.items = inv.items || existing.items || [];
          if (inv.amount != null) existing.amount = inv.amount;
          if (inv.item) {
            // text 與 item 都要更新：renderItem() 顯示品項時優先取 it.item，
            // 只更新 text 會讓分類明細永遠停在第一次匯入的舊品項名
            // （2026-09-30 前賢回報「食的明細沒有更新」的根因）
            existing.text = inv.item;
            existing.item = inv.item;
          }
        } else {
          expenseItems.push({
            id: inv.id,
            store: inv.store || '未知',
            item: inv.item || '',
            text: inv.item || '',
            amount: inv.amount || 0,
            date: inv.date || '',
            source: 'invoice',
            items: inv.items || []
          });
        }
      }
    }
  } catch(e) {}

  saveData();
}

// === 發票即時更新（切到收支頁時觸發 VPS 去財政部抓一次）===
const REFRESH_API = 'https://kindhome.net/api/pp-invoice/refresh';
const REFRESH_STATUS = 'https://kindhome.net/api/pp-invoice/status';
let invoiceRefreshing = false;

function invoiceToast(msg, ms) {
  let el = document.getElementById('invoiceToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'invoiceToast';
    el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:24px;z-index:9999;'
      + 'background:rgba(17,24,39,.92);color:#fff;padding:10px 16px;border-radius:999px;'
      + 'font-size:.85rem;box-shadow:0 4px 16px rgba(0,0,0,.25);transition:opacity .25s;white-space:nowrap;max-width:90vw';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = 'block';
  el.style.opacity = '1';
  if (ms) setTimeout(() => { el.style.opacity = '0'; setTimeout(() => { el.style.display = 'none'; }, 300); }, ms);
}

async function refreshInvoicesFromVps() {
  if (invoiceRefreshing) return;
  invoiceRefreshing = true;
  try {
    const r = await fetch(REFRESH_API, { method: 'POST' });
    const d = await r.json();
    // 剛抓過（10 分鐘內）或正在抓 → 不用等，畫面顯示的已經是最新
    if (d.status === 'fresh') { invoiceRefreshing = false; return; }
    invoiceToast('發票更新中…', 0);
    for (let i = 0; i < 40; i++) {          // 最多等 200 秒
      await new Promise(res => setTimeout(res, 5000));
      const s = await (await fetch(REFRESH_STATUS, { cache: 'no-store' })).json();
      if (!s.running) {
        await loadSyncData();               // 重讀最新資料
        renderAll();                        // 重繪畫面
        invoiceToast(s.last_result === 'ok' ? ('發票已更新（' + s.count + ' 筆）') : '發票更新失敗，稍後再試', 3000);
        invoiceRefreshing = false;
        return;
      }
    }
    invoiceToast('發票更新太久，稍後再試', 3000);
  } catch (e) {
    // 離線或 API 不通 → 安靜結束（畫面上仍是上次抓到的資料）
  }
  invoiceRefreshing = false;
}

// === 語音輸入 ===
function setupVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceSupported = false;
    return;
  }
  voiceSupported = true;

  let recognition = null;
  let committed = '';     // 已確認文字（起點＝輸入框原有內容）
  let finalCount = 0;     // 本辨識工作階段已累積的最終結果數（防同一段重複）
  let inputRef = null;    // 本工作階段的輸入框節點（被重繪＝已存入/換頁 → 丟棄遲到結果）
  let stoppedByUser = false;
  let silenceTimer = null;
  const SILENCE_MS = 3000;  // 斷音超過 3 秒自動停止

  function micBtn() { return document.getElementById('micBtn'); }
  function addInput() { return document.getElementById('addText'); }

  // 接上新片段並去掉與尾端重疊的部分
  // （Chrome 續聽開新 session 時，會把上一段的尾句當成新的最終結果重送 → 不去重就會重複出現）
  function appendSegment(base, seg) {
    if (!seg) return base;
    if (!base) return seg;
    if (base.endsWith(seg)) return base;                // 整段重複
    const max = Math.min(base.length, seg.length);
    for (let k = max; k > 0; k--) {                     // 找最大重疊長度
      if (base.slice(-k) === seg.slice(0, k)) return base + seg.slice(k);
    }
    return base + seg;
  }

  // 把「已確認文字 + 即時辨識中」寫進輸入框（即時文字每輪重算，不累積）
  function renderInput(interim) {
    const inp = addInput();
    if (inp) { inp.value = appendSegment(committed, interim || ''); autoGrowInput(inp); }
  }
  // 錯誤訊息：暫時顯示在輸入框 placeholder
  function showInputError(msg) {
    const inp = addInput();
    if (inp) inp.placeholder = msg;
  }

  // 語音講完自動加標點（DeepSeek／聲寫AI 同一套）
  // 顯示在輸入框讓前賢一眼確認成功；5 秒自動存入之前就會跑完（實測 1 秒左右）
  let polishing = false;
  let polishedFor = '';   // 已加過標點的那段原文（避免重複呼叫 API）
  async function autoPunctuate() {
    const inp = addInput();
    if (!inp) return null;
    const raw = inp.value.trim();
    if (!raw || raw.length < 3 || polishing) return null;
    if (polishedFor === raw) return raw;      // 這段已經加過標點 → 直接回傳，讓呼叫端可以存入
    polishing = true;
    const ph = inp.placeholder;
    inp.placeholder = '🤖 加標點中…';
    let out = null;
    try { out = await polishText(raw, 12000); } catch (e) { out = null; }
    polishing = false;
    const now = addInput();
    if (!now) return null;
    now.placeholder = ph;
    if (now.value.trim() !== raw) return null;   // 期間被編輯過／已存入 → 不覆蓋
    const text = (out && out.trim()) ? out.trim() : localPolish(raw);  // 連不上就退回本地補句號
    polishedFor = text;
    committed = text;
    now.value = text;
    autoGrowInput(now);
    return text;
  }

  async function stopListening() {
    const b = micBtn();
    if (b) { b.classList.remove('listening'); b.textContent = '🎤'; }
    if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
    if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }   // 語音這條路完全不靠計時器
    const done = await autoPunctuate();   // 先等標點進輸入框（最多 12 秒；連不上會退回本地補句號）
    // 標點一好就直接存入（不再等 5 秒）；期間輸入框被改過／已存入就不動它
    const inp = addInput();
    if (done && inp && inp.value.trim() === String(done).trim()) submitAddText();
  }

  // 斷音計時：有收到語音就重置，超過 SILENCE_MS 沒聲音則自動停止
  function resetSilenceTimer() {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      stoppedByUser = true;
      try { recognition.stop(); } catch(e) {}
      stopListening();
    }, SILENCE_MS);
  }

  // 先確認麥克風權限（Chrome 首次點擊會跳權限提示，未授權前 onstart 不會觸發）
  async function ensureMicPermission() {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const st = await navigator.permissions.query({ name: 'microphone' });
        if (st.state === 'granted') return true;
        if (st.state === 'denied') return false;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      return true;
    } catch (e) {
      return false;
    }
  }

  function startListening() {
    stoppedByUser = false;
    const b = micBtn();
    if (b) { b.classList.add('listening'); b.textContent = '🔴'; }

    ensureMicPermission().then(granted => {
      if (!granted) {
        stopListening();
        showInputError('未允許麥克風權限，請點網址列左側 🔒 允許後重試');
        return;
      }
      beginRecognition();
    });
  }

  function beginRecognition() {
    recognition = new SpeechRecognition();
    recognition.lang = 'zh-TW';
    recognition.interimResults = true;
    recognition.continuous = true;   // 連續辨識：整段話都能辨識，不因短暫停頓就中斷
    finalCount = 0;                  // 新辨識工作階段，最終結果計數歸零
    inputRef = addInput();           // 記住本工作階段的輸入框節點
    committed = inputRef ? inputRef.value : '';  // 從輸入框現有內容接續（續聽時也接得上）

    // 偵測辨識是否真的啟動（無後端的瀏覽器會靜默卡住不觸發任何事件）
    let started = false;
    const stallTimer = setTimeout(() => {
      if (!started) {
        stoppedByUser = true;
        try { recognition.stop(); } catch(e) {}
        stopListening();
        showInputError('語音辨識無法啟動，請確認已連網後重試');
      }
    }, 8000);

    recognition.onstart = () => { started = true; clearTimeout(stallTimer); resetSilenceTimer(); };

    recognition.onresult = (event) => {
      const inp = addInput();
      // 輸入框已被重繪（＝已自動存入或換頁）→ 這是遲到的舊結果，丟棄不再寫入
      if (!inp || (inputRef && inp !== inputRef)) return;
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) {
          // 只累積「新的」最終結果（i >= finalCount），避免 Chrome 重複回報同一段
          if (i >= finalCount) {
            committed = appendSegment(committed, r[0].transcript);
            finalCount = i + 1;
          }
        } else if (i >= finalCount) {
          interim += r[0].transcript;
        }
      }
      renderInput(interim);  // 直接寫進輸入框
      resetSilenceTimer();  // 有說話 → 重置斷音計時
    };

    recognition.onerror = (e) => {
      clearTimeout(stallTimer);
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        stopListening();
        showInputError(e.error === 'not-allowed'
          ? '請允許麥克風權限後再試'
          : '語音辨識失敗（' + e.error + '）');
      }
    };

    recognition.onend = () => {
      if (!stoppedByUser) {
        // 後端意外結束（如超時）→ 自動續聽
        setTimeout(startListening, 400);
      } else {
        stopListening();
      }
    };

    recognition.start();
  }

  // 委派：麥克風按鈕在輸入框旁（動態產生於 #main 內）
  document.getElementById('main').addEventListener('click', (e) => {
    const b = e.target.closest('#micBtn');
    if (!b) return;
    if (recognition && b.classList.contains('listening')) {
      stoppedByUser = true;
      recognition.stop();
      return;
    }
    if (b.classList.contains('listening')) return;
    startListening();   // 接續輸入框已打好的文字：beginRecognition 會以輸入框現值為起點
  });

  // 螢幕觸碰／輸入 → 重設自動存入計時（前賢在確認/編輯時不自動存）
  ['touchstart', 'click', 'input'].forEach(evt => {
    document.addEventListener(evt, () => {
      if (autoSaveTimer) startAutoSave();
    });
  });
}

// 語音加標點：DeepSeek（與「聲寫AI」同一套：轉繁體、加標點、不改寫內容）
// 走 kindhome.net（自己的 VPS，正式 HTTPS）→ 在家/在外面都能用，也不會跳任何授權詢問
const POLISH_API = 'https://kindhome.net/api/polish';

// 發票資料來源：VPS 每天 08:00 自動抓（/opt/pp-invoice/daily_sync.sh）
// → 由 kindhome.net 提供，帶 CORS；不可用時保留本機既有紀錄
const INVOICE_REMOTE_URL = 'https://kindhome.net/pp_invoices.json';

async function polishText(text, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms || 9000);
  try {
    const resp = await fetch(POLISH_API, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({text}),
      signal: ctl.signal
    });
    const data = await resp.json();
    if (data.ok && data.text) return data.text;
  } catch(e) {}
  finally { clearTimeout(timer); }
  return null;
}

// 本地簡易補標點（伺服器不可用時的備案）
function localPolish(text) {
  let t = text.trim();
  if (t && !/[。！？!?]$/.test(t)) t += '。';
  return t;
}

function classifyText(text) {
  const t = text;
  if (/[\d]+元|[\d]+塊|買了|付了|花了|消費|支出|收入|付款|繳費|購物|帳單|刷卡|現金|轉帳|儲值|加油|賣了|賺了|領錢|提款|費用|價格|多少錢/.test(t)) return 'expense';
  if (/記得|要做|待辦|明天|等一下|晚點|之後|提醒|別忘了|需要|必須|得去|要去|準備|處理|完成|還沒|尚未|找時間/.test(t)) return 'todo';
  if (/今天|昨天|剛剛|早上|下午|晚上|去了|做了|吃了|看到|聽到|遇到|覺得|感覺|心情|發生|終於|已經/.test(t)) return 'diary';
  if (/想法|點子|靈感|創意|設計|可以試|或許|也許|如果|想像|發想|構想|計畫|專案|新點子|有意思|有趣/.test(t)) return 'idea';
  if (t.length <= 8) return 'todo';
  if (t.length >= 30) return 'diary';
  return 'idea';
}

// 金額解析：優先「50000元/3000塊」，其次抓最後一個數字
function parseAmount(text) {
  let m = text.match(/(\d+)\s*(?:元|塊|塊錢|元整)/);
  if (m) return parseInt(m[1], 10);
  const nums = text.match(/\d+/g);
  if (nums && nums.length) return parseInt(nums[nums.length - 1], 10);
  return 0;
}

function addExpense(text, amount) {
  const store = detectStore(text);
  // 收入偵測：薪水/獎金/紅包/賣了/退款/中獎等
  const isIncome = /收入|賺了|賺到|領到|領錢|薪水|薪資|獎金|紅包|賣了|退款|退費|中獎|理賠/.test(text);
  const it = {
    id: uid(), store, item: extractItem(text, store), text, amount, date: today(),
    source: 'voice', type: isIncome ? 'income' : 'expense'
  };
  getItems('expense').unshift(it);
  return it.id;
}

// 新增目前頁面的內容（新增按鈕 + 語音自動存入共用）
// 綁定新增區（新增鈕／Enter 送出／自動長高）—— 分類頁與首頁共用
function bindAddForm() {
  const addBtn = document.getElementById('addBtn');
  const addText = document.getElementById('addText');
  if (!addBtn || !addText) return;
  addBtn.addEventListener('click', () => submitAddText());
  addText.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (currentTab === 'diary') return;            // 日記：Enter 一律換行，不送出（只用「新增」按鈕送）
    if (!e.shiftKey) { e.preventDefault(); addBtn.click(); }
  });
  addText.addEventListener('input', () => autoGrowInput(addText));
  autoGrowInput(addText);
  // 待辦：四象限選擇
  document.querySelectorAll('.quad-pick .qp').forEach(btn => {
    btn.addEventListener('click', () => {
      newQuad = Number(btn.dataset.q) || 1;
      document.querySelectorAll('.quad-pick .qp').forEach(b => b.classList.toggle('on', b === btn));
    });
  });
}

// 從文字辨識截止日（今天/明天/後天/週X/下週X/10-30 或 10/30）
function parseDue(text) {
  const t = String(text || '');
  const d = new Date();
  const fmt = x => `${x.getMonth()+1}/${x.getDate()}`;
  const add = n => { const x = new Date(d); x.setDate(x.getDate() + n); return fmt(x); };
  if (/大後天/.test(t)) return add(3);
  if (/後天/.test(t)) return add(2);
  if (/明天|明日/.test(t)) return add(1);
  if (/今天|今日/.test(t)) return fmt(d);
  const wm = t.match(/(下週|下周|下星期)([一二三四五六日天])/);
  const wdMap = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
  if (wm) {
    const want = wdMap[wm[2]];
    const x = new Date(d);
    const diff = ((want - x.getDay()) + 7) % 7 || 7;   // 下週同一星期
    x.setDate(x.getDate() + diff + 7);
    return fmt(x);
  }
  const w2 = t.match(/(本週|這週|週|周|星期)([一二三四五六日天])/);
  if (w2) {
    const want = wdMap[w2[2]];
    const x = new Date(d);
    x.setDate(x.getDate() + (((want - x.getDay()) + 7) % 7));
    return fmt(x);
  }
  const md = t.match(/(\d{1,2})[\/\-](\d{1,2})/);
  if (md) return `${Number(md[1])}/${Number(md[2])}`;
  return null;
}

// 日記隨寫隨存：邊打邊寫進同一筆，不必按「新增」
// 刪除／清除後的「復原」提示
let undoState = null, undoTimer = null;
function showUndo(msg, fn) {
  let el = document.getElementById('undoToast');
  if (!el) { el = document.createElement('div'); el.id = 'undoToast'; el.className = 'undo-toast'; document.body.appendChild(el); }
  el.innerHTML = `<span>${escHtml(msg)}</span><button type="button" id="undoBtn">復原</button>`;
  el.classList.add('on');
  clearTimeout(undoTimer);
  undoState = fn;
  const btn = document.getElementById('undoBtn');
  if (btn) btn.onclick = () => { const f = undoState; hideUndo(); if (f) f(); };
  undoTimer = setTimeout(hideUndo, 6000);
}
function hideUndo() {
  const el = document.getElementById('undoToast');
  if (el) el.classList.remove('on');
  undoState = null;
}

// 日記「新增」按鈕（輸入框外右下角）：先把目前內容存好，再收筆開新的一則
window.__ppDiaryCommit = function () {
  try {
    const ta = document.querySelector('.diary-box textarea');
    const txt = ta ? ta.value : '';
    if (String(txt || '').trim() && window.__ppDiaryUpsert) window.__ppDiaryUpsert(txt, null);
  } catch (e) {}
  if (window.__ppDiaryFinish) window.__ppDiaryFinish();
};
document.addEventListener('click', function (e) {
  const btn = e.target && e.target.closest ? e.target.closest('#diaryAddBtn') : null;
  if (btn) { e.preventDefault(); window.__ppDiaryCommit(); }
});

// 待辦／日記：編輯與刪除圖示預設隱藏，點該項目才出現（前賢 2026-10-30）
document.addEventListener('click', function (e) {
  const t = e.target;
  if (!t || !t.closest) return;
  const li = t.closest('li.todo-li, li.diary-li');
  const isAction = t.closest('.edit-btn,.del-btn,.todo-check,.q-badge,audio,video,a,button,input,textarea,select,label');
  document.querySelectorAll('li.acting').forEach(function (x) { if (x !== li) x.classList.remove('acting'); });
  if (!li) return;
  if (isAction) return;
  li.classList.toggle('acting');
});

// 輕量提示（不帶復原按鈕）
let tipTimer = null;
function tipToast(msg) {
  let el = document.getElementById('undoToast');
  if (!el) { el = document.createElement('div'); el.id = 'undoToast'; el.className = 'undo-toast'; document.body.appendChild(el); }
  el.innerHTML = `<span>${escHtml(msg)}</span>`;
  el.classList.add('on');
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => el.classList.remove('on'), 2200);
}

// 語音優先：直接觸發日記工具列既有的「聽寫」
document.addEventListener('click', function (e) {
  const t = e.target;
  if (!t || !t.closest) return;
  const rd = t.closest('.read-btn');
  if (rd) { openDiaryRead(rd.dataset.id); return; }
  const sh = t.closest('.share-btn');
  if (sh) {
    const it = getItems('diary').find(x => x.id === sh.dataset.id);
    if (!it) return;
    const title = '拾光日記 · ' + String(it.date || '').trim();
    const body = stripDiaryMarks(it.text || '').trim() || '（這一天的日記）';
    const payload = title + '\n\n' + body;
    const legacyCopy = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = payload; ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.appendChild(ta);
        ta.select(); ta.setSelectionRange(0, ta.value.length);
        const ok = document.execCommand('copy');
        ta.remove();
        tipToast(ok ? '已複製，可以貼到 LINE 了' : '複製失敗，請長按內文複製');
      } catch (e) { tipToast('複製失敗，請長按內文複製'); }
    };
    const copyIt = () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(payload).then(() => tipToast('已複製，可以貼到 LINE 了')).catch(legacyCopy);
      } else {
        legacyCopy();
      }
    };
    if (navigator.share) {
      navigator.share({ title, text: payload }).catch(copyIt);   // 分享取消或不支援 → 退回複製
    } else {
      copyIt();
    }
  }
});


// ===== 圖文混合日記（B 方案）：唯一 ID 標記 + 圖文交錯閱讀模式（2026-10-30）=====
const IMG_MARK_RE = /〔(img|vid):([A-Za-z0-9]+)〕/g;

function diaryMixedHtml(it) {
  const text = String(it.text || '');
  const imgs = Array.isArray(it.images) ? it.images : [];
  const vids = Array.isArray(it.videos) ? it.videos : [];
  const byId = {};
  imgs.forEach(m => { byId[m.id] = m; });
  const vById = {};
  vids.forEach(m => { vById[m.id] = m; });
  const used = {};
  let out = '', last = 0, m;
  IMG_MARK_RE.lastIndex = 0;
  while ((m = IMG_MARK_RE.exec(text))) {
    const seg = text.slice(last, m.index).trim();
    if (seg) out += `<p>${escHtml(seg).replace(/\n/g, '<br>')}</p>`;
    if (m[1] === 'vid') {
      if (vById[m[2]]) { out += diaryVidHtml(vById[m[2]]); used[m[2]] = 1; }
    } else if (byId[m[2]]) { out += diaryFigHtml(byId[m[2]]); used[m[2]] = 1; }
    last = m.index + m[0].length;
  }
  const tail = text.slice(last).trim();
  if (tail) out += `<p>${escHtml(tail).replace(/\n/g, '<br>')}</p>`;
  const rest = imgs.filter(x => !used[x.id]);
  if (rest.length) out += rest.map(diaryFigHtml).join('');
  const restV = vids.filter(x => !used[x.id]);
  if (restV.length) out += restV.map(diaryVidHtml).join('');
  if (!out.trim()) out = '<p class="dm-empty">這一天還沒有內容</p>';
  return out;
}

function diaryVidHtml(v) {
  const cap = String(v.caption || '').trim();
  const dur = Number(v.dur) || 0;
  return `<figure class="dm-fig dm-vfig" data-vid="${v.id}">
    <video data-vmid="${v.id}" controls playsinline preload="metadata" poster="${v.poster || ''}"></video>
    <figcaption class="dm-cap${cap ? '' : ' empty'}" data-vcap="${v.id}">${cap ? escHtml(cap) : '加一句說明…'}</figcaption>
    <div class="dm-tools">
      <button type="button" data-mv="up" data-id="${v.id}" data-kind="vid" aria-label="上移">↑</button>
      <button type="button" data-mv="down" data-id="${v.id}" data-kind="vid" aria-label="下移">↓</button>
      <button type="button" data-vcapedit="${v.id}">說明</button>
      <button type="button" data-viddel="${v.id}">刪除</button>
    </div>
  </figure>`;
}

function diaryFigHtml(m) {
  const cap = String(m.caption || '').trim();
  return `<figure class="dm-fig" data-img="${m.id}">
    <img data-mid="${m.id}" src="${m.thumb || ''}" alt="">
    <figcaption class="dm-cap${cap ? '' : ' empty'}" data-cap="${m.id}">${cap ? escHtml(cap) : '加一句說明…'}</figcaption>
    <div class="dm-tools">
      <button type="button" data-mv="up" data-id="${m.id}" aria-label="上移">↑</button>
      <button type="button" data-mv="down" data-id="${m.id}" aria-label="下移">↓</button>
      <button type="button" data-capedit="${m.id}">說明</button>
      <button type="button" data-replace="${m.id}">換圖</button>
      <button type="button" data-imgdel="${m.id}">刪除</button>
    </div>
  </figure>`;
}

function openDiaryRead(itemId) {
  const it = getItems('diary').find(x => x.id === itemId);
  if (!it) return;
  let el = document.getElementById('dcRead');
  if (!el) {
    el = document.createElement('div');
    el.id = 'dcRead';
    el.innerHTML = `<div class="dc-read-mask"></div>
      <div class="dc-read-card">
        <div class="dc-read-head"><b id="dcReadTitle">閱讀</b><span class="dc-read-close" id="dcReadClose" aria-label="關閉">✕</span></div>
        <div class="dc-read-body" id="dcReadBody"></div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('#dcReadClose').addEventListener('click', () => el.classList.remove('show'));
    el.querySelector('.dc-read-mask').addEventListener('click', () => el.classList.remove('show'));
    const body = el.querySelector('#dcReadBody');
    body.addEventListener('click', ev => {
      const t = ev.target;
      if (!t.closest) return;
      const btn = t.closest('button');
      if (btn) {
        const id = btn.dataset.id || btn.dataset.capedit || btn.dataset.replace || btn.dataset.imgdel || btn.dataset.vcapedit || btn.dataset.viddel;
        const cur = getItems('diary').find(x => x.id === body.dataset.item);
        if (!cur) return;
        const kind = btn.dataset.kind === 'vid' ? 'vid' : 'img';
        if (btn.dataset.mv) { moveDiaryMarker(cur, id, btn.dataset.mv === 'up' ? -1 : 1, kind); return; }
        if (btn.dataset.capedit) { editDiaryCaption(cur, id); return; }
        if (btn.dataset.vcapedit) { editDiaryCaption(cur, id, 'vid'); return; }
        if (btn.dataset.replace) { replaceDiaryImage(cur, id); return; }
        if (btn.dataset.imgdel) { deleteDiaryImage(cur, id); return; }
        if (btn.dataset.viddel) { deleteDiaryVideo(cur, id); return; }
        return;
      }
      const capEl = t.closest('.dm-cap');
      if (capEl && capEl.dataset.cap) {
        const cur = getItems('diary').find(x => x.id === body.dataset.item);
        if (cur) editDiaryCaption(cur, capEl.dataset.cap);
      } else if (capEl && capEl.dataset.vcap) {
        const cur = getItems('diary').find(x => x.id === body.dataset.item);
        if (cur) editDiaryCaption(cur, capEl.dataset.vcap, 'vid');
      }
    });
  }
  el.classList.add('show');
  el.querySelector('#dcReadBody').dataset.item = it.id;
  renderDiaryRead(it);
}

function renderDiaryRead(it) {
  const el = document.getElementById('dcRead');
  if (!el) return;
  el.querySelector('#dcReadTitle').textContent = String(it.date || '').trim() + (it.mood ? ' · ' + it.mood : '');
  const body = el.querySelector('#dcReadBody');
  body.innerHTML = diaryMixedHtml(it);
  body.scrollTop = 0;
  // 縮圖先頂著，再換成原圖
  body.querySelectorAll('img[data-mid]').forEach(img => {
    const id = img.dataset.mid;
    if (!window.__ppDiaryBlob) return;
    window.__ppDiaryBlob.get(id).then(b => { if (b) img.src = URL.createObjectURL(b); });
  });
  body.querySelectorAll('video[data-vmid]').forEach(v => {
    const id = v.dataset.vmid;
    if (!window.__ppDiaryBlob) return;
    window.__ppDiaryBlob.get(id).then(b => { if (b) v.src = URL.createObjectURL(b); });
  });
}

function saveDiaryItem(it) {
  const arr = getItems('diary');
  const i = arr.findIndex(x => x.id === it.id);
  if (i >= 0) arr[i] = it;
  saveData();
  if (window.__ppDiaryRerender) window.__ppDiaryRerender();
}

function moveDiaryMarker(it, id, dir, kind) {
  const mk = (kind === 'vid' ? '〔vid:' : '〔img:') + id + '〕';
  let t = String(it.text || '');
  const at = t.indexOf(mk);
  if (at < 0) { tipToast('這張圖不在文中（會排在最後）'); return; }
  if (dir < 0) {
    const before = t.slice(0, at);
    const cut = before.lastIndexOf('\n\n');
    if (cut < 0) { tipToast('已經在最前面'); return; }
    const mid = before.slice(cut + 2);
    it.text = before.slice(0, cut + 2) + mk + (mid ? '\n' + mid.replace(/^\n+/, '') : '') + t.slice(at + mk.length).replace(/^\n+/, '\n');
  } else {
    const after = t.slice(at + mk.length);
    const cut = after.indexOf('\n\n');
    if (cut < 0) { tipToast('已經在最後面'); return; }
    const first = after.slice(0, cut);
    const rest = after.slice(cut + 2);
    it.text = t.slice(0, at).replace(/\n+$/, '') + (first.trim() ? '\n' + first.trim() : '') + '\n' + mk + '\n' + rest;
  }
  saveDiaryItem(it);
  renderDiaryRead(it);
  tipToast('已調整位置');
}

function editDiaryCaption(it, id, kind) {
  const list = kind === 'vid' ? (it.videos || []) : (it.images || []);
  const im = list.find(x => x.id === id);
  if (!im) return;
  const v = window.prompt('圖片說明（留空可清除）', im.caption || '');
  if (v === null) return;
  im.caption = String(v).trim();
  saveDiaryItem(it);
  renderDiaryRead(it);
}

function deleteDiaryImage(it, id) {
  if (!window.confirm('刪除這張圖片？')) return;
  it.text = String(it.text || '').split('〔img:' + id + '〕').join('');
  it.images = (it.images || []).filter(x => x.id !== id);
  saveDiaryItem(it);
  renderDiaryRead(it);
  tipToast('已刪除');
}

function deleteDiaryVideo(it, id) {
  if (!window.confirm('刪除這段影片？')) return;
  it.text = String(it.text || '').split('〔vid:' + id + '〕').join('');
  it.videos = (it.videos || []).filter(x => x.id !== id);
  saveDiaryItem(it);
  renderDiaryRead(it);
  tipToast('已刪除影片');
}

function replaceDiaryImage(it, id) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    try {
      const readOne = (file, maxSide, q) => new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => {
          const sc = Math.min(1, maxSide / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          res({ dataUrl: c.toDataURL('image/jpeg', q), w: c.width, h: c.height });
        };
        img.onerror = rej;
        img.src = URL.createObjectURL(file);
      });
      const big = await readOne(f, 1600, 0.82);
      const sm = await readOne(f, 280, 0.6);
      if (window.__ppDiaryBlob) {
        const blob = await (await fetch(big.dataUrl)).blob();
        await window.__ppDiaryBlob.put(id, blob);
      }
      const im = (it.images || []).find(x => x.id === id);
      if (im) { im.thumb = sm.dataUrl; im.w = big.w; im.h = big.h; }
      saveDiaryItem(it);
      renderDiaryRead(it);
      tipToast('圖片已更換');
    } catch (e) { tipToast('換圖失敗'); }
  });
  inp.click();
}

// ===== 奶油日常（方案 C）：日記頁統計、心情、AI 回顧（2026-10-30）=====
function diaryStatsHtml() {
  try {
    const arr = getItems('diary');
    const photos = arr.reduce((n, i) => n + ((i.images || []).length || 0), 0);
    // 連續紀錄：用完整日期（含年份）換算，往前數連續天數
    const days = new Set();
    arr.forEach(i => { const t = diaryTs(i); if (t) days.add(diaryDayKey(t)); });
    let streak = 0;
    const d = new Date();
    for (let k = 0; k < 4000; k++) {
      if (days.has(diaryDayKey(d.getTime()))) streak++;
      else if (k > 0) break;      // 今天還沒寫不算中斷，從昨天開始數
      d.setDate(d.getDate() - 1);
    }
    return `<span><b>${arr.length}</b> 篇日記</span><i></i><span><b>${photos}</b> 張照片</span><i></i><span>連續 <b>${streak}</b> 天</span>`;
  } catch (e) { return '<span>開始寫下第一篇吧</span>'; }
}

// 心情 chips：點一下選／取消；新的一則歸零
document.addEventListener('click', function (e) {
  const t = e.target;
  if (!t || !t.closest) return;
  const m = t.closest('.dc-mood');
  if (m) {
    const v = m.dataset.mood || '';
    diaryMood = (diaryMood === v) ? '' : v;
    document.querySelectorAll('.dc-mood').forEach(b => b.classList.toggle('on', b.dataset.mood === diaryMood));
    return;
  }
  if (t.closest('#diaryAiBtn')) { openDiaryAI(); }
});

// ---- AI 回顧（DeepSeek 直連；金鑰只存在這台裝置，不進版控）----
const DS_KEY_LS = 'pp.deepseek.key';
function dsKey() { try { return localStorage.getItem(DS_KEY_LS) || ''; } catch (e) { return ''; } }

function diaryAIContext() {
  return getItems('diary').slice(0, 20).map(i => {
    const d = String(i.date || '').replace(/\s+/g, ' ');
    const mood = i.mood ? `（${i.mood}）` : '';
    const txt = String(i.text || '').replace(/\s+/g, ' ').slice(0, 200);
    return txt ? `[${d}]${mood} ${txt}` : '';
  }).filter(Boolean).join('\n');
}

function openDiaryAI() {
  let el = document.getElementById('dcAi');
  if (el) { el.classList.add('show'); return; }
  el = document.createElement('div');
  el.id = 'dcAi';
  el.className = 'dc-ai show';
  el.innerHTML = `
    <div class="dc-ai-mask"></div>
    <div class="dc-ai-card">
      <div class="dc-ai-head"><b>拾光 AI</b><span class="dc-ai-close" id="dcAiClose" aria-label="關閉">✕</span></div>
      <div class="dc-ai-chips">
        ${['回顧這個月', '這週的重點', '幫我整理成一段話'].map(s => `<button type="button" class="dc-chip" data-q="${s}">${s}</button>`).join('')}
      </div>
      <div class="dc-ai-body" id="dcAiBody"></div>
      <div class="dc-ai-in"><input id="dcAiInput" type="text" placeholder="問問你的日記…"><button type="button" id="dcAiGo">送出</button></div>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('#dcAiClose').addEventListener('click', () => el.classList.remove('show'));
  el.querySelector('.dc-ai-mask').addEventListener('click', () => el.classList.remove('show'));
  el.querySelector('#dcAiGo').addEventListener('click', () => {
    const inp = el.querySelector('#dcAiInput');
    const q = String(inp.value || '').trim();
    if (q) { inp.value = ''; diaryAIAsk(q); }
  });
  el.querySelector('#dcAiInput').addEventListener('keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); el.querySelector('#dcAiGo').click(); }
  });
  el.querySelectorAll('.dc-chip').forEach(b => b.addEventListener('click', () => diaryAIAsk(b.dataset.q)));
  if (!dsKey()) diaryAIKeyPrompt();
}

function dcAiAdd(who, html) {
  const body = document.getElementById('dcAiBody');
  if (!body) return null;
  const d = document.createElement('div');
  d.className = 'dc-ai-msg ' + who;
  d.innerHTML = html;
  body.appendChild(d);
  body.scrollTop = body.scrollHeight;
  return d;
}

function diaryAIKeyPrompt() {
  dcAiAdd('ai', '要開始回顧，需要先貼上 DeepSeek 的 API key。<br><span class="dc-hint">金鑰只存在這台裝置（localStorage），不會上傳、也不會進版本控制。</span>');
  const body = document.getElementById('dcAiBody');
  const box = document.createElement('div');
  box.className = 'dc-ai-keybox';
  box.innerHTML = '<input id="dcKeyIn" type="password" placeholder="sk-..."><button type="button" id="dcKeySave">儲存</button>';
  body.appendChild(box);
  box.querySelector('#dcKeySave').addEventListener('click', () => {
    const v = String(box.querySelector('#dcKeyIn').value || '').trim();
    if (!v) return;
    try { localStorage.setItem(DS_KEY_LS, v); } catch (e) {}
    box.remove();
    dcAiAdd('ai', '金鑰已存在這台裝置。可以開始問了。');
  });
}

async function diaryAIAsk(q) {
  dcAiAdd('user', escHtml(q));
  const key = dsKey();
  if (!key) { diaryAIKeyPrompt(); return; }
  const pending = dcAiAdd('ai', '<span class="dc-wait">整理日記中…</span>');
  const ctx = diaryAIContext();
  try {
    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.6,
        max_tokens: 700,
        messages: [
          { role: 'system', content: '你是「拾光日記」的 AI 助理，用繁體中文、溫暖但不浮誇的語氣回覆。只根據使用者提供的日記內容整理，不要編造沒發生的事。若有引用，請標出日期（例如 10/29）。回覆 120 字以內為原則。' },
          { role: 'user', content: `以下是我最近的日記：\n${ctx || '（目前沒有日記內容）'}\n\n我的問題：${q}` }
        ]
      })
    });
    const data = await r.json();
    const text = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    if (!r.ok || !text) {
      const msg = (data && data.error && data.error.message) || ('HTTP ' + r.status);
      if (pending) pending.innerHTML = '讀取失敗：' + escHtml(String(msg).slice(0, 120));
      return;
    }
    const used = getItems('diary').slice(0, 3).map(i => String(i.date || '').slice(0, 5)).filter(Boolean);
    if (pending) pending.innerHTML = escHtml(text).replace(/\n/g, '<br>') + (used.length ? `<div class="dc-cite">參考：${used.join(' · ')}</div>` : '');
  } catch (e) {
    if (pending) pending.innerHTML = '連線失敗：' + escHtml(String(e.message || e));
  }
}

// 日記列表只顯示摘要（前賢 2026-10-30：不用全顯示）
function stripDiaryMarks(text) {
  return String(text || '').replace(/〔(?:img|vid):[A-Za-z0-9]+〕/g, '');
}

function diarySummary(text, it) {
  const t = stripDiaryMarks(text).replace(/\s+/g, ' ').trim();
  const media = [];
  if ((it && (it.images || []).length)) media.push('照片' + it.images.length);
  if ((it && (it.videos || []).length)) media.push('影片' + it.videos.length);
  if (it && it.audio) media.push('錄音');
  if (it && it.sketch) media.push('手寫');
  let s = t.length > 60 ? t.slice(0, 60) + '…' : t;
  if (media.length) s = (s ? s + ' ' : '') + '（' + media.join('・') + '）';
  return s || '（空白）';
}


// ===== 日記列表：卡片、月份分組、搜尋、心情篩選（2026-10-30 吸收他版優點）=====
// 時間戳：新日記有 ts；舊日記由 id（內含建立時間）或 M/D 日期推算年份，不改動原資料
function diaryTs(it) {
  if (!it) return 0;
  if (it.ts) return Number(it.ts) || 0;
  const now = Date.now();
  const s = String(it.date || '');
  const m = s.match(/(\d{1,2})\s*[\/月\-]\s*(\d{1,2})/);
  const tm = s.match(/(\d{1,2}):(\d{2})/);
  let idTs = 0;
  const id = String(it.id || '');
  if (/^[0-9a-z]{10,}$/.test(id)) {
    const v = parseInt(id.slice(0, -4), 36);
    if (v > 1577836800000 && v <= now + 86400000) idTs = v;
  }
  if (idTs) {
    if (!m) return idTs;
    const d0 = new Date(idTs);
    if (d0.getMonth() + 1 === +m[1] && d0.getDate() === +m[2]) return idTs;
  }
  if (m) {
    const y = new Date().getFullYear();
    const hh = tm ? +tm[1] : 0, mi = tm ? +tm[2] : 0;
    let t = new Date(y, +m[1] - 1, +m[2], hh, mi).getTime();
    if (t > now + 86400000) t = new Date(y - 1, +m[1] - 1, +m[2], hh, mi).getTime();
    return t;
  }
  return idTs || 0;
}

function diaryDayKey(t) {
  const d = new Date(t);
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

function diaryPreview(it) {
  return stripDiaryMarks(stripDiaryDate(it.text)).replace(/\s+/g, ' ').trim();
}

function diaryCardHtml(it) {
  const ts = diaryTs(it);
  const d = ts ? new Date(ts) : null;
  const WD = ['日', '一', '二', '三', '四', '五', '六'];
  const tm = String(it.date || '').match(/(\d{1,2}:\d{2})/);
  const mood = (it.mood && DIARY_MOOD_EMOJI[it.mood]) ? it.mood : '';
  const nImg = (it.images || []).length;
  const tags = [];
  if (nImg) tags.push('📷' + nImg);
  if ((it.videos || []).length) tags.push('🎬' + it.videos.length);
  if (it.audio) tags.push('🎙');
  if (it.sketch) tags.push('✍️');
  if ((it.rows || []).length) tags.push('🧾');
  const thumb = (it.images && it.images[0] && it.images[0].thumb) || (it.sketch && it.sketch.thumb) || '';
  const prev = diaryPreview(it);
  return `
    <li class="diary-li dcard" data-id="${it.id}" data-diary-bg="${it.bg || ''}" style="${window.DiaryUI ? window.DiaryUI.bgStyle(it) : ''}">
      <div class="dcard-date"><b>${d ? d.getDate() : '•'}</b><span>${d ? '週' + WD[d.getDay()] : ''}</span></div>
      <div class="dcard-main">
        <div class="dcard-meta">
          ${tm ? `<span class="dcard-time">${tm[1]}</span>` : ''}
          ${mood ? `<span class="dcard-mood m-${DIARY_MOOD_CLS[mood]}">${DIARY_MOOD_EMOJI[mood]} ${mood}</span>` : ''}
          ${tags.length ? `<span class="dcard-tags">${tags.join(' ')}</span>` : ''}
          <button type="button" class="dcard-more" aria-label="更多操作">⋯</button>
        </div>
        <div class="dcard-text${prev ? '' : ' is-empty'}">${prev ? escHtml(prev) : '（沒有文字）'}</div>
      </div>
      ${thumb ? `<div class="dcard-thumb"><img src="${thumb}" alt="">${nImg > 1 ? `<i>+${nImg - 1}</i>` : ''}</div>` : ''}
      <div class="dcard-acts">
        <button type="button" class="dact read-btn" data-id="${it.id}" aria-label="閱讀">${ico('eye', 17)}</button>
        <button type="button" class="dact share-btn" data-id="${it.id}" aria-label="分享">${ico('share', 17)}</button>
        <button type="button" class="dact dact-edit" data-id="${it.id}" aria-label="編輯">${ico('edit', 17)}</button>
        <button type="button" class="dact dact-del" data-id="${it.id}" aria-label="刪除">${ico('trash', 17)}</button>
      </div>
    </li>`;
}

function diaryToolbarHtml() {
  const chips = [['', '全部']].concat(DIARY_MOODS.map(m => [m, DIARY_MOOD_EMOJI[m] + ' ' + m]));
  const q = escHtml(diaryQuery).replace(/"/g, '&quot;');
  return `<div class="dsearch">
    <label class="dsearch-box">${ico('search', 16)}<input id="diarySearch" type="search" placeholder="搜尋日記…" value="${q}" autocomplete="off" enterkeyhint="search"></label>
    <div class="dfilters">${chips.map(c => `<button type="button" class="dfilter${diaryMoodFilter === c[0] ? ' on' : ''}" data-mf="${c[0]}">${c[1]}</button>`).join('')}</div>
  </div>`;
}

function diaryCardsHtml(items) {
  const q = diaryQuery.trim().toLowerCase();
  let arr = items.slice();
  if (diaryMoodFilter) arr = arr.filter(it => it.mood === diaryMoodFilter);
  if (q) {
    arr = arr.filter(it => {
      const caps = (it.images || []).map(m => m.caption || '').join(' ');
      return (diaryPreview(it) + ' ' + (it.date || '') + ' ' + (it.mood || '') + ' ' + caps).toLowerCase().includes(q);
    });
  }
  if (!arr.length) return `<div class="card empty">${(q || diaryMoodFilter) ? '找不到符合的日記' : '尚無內容'}</div>`;
  arr.sort((x, y) => diaryTs(y) - diaryTs(x));
  const groups = [];
  const byKey = {};
  arr.forEach(it => {
    const ts = diaryTs(it);
    const d = ts ? new Date(ts) : null;
    const key = d ? d.getFullYear() + '-' + (d.getMonth() + 1) : 'none';
    if (!byKey[key]) {
      byKey[key] = { key, label: d ? `${d.getFullYear()} 年 ${d.getMonth() + 1} 月` : '未標日期', list: [] };
      groups.push(byKey[key]);
    }
    byKey[key].list.push(it);
  });
  return groups.map(g => {
    const closed = !q && !diaryMoodFilter && diaryClosedMonths.has(g.key);
    return `<div class="dmon-head" data-mon="${g.key}"><span>${g.label}</span><span class="n">${g.list.length} 篇</span><span class="caret">${closed ? '▸' : '▾'}</span></div>`
      + (closed ? '' : g.list.map(diaryCardHtml).join(''));
  }).join('');
}

function diaryRefreshCards() {
  const box = document.getElementById('diaryCards');
  if (!box) return;
  box.innerHTML = diaryCardsHtml(getItems('diary').filter(it => !pendingIds.has(it.id)));
}

function diaryDeleteById(id) {
  const hit = findItemById(id);
  if (!hit) return;
  const removed = hit.arr.splice(hit.idx, 1)[0];
  pendingIds.delete(id);
  saveData();
  renderMain();
  showUndo(`已刪除「${String((removed && stripDiaryMarks(removed.text)) || '').slice(0, 10)}」`, () => {
    hit.arr.splice(Math.min(hit.idx, hit.arr.length), 0, removed);
    saveData();
    renderMain();
  });
}

document.addEventListener('input', function (e) {
  if (e.target && e.target.id === 'diarySearch') { diaryQuery = e.target.value; diaryRefreshCards(); }
});
document.addEventListener('click', function (e) {
  const t = e.target;
  if (!t || !t.closest) return;
  const mf = t.closest('.dfilter');
  if (mf) {
    diaryMoodFilter = mf.dataset.mf || '';
    document.querySelectorAll('.dfilter').forEach(b => b.classList.toggle('on', (b.dataset.mf || '') === diaryMoodFilter));
    diaryRefreshCards();
    return;
  }
  const mh = t.closest('.dmon-head');
  if (mh) {
    const k = mh.dataset.mon;
    if (diaryClosedMonths.has(k)) diaryClosedMonths.delete(k); else diaryClosedMonths.add(k);
    diaryRefreshCards();
    return;
  }
  const more = t.closest('.dcard-more');
  if (more) { const li = more.closest('li'); if (li) li.classList.toggle('acting'); return; }
  const ed = t.closest('.dact-edit');
  if (ed) { doEditItem(ed.dataset.id); return; }
  const del = t.closest('.dact-del');
  if (del) { diaryDeleteById(del.dataset.id); return; }
});

// 日記「寫完了，換下一則」：收好這一筆，清空輸入框開新的一筆
window.__ppDiaryFinish = function () {
  try {
    const arr = getItems('diary');
    const it = arr.find(x => x.id === diaryCurId);
    if (it) {
      const hasContent = String(it.text || '').trim() || (it.images || []).length || it.audio || it.sketch || (it.rows || []).length;
      if (!hasContent) { const i = arr.indexOf(it); if (i >= 0) arr.splice(i, 1); }
      saveData();
    }
    diaryCurId = null;
    try { localStorage.removeItem('diary.currentId'); } catch (e) {}
    if (window.DiaryUI) window.DiaryUI.clearDraft();
    renderMain();
    const ta = document.getElementById('addText');
    if (ta) { ta.focus(); ta.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  } catch (e) {}
};

// 播放器載入後回寫真實長度（瀏覽器解出的秒數比錄音計時準）
window.__ppAudioFix = function (audioId, sec) {
  try {
    if (!audioId || !isFinite(sec) || sec <= 0) return;
    const arr = getItems('diary');
    const it = arr.find(x => x.audio && x.audio.id === audioId);
    if (!it) return;
    const real = Math.max(1, Math.round(sec));
    if (Math.abs((it.audio.dur || 0) - real) >= 1) { it.audio.dur = real; saveData(); }
  } catch (e) {}
};

window.__ppDiaryRerender = function () { try { renderMain(); } catch (e) {} };

window.__ppDiaryUpsert = function (text, extras) {
  try {
    const arr = getItems('diary');
    const hasExtras = !!(extras && ((extras.images || []).length || extras.audio || extras.sketch || (extras.rows || []).length));
    const empty = !String(text || '').trim() && !hasExtras;
    let it = diaryCurId ? arr.find(x => x.id === diaryCurId) : null;
    if (empty) {
      // 有內容 → 這一筆完成保留；完全空白 → 收掉不留垃圾
      if (it) {
        const hasContent = String(it.text || '').trim() || (it.images || []).length || it.audio || it.sketch || (it.rows || []).length;
        if (!hasContent) { const i = arr.indexOf(it); if (i >= 0) arr.splice(i, 1); }
        saveData();
      }
      diaryCurId = null;
      try { localStorage.removeItem('diary.currentId'); } catch (e) {}
      return;
    }
    if (!it) {
      it = { id: uid(), text: '', date: nowStamp(), ts: Date.now(), source: 'manual', completed: false };
      arr.unshift(it);
      diaryCurId = it.id;
      try { localStorage.setItem('diary.currentId', diaryCurId); } catch (e) {}
    }
    it.text = String(text || '');
    if (diaryMood) it.mood = diaryMood; else delete it.mood;
    if (extras) {
      it.images = extras.images || [];
      it.videos = extras.videos || [];
      it.audio = extras.audio || null;
      it.sketch = extras.sketch || null;
      it.rows = extras.rows || [];
      it.bg = extras.bg || '';
      it.size = extras.size || '';
    }
    saveData();
  } catch (e) {}
};

function submitAddText() {
  clearAutoSave();
  const addText = document.getElementById('addText');
  if (!addText) return;
  const text = addTextValue(addText).trim();
  if (!text) return;
  const cat = appData.categories.find(c => c.id === currentTab) || appData.categories[0];
  if (!cat) return;
  const isExpense = cat.id === 'expense';
  let newId;
  if (isExpense) {
    newId = addExpense(text, parseAmount(text));
  } else {
    newId = uid();
    const item = {id: newId, text, date: cat.id === 'diary' ? nowStamp() : today(), source: 'manual', completed: false};
    if (cat.id === 'diary') item.ts = Date.now();
    if (cat.id === 'todo') { item.q = newQuad; const d = parseDue(text); if (d) item.due = d; }
    // 日記附件（照片／錄音／手寫／背景／明細）＋清掉自動草稿
    if (cat.id === 'diary' && window.DiaryUI) {
      if (window.DiaryUI.hasDraft()) Object.assign(item, window.DiaryUI.takeDraft());
      else window.DiaryUI.clearDraft();
    }
    getItems(cat.id).unshift(item);
  }
  // 先顯示在輸入框下方的「剛新增」區，重新整理後才歸位
  if (newId) pendingIds.add(newId);
  saveData();
  renderMain();
}

// 從語音/輸入文字判斷商店
function detectStore(text) {
  // 「在全家買了...」「在X消費/花了」
  const m = text.match(/在([\u4e00-\u9fffA-Za-z0-9]{2,8}?)(買|消費|花了|付了|購物|加油)/);
  if (m) return m[1];
  // 開頭是常見商店名
  const stores = ['全家','7-11','7-11','萊爾富','全聯','家樂福','大潤發','好市多','costco',
    '小北','寶雅','康是美','屈臣氏','光南','中油','台糖','統一超商','ok便利','ok超商',
    '美廉社','愛買','全買','楓康','頂好','松青','全國家電','全國加油站','台灣中油','台塑'];
  for (const s of stores) {
    if (text.startsWith(s)) return s;
  }
  // 「X店」「X超市」「X賣場」結尾
  const m2 = text.match(/([\u4e00-\u9fff]{2,6}?(?:店|超市|賣場|百貨))/);
  if (m2) return m2[1];
  return '手動';
}

// 從語音/輸入文字擷取品項（「買蘋果」→「蘋果」）
function extractItem(text, store) {
  let t = text.replace(/\d+\s*元/g, '').trim();
  // 在X買了Y / 在X買Y
  const m = t.match(/在[\u4e00-\u9fffA-Za-z0-9]{2,8}?買(?:了)?([\u4e00-\u9fffA-Za-z0-9]+)/);
  if (m) return m[1];
  // 買了Y / 買Y / 花了Y / 付了Y / 消費Y
  const m2 = t.match(/(?:買了|買|花了|花|消費|付了|付)([\u4e00-\u9fffA-Za-z0-9]+)/);
  if (m2) return m2[1];
  return t || (store !== '手動' ? '' : '手動');
}

// === 收支分類（食/衣/住/行/道場/其他）===
const EXPENSE_CATS = ['食', '衣', '住', '行', '道場', '其他'];

// 分類配色（餅狀圖圖例用）
const CAT_COLORS = { '食': '#f59e0b', '衣': '#8b5cf6', '住': '#10b981', '行': '#3b82f6', '道場': '#ef4444', '其他': '#9ca3af' };

// 最近消費顯示的品項名：發票優先取第一項明細，一般項目用手打的文字
function recentItemLabel(it) {
  if (it && Array.isArray(it.items) && it.items.length && it.items[0].name) return it.items[0].name;
  return (it && it.text) ? it.text : '(無品項)';
}

function expenseCat(store, text) {
  const s = (store + ' ' + (text || '')).toLowerCase();
  // 道場（優先）
  if (/道場|佛堂|法會|辦道|供品|香燭|點傳|前賢|道親|發一|崇德(?!發)|素食餐廳|素菜館/.test(s)) return '道場';
  // 行
  if (/中油|加油站|加油|汽油|柴油|捷運|高鐵|台鐵|客運|公車|計程車|小黃|停車|機車|汽車|油錢|悠遊卡|過路費|高鐵票|車票/.test(s)) return '行';
  // 住
  if (/房租|水電|電費|水費|瓦斯|第四台|網路費|家具|家電|修繕|裝潢|管理費|房屋|寢具|床墊/.test(s)) return '住';
  // 衣
  if (/衣服|上衣|褲子|鞋子|襪子|帽子|外套|飾品|配件|包包|皮包|皮帶|百貨/.test(s)) return '衣';
  // 食
  if (/全家|萊爾富|7-11|711|全聯|便利|超市|餐廳|便當|飲料|咖啡|早餐|午餐|晚餐|小吃|麵包|飯|菜|水果|肉|蛋|牛奶|豆漿|點心|夜市|鹹酥|速食|麥當勞|肯德基|披薩|餐飲|食堂|崇德發/.test(s)) return '食';
  return '其他';
}

// 日期輔助：date 可能是 "8/9" 或 "08/07"
function monthOf(d) {
  const m = parseInt(String(d).split('/')[0]);
  return isNaN(m) ? 0 : m;
}
function dayOf(d) {
  const parts = String(d).split('/');
  return parts.length > 1 ? parseInt(parts[1]) : 0;
}

// 收支月份切換
function shiftExpenseMonth(delta) {
  if (!expenseView.month) {
    const now = new Date();
    expenseView.year = now.getFullYear();
    expenseView.month = now.getMonth() + 1;
  }
  let m = expenseView.month + delta;
  let y = expenseView.year;
  if (m < 1) { m = 12; y -= 1; }
  if (m > 12) { m = 1; y += 1; }
  expenseView.month = m;
  expenseView.year = y;
  renderMain();
}
function resetExpenseMonth() {
  const now = new Date();
  expenseView.year = now.getFullYear();
  expenseView.month = now.getMonth() + 1;
  renderMain();
}

// 分類明細 toggle（每個分類下方，顯示/隱藏該分類明細）
function toggleCatDetail(btn) {
  const list = btn.nextElementSibling;
  if (!list) return;
  const shown = list.classList.toggle('show');
  btn.classList.toggle('open', shown);
  // 記住展開狀態：重新渲染（刪除/編輯/換月）後要維持展開，不要又收起來
  const cat = btn.dataset.cat;
  if (cat) { if (shown) openCats.add(cat); else openCats.delete(cat); }
}

// 每日花費曲線圖（SVG 直條圖）
function renderDailyChart(monthItems, maxDay) {
  const daily = new Array(maxDay + 1).fill(0);
  for (const it of monthItems) {
    const d = dayOf(it.date);
    if (d >= 1 && d <= maxDay) daily[d] += (it.amount || 0);
  }
  const max = Math.max(...daily.slice(1), 1);
  const W = 350, H = 130, pad = 6;
  const barW = (W - pad * 2) / maxDay;
  let bars = '';
  for (let d = 1; d <= maxDay; d++) {
    const h = Math.max(3, (daily[d] / max) * (H - 34));
    const x = pad + (d - 1) * barW;
    const y = H - 18 - h;
    bars += `<rect x="${x}" y="${y}" width="${Math.max(barW - 2, 1)}" height="${h}" rx="2" fill="${daily[d] ? '#f59e0b' : '#f0e0cc'}">
      <title>${d}日：NT$${daily[d].toLocaleString()}</title></rect>`;
    // 每天標日期（置中於該格；每5天+頭尾加粗加深）
    const tx = x + (barW - 2) / 2;
    const isKey = d === 1 || d === maxDay || d % 5 === 0;
    bars += `<text x="${tx}" y="${H - 5}" font-size="${isKey ? 9 : 7}" font-weight="${isKey ? 700 : 400}" fill="${isKey ? '#8b7355' : '#c9b89e'}" text-anchor="middle">${d}</text>`;
  }
  // 最大值標示
  if (max > 1) {
    bars += `<text x="${W - 8}" y="12" font-size="9" fill="#d97706" text-anchor="end">NT$${max.toLocaleString()}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" preserveAspectRatio="xMidYMid meet">${bars}</svg>`;
}

// 食衣住行等分類比例餅狀圖（SVG）
function renderPieChart(catSum) {
  const cats = EXPENSE_CATS.filter(c => (catSum[c] || 0) > 0);
  const total = cats.reduce((s, c) => s + catSum[c], 0);
  if (total <= 0) return '<div class="pie-empty">本月尚無支出</div>';
  const cx = 55, cy = 55, r = 50;
  let slices = '';
  if (cats.length === 1) {
    const c = cats[0];
    slices = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${CAT_COLORS[c]}" stroke="#fff" stroke-width="1.5"><title>${c} NT$${catSum[c].toLocaleString()}（100%）</title></circle>`;
  } else {
    let angle = -Math.PI / 2;
    for (const c of cats) {
      const v = catSum[c];
      const sweep = (v / total) * 2 * Math.PI;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(angle + sweep);
      const y2 = cy + r * Math.sin(angle + sweep);
      const largeArc = sweep > Math.PI ? 1 : 0;
      slices += `<path d="M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${CAT_COLORS[c]}" stroke="#fff" stroke-width="1.5"><title>${c} NT$${v.toLocaleString()}（${Math.round(v/total*100)}%）</title></path>`;
      angle += sweep;
    }
  }
  const legend = cats.map(c => {
    const v = catSum[c];
    return `<span class="pie-legend-item"><i style="background:${CAT_COLORS[c]}"></i>${c} ${Math.round(v/total*100)}%</span>`;
  }).join('');
  return `<div class="pie-wrap">
    <svg class="pie-svg" viewBox="0 0 110 110">${slices}</svg>
    <div class="pie-legend">${legend}</div>
  </div>`;
}

// === 渲染 ===
function renderAll() {
  renderNav();
  if (homeOpen) {
    renderHome();
  } else if (dashboardOpen) {
    // 舊版 iframe 儀表板：自行處理顯示
  } else if (currentTab === 'habits' && window.Habits) {
    document.getElementById('main').style.display = '';
    window.Habits.onOldDashboard(showDashboard);   // 模組內「舊版儀表板」按鈕
    window.Habits.render(document.getElementById('main'));
  } else if (!dashboardOpen) {
    renderMain();
  }
  saveNav();
}

// 首頁：整合五項目重點摘要（收支/待辦/日記/靈感/養成好習慣）
// === 養成好習慣（daily-dashboard）每日數字 ===
// 兩支 app 同網域(richfly2u.github.io) → 共用 localStorage 的 dashboard_key（板名）
// 直接讀 Firestore（公開讀取），數字算法與儀表板完全一致
const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/bentodish-alan/databases/(default)/documents/dashboard/';
const FIRESTORE_KEY = 'AIzaSyCRazQsleeTILp7VO5zYbeiy9dtOxrVenc';
let habitCache = { t: 0, data: null };
let habitAuthChecked = false;

// 習慣資料現在要登入才讀得到（Firestore 規則限制本人 uid，2026-09-26 前賢要求改用登入）
function habitAuth() {
  if (typeof firebase === 'undefined' || !firebase.auth) return null;
  if (habitAuth._a) return habitAuth._a;
  try {
    let fapp;
    try { fapp = firebase.app(); }              // 用預設 app 名稱 → 與養成好習慣儀表板共用同一組登入（同網域）
    catch (e) {
      fapp = firebase.initializeApp({ apiKey: FIRESTORE_KEY, authDomain: 'bentodish-alan.firebaseapp.com', projectId: 'bentodish-alan' });
    }
    habitAuth._a = firebase.auth(fapp);
  } catch (e) { return null; }
  return habitAuth._a;
}

async function signInHabitStats() {
  const a = habitAuth();
  if (!a) { alert('登入元件沒載入（連上網路後重開即可）'); return; }
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await a.signInWithPopup(provider);
  } catch (e) {
    const c = (e && e.code) || String(e);
    const fb = ['auth/popup-blocked', 'auth/popup-closed-by-user', 'auth/cancelled-popup-request',
      'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'];
    if (fb.includes(c)) {
      try { await a.signInWithRedirect(provider); return; } catch (e2) { alert('登入失敗：' + ((e2 && e2.code) || e2)); return; }
    }
    alert('登入失敗：' + c + '\n（請用 alansnoopy@gmail.com 登入）');
    return;
  }
  habitAuthChecked = true;
  habitCache = { t: 0, data: null };
  refreshHabitStats();
}

async function fetchHabitStats() {
  if (habitCache.data && Date.now() - habitCache.t < 60000) return habitCache.data;
  const a = habitAuth();
  if (!a) return { unavailable: true };
  if (!habitAuthChecked) {
    // 等 SDK 還原上次登入狀態（最多 3 秒），才不會每次開首頁都要手動登入
    await new Promise(res => {
      let settled = false;
      const done = () => { if (!settled) { settled = true; res(); } };
      a.onAuthStateChanged(() => done());
      setTimeout(done, 3000);
    });
    habitAuthChecked = true;
  }
  if (!a.currentUser) return { needLogin: true };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    let board = 'alan';
    try { board = localStorage.getItem('dashboard_key') || 'alan'; } catch (e) {}
    const tok = await a.currentUser.getIdToken();
    const resp = await fetch(`${FIRESTORE_BASE}${encodeURIComponent(board)}`, {
      headers: { Authorization: 'Bearer ' + tok },
      signal: ctl.signal
    });
    if (resp.status === 401 || resp.status === 403) { habitAuthChecked = false; return { needLogin: true }; }
    if (!resp.ok) return null;
    const doc = await resp.json();
    const fields = doc.fields || {};
    const dayKey = new Date().toISOString().slice(0, 10);   // 與儀表板一致：UTC 日期
    const grab = v => (v && v.arrayValue && v.arrayValue.values) ? v.arrayValue.values : [];
    const dayField = fields[dayKey] && fields[dayKey].mapValue && fields[dayKey].mapValue.fields;
    const dayItems = dayField ? grab(dayField.items) : [];
    const items = dayItems.length ? dayItems : grab(fields._itemsTemplate);
    const total = items.length;
    let done = 0;
    for (const it of items) {
      const f = it.mapValue && it.mapValue.fields;
      if (f && f.done && f.done.booleanValue) done++;
    }
    const data = { total, done, rate: total ? Math.round(done / total * 100) : 0 };
    habitCache = { t: Date.now(), data };
    return data;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// 本機習慣摘要（原生模組）；沒有本機習慣才退回舊雲端儀表板數字
function homeHabitHtml() {
  if (!window.Habits) return '<div class="home-line">讀取中…</div>';
  const s = window.Habits.summary();
  if (!s.habits) return '<div class="home-line">尚未建立習慣，點一下開始</div>';
  return `<div class="habit-row"><span>今天完成</span><b>${s.done} / ${s.total}</b></div>
       <div class="habit-row"><span>今日進度</span><b>${s.rate}%</b></div>`;
}

async function refreshHabitStats() {
  if (!document.getElementById('habitStats')) return;
  if (window.Habits && window.Habits.summary().habits > 0) return;   // 有本機習慣就不打 Firestore
  const d = await fetchHabitStats();
  const box = document.getElementById('habitStats');   // 重取：非同步期間畫面可能已重繪
  if (!box) return;
  if (!d || d.unavailable) {
    box.innerHTML = `<div class="home-line">暫時讀不到，點一下進入</div>`;
    return;
  }
  if (d.needLogin) {
    box.innerHTML = `<button class="habit-login-btn" id="habitLoginBtn">🔑 點一下用 Google 登入，顯示習慣數字</button>`;
    const b = document.getElementById('habitLoginBtn');
    if (b) b.addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault(); signInHabitStats(); });
    return;
  }
  box.innerHTML = `<div class="habit-row"><span>總項目</span><b>${d.total} 項</b></div>
       <div class="habit-row"><span>已完成</span><b>${d.done}</b></div>
       <div class="habit-row"><span>今日進度</span><b>${d.rate}%</b></div>`;
}

function renderHome() {
  const main = document.getElementById('main');
  const now = new Date();
  const vMonth = now.getMonth() + 1;

  // 收支本月摘要
  const expAll = getItems('expense');
  const monthItems = expAll.filter(it => monthOf(it.date) === vMonth);
  const expList = monthItems.filter(it => (it.type || 'expense') !== 'income');
  const incList = monthItems.filter(it => (it.type || 'expense') === 'income');
  const expTotal = MONTHLY_HOUSING + expList.reduce((s, e) => s + (e.amount || 0), 0);
  const incTotal = MONTHLY_INCOME + incList.reduce((s, e) => s + (e.amount || 0), 0);
  const balance = incTotal - expTotal;

  // 支出分類統計（含住固定）→ 餅狀圖用
  const catSum = { '住': MONTHLY_HOUSING };
  for (const it of expList) {
    const c = it.cat || expenseCat(it.store, it.text);
    catSum[c] = (catSum[c] || 0) + (it.amount || 0);
  }

  // 待辦（未完成前三項）
  const todos = getItems('todo');
  const pendingTodos = todos.filter(t => !t.completed);
  const topTodos = pendingTodos.slice(0, 3);

  // 日記（最近兩篇）
  const diaries = getItems('diary');
  const topDiaries = [...diaries].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 2);

  // 靈感（最近一則）
  const ideas = getItems('idea');
  const lastIdea = ideas.length ? [...ideas].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] : null;

  main.innerHTML = `
    <section class="tab-content active">
      <div class="home-top">
        <h2>${ico('home', 20)} 榮哥動起來 <small style="font-size:.65rem;color:var(--text2);font-weight:400">v${APP_VERSION}</small></h2>
        <button class="home-search utility-link" type="button" onclick="openGlobalSearch()" title="搜尋">${ico('search', 14)} 搜尋</button>
      </div>
      <div class="home-links">
          <button class="home-link utility-link" type="button" onclick="exportBackup()">${ico('download', 14)} 備份</button>
          <button class="home-link utility-link" type="button" onclick="importBackup()">${ico('upload', 14)} 還原</button>
          <a class="home-link" href="https://kindhome.net/bentotable/" target="_blank" rel="noopener">${ico('bento', 14)} 便當組合</a>
          <a class="home-link" href="https://kindhome.herokuapp.com/" target="_blank" rel="noopener">${ico('building', 14)} 凱鴻</a>
          <a class="home-link" href="https://kindhome.herokuapp.com/" target="_blank" rel="noopener">${ico('temple', 14)} 凱德</a>
      </div>
      <div class="home-grid">
        <div class="home-card home-card-expense" onclick="goTab('expense')">
          <div class="home-card-title"><span>${ico('money', 17)} ${vMonth}月收支</span><span class="home-today">今日日期 ${vMonth}月${now.getDate()}日</span></div>
          <div class="home-sum-row">
            <div class="home-sum"><span class="home-sum-label">收入</span><b>NT$${incTotal.toLocaleString()}</b></div>
            <div class="home-sum"><span class="home-sum-label">支出</span><b>NT$${expTotal.toLocaleString()}</b></div>
            <div class="home-sum"><span class="home-sum-label">結餘</span><b class="${balance >= 0 ? 'home-pos' : 'home-neg'}">${balance < 0 ? '-' : ''}NT$${Math.abs(balance).toLocaleString()}</b></div>
          </div>
          <div class="home-sec-title">${ico('utensils', 14)} 食衣住行比例</div>
          ${renderPieChart(catSum)}
        </div>
        <div class="home-card" onclick="goTab('todo')">
          <div class="home-card-title">${ico('check', 17)} 待辦</div>
          ${topTodos.length
            ? topTodos.map(t => `<div class="home-line"><span class="todo-marker">▸</span>${escHtml((t.text || '').slice(0, 16))}</div>`).join('')
              + (pendingTodos.length > 3 ? `<div class="home-line home-line-more">另有 ${pendingTodos.length - 3} 筆未完成</div>` : '')
            : '<div class="home-line">全部完成</div>'}
        </div>
        <div class="home-card" onclick="goTab('diary')">
          <div class="home-card-title">${ico('calendar', 17)} 日記</div>
          ${topDiaries.length
            ? topDiaries.map(d => {
                const day = String(d.date || '').split(' ')[0];   // 只取日期，不顯示時間
                return `<div class="home-line"><span class="home-date">${day}</span>${escHtml((d.text || '').slice(0, 14))}</div>`;
              }).join('')
            : '<div class="home-line">尚無日記</div>'}
        </div>
        <div class="home-card" onclick="goTab('idea')">
          <div class="home-card-title">${ico('bulb', 17)} 靈感</div>
          <div class="home-line">${lastIdea ? escHtml((lastIdea.text || '').slice(0, 14)) : '尚無靈感'}</div>
        </div>
        <div class="home-card" onclick="goTab('habits')">
          <div class="home-card-title">${ico('chart', 17)} 習慣</div>
          <div id="habitStats">${homeHabitHtml()}</div>
        </div>
      </div>
    </section>`;
  refreshHabitStats();   // 非同步補上養成好習慣的三個數字
}

// 首頁點卡片 → 跳到對應分類
function goTab(tabId) {
  // 切換到日記頁 → 一律從空白的一則開始（上一則已在隨寫隨存時存好）
  if (tabId === 'diary' && (currentTab !== 'diary' || homeOpen)) diaryFresh = true;
  homeOpen = false;
  hideDashboard();
  currentTab = tabId;
  editingId = null;
  renderAll();
  // 切到收支頁 → 立刻要 VPS 去財政部抓一次最新的（2026-09-27 前賢要求）
  if (tabId === 'expense') refreshInvoicesFromVps();
}

// 回首頁
function goHome() {
  homeOpen = true;
  hideDashboard();
  renderAll();
}

// 首頁點「養成好習慣」→ 開儀表板
function goDashboard() {
  showDashboard();
}

function renderNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML =
    `<button class="nav-btn home-btn ${homeOpen?'active':''}" id="homeBtn" title="回首頁" aria-label="首頁"><span class="nvi">${ico('home', 21)}</span><span class="nvl">首頁</span></button>` +
    appData.categories.map(c => `
    <button class="nav-btn ${(c.id===currentTab && !dashboardOpen && !homeOpen)?'active':''}" data-tab="${c.id}" aria-label="${escHtml(c.name)}">
      <span class="nvi">${catIcon(c, 21)}</span><span class="nvl">${c.name.replace('事項','')}</span>
    </button>
  `).join('') + `
    <button class="nav-btn add-cat-btn" title="新增類別" aria-label="新增類別"><span class="nvi">${ico('plus', 21)}</span><span class="nvl">更多</span></button>
    <button class="nav-btn fresh-btn ${(currentTab==='habits' && !dashboardOpen && !homeOpen)?'active':''}" id="dashBtn" data-tab="habits" title="習慣打卡" aria-label="習慣"><span class="nvi">${ico('chart', 21)}</span><span class="nvl">習慣</span></button>`;

  const homeBtn = document.getElementById('homeBtn');
  if (homeBtn) homeBtn.addEventListener('click', goHome);

  nav.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => goTab(btn.dataset.tab));
  });

  nav.querySelector('.add-cat-btn').addEventListener('click', () => {
    homeOpen = false;
    hideDashboard();
    addCategory();
  });

  // 習慣：走 data-tab="habits"（原生模組，由 renderAll 接手）；舊版 iframe 由模組內按鈕開啟
  const dashBtn = document.getElementById('dashBtn');
  if (dashBtn && !dashBtn.dataset.bound) {
    dashBtn.dataset.bound = '1';
    dashBtn.addEventListener('click', () => goTab('habits'));
  }
}

// 養成好習慣 iframe 內嵌（保留底部導航）
function showDashboard() {
  dashboardOpen = true;
  const frame = document.getElementById('dashFrame');
  const iframe = document.getElementById('dashIframe');
  if (frame) frame.classList.remove('hidden');
  if (iframe && iframe.getAttribute('src') !== DASH_URL) iframe.setAttribute('src', DASH_URL);
  document.getElementById('main').style.display = 'none';
  renderNav();
  saveNav();
}

function hideDashboard() {
  dashboardOpen = false;
  const frame = document.getElementById('dashFrame');
  if (frame) frame.classList.add('hidden');
  document.getElementById('main').style.display = '';
}

// 日記：新增或編輯時，畫面一律滾到最上頭，讓輸入框完整可見
window.__ppScrollTop = function () {
  try {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const box = document.querySelector('.diary-box');
    if (box) box.scrollIntoView({ block: 'start', behavior: 'smooth' });
  } catch (e) {}
};

// 編輯一筆：日記載入上方輸入框並回到最上方；其他類別開啟行內編輯表單
function doEditItem(id) {
  if (!id) return;
  if (currentTab === 'diary' && window.DiaryUI) {
    diaryCurId = id;
    try { localStorage.setItem('diary.currentId', id); } catch (e) {}
    editingId = null;
    renderMain();
    if (window.__ppScrollTop) window.__ppScrollTop();
    const ta = document.getElementById('addText');
    if (ta) {
      ta.focus({ preventScroll: true });
      if (ta.tagName === 'TEXTAREA') ta.setSelectionRange(ta.value.length, ta.value.length);
      else {
        const r = document.createRange();
        r.selectNodeContents(ta); r.collapse(false);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      }
    }
    return;
  }
  editingId = id;
  renderMain();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const ef = document.getElementById('editText') || document.querySelector('.edit-form');
  if (ef) setTimeout(() => ef.scrollIntoView({ block: 'center', behavior: 'smooth' }), 30);
}

// 事件代理：任何情況下鉛筆都有效
if (!window.__editDelegated) {
  window.__editDelegated = true;
  document.addEventListener('click', e => {
    const ed = e.target && e.target.closest ? e.target.closest('.edit-btn') : null;
    if (!ed || ed.__boundEdit) return;
    doEditItem(ed.dataset.id);
  });
}

function renderMain() {
  const main = document.getElementById('main');
  const cat = appData.categories.find(c => c.id === currentTab) || appData.categories[0];
  if (!cat) return;

  let items = getItems(cat.id);
  const isExpense = cat.id === 'expense';

  // 收支摘要（本月份 + 收入支出表 + 分類 + 每日曲線圖）
  let summaryHtml = '';
  let chartHtml = '';
  if (isExpense) {
    const now = new Date();
    if (!expenseView.month) {
      expenseView.year = now.getFullYear();
      expenseView.month = now.getMonth() + 1;
    }
    const vYear = expenseView.year;
    const vMonth = expenseView.month;
    const daysInMonth = new Date(vYear, vMonth, 0).getDate();
    const isCurMonth = (vYear === now.getFullYear() && vMonth === now.getMonth() + 1);
    const maxDay = isCurMonth ? now.getDate() : daysInMonth;
    const monthItems = items.filter(it => monthOf(it.date) === vMonth);
    // 收入/支出分開
    const expItems = monthItems.filter(it => (it.type || 'expense') !== 'income');
    const incItems = monthItems.filter(it => (it.type || 'expense') === 'income');
    const expTotal = MONTHLY_HOUSING + expItems.reduce((s, e) => s + (e.amount || 0), 0);
    const incTotal = MONTHLY_INCOME + incItems.reduce((s, e) => s + (e.amount || 0), 0);
    const balance = incTotal - expTotal;

    // 支出分類統計（食衣住行道場）；住固定 MONTHLY_HOUSING
    const catSum = { '住': MONTHLY_HOUSING };
    for (const it of expItems) {
      const c = it.cat || expenseCat(it.store, it.text);
      catSum[c] = (catSum[c] || 0) + (it.amount || 0);
    }
    const catMax = Math.max(...Object.values(catSum), 1);
    // 只顯示有花費的分類（0 元不顯示）；依已花費金額由多到少排序（同額時維持固定順序）
    const catOrder = [...EXPENSE_CATS].filter(c => (catSum[c] || 0) > 0)
                                     .sort((a, b) => (catSum[b] || 0) - (catSum[a] || 0));
    const catHtml = catOrder.map(c => {
      const v = catSum[c] || 0;
      const catItems = expItems.filter(it => (it.cat || expenseCat(it.store, it.text)) === c && !pendingIds.has(it.id));
      let detailHtml = '';
      if (c === '住' && MONTHLY_HOUSING > 0) {
        detailHtml += `<li class="cat-fixed"><span style="flex:1">固定（房租）</span><span style="font-weight:600;color:var(--danger)">-NT$${MONTHLY_HOUSING.toLocaleString()}</span></li>`;
      }
      // 依日期分組：同一天的消費放進同一個框（前賢 2026-09-30 要求）
      const dayMap = new Map();
      for (const it of catItems) {
        const d = it.date || '未標日期';
        if (!dayMap.has(d)) dayMap.set(d, []);
        dayMap.get(d).push(it);
      }
      const dayKey = d => { const q = String(d).split('/'); return q.length === 2 ? (+q[0]) * 100 + (+q[1]) : 0; };
      const days = [...dayMap.keys()].sort((a, b) => dayKey(b) - dayKey(a));
      detailHtml += days.map(d => {
        const list = dayMap.get(d);
        const sum = list.reduce((acc, x) => acc + (x.amount || 0), 0);
        const rows = list.map(it => (editingId === it.id ? renderEditForm(cat, it) : renderItem(cat, it))).join('');
        return `<li class="day-group">
            <div class="day-head"><span class="day-date">${escHtml(d)}</span><span class="day-sum">${list.length} 筆 · NT$${sum.toLocaleString()}</span></div>
            <ul class="day-items">${rows}</ul>
          </li>`;
      }).join('');
      const opened = openCats.has(c);
      return `
        <div class="cat-row">
          <span class="cat-name">${c}</span>
          <span class="cat-bar"><span class="cat-fill" style="width:${Math.round(v/catMax*100)}%"></span></span>
          <span class="cat-amt">NT$${v.toLocaleString()}</span>
        </div>
        <button type="button" class="cat-toggle${opened ? ' open' : ''}" data-cat="${c}" onclick="toggleCatDetail(this)">明細</button>
        <ul class="cat-detail${opened ? ' show' : ''}">${detailHtml || '<li class="cat-empty">本月無支出</li>'}</ul>`;
    }).join('');

    // 最近一筆消費（讓前賢一眼看到最近買了什麼）
    const recentExp = (() => {
      const pool = getItems('expense').filter(it => (it.type || 'expense') !== 'income' && !pendingIds.has(it.id));
      if (!pool.length) return null;
      const dkey = it => {
        const p = String(it.date || '').split('/');
        return p.length === 2 ? (+p[0]) * 100 + (+p[1]) : 0;
      };
      return pool.slice().sort((a, b) => dkey(b) - dkey(a))[0];
    })();
    const recentHtml = recentExp ? `
        <div class="recent-item">
          <span class="recent-tag">最近消費</span>
          <span class="recent-name">${escHtml(recentItemLabel(recentExp))}</span>
          <span class="recent-amt">NT$${Number(recentExp.amount || 0).toLocaleString()}</span>
          <span class="recent-meta">${escHtml(recentExp.date || '')}${recentExp.store ? ' · ' + escHtml(recentExp.store) : ''}</span>
        </div>` : '';

    summaryHtml = `
      <div id="expenseSummary">
        <div class="month-nav">
          <button class="month-nav-btn" onclick="shiftExpenseMonth(-1)">‹</button>
          <span class="month-nav-label">${vYear}年${vMonth}月</span>
          <button class="month-nav-btn" onclick="shiftExpenseMonth(1)">›</button>
        </div>
        ${!isCurMonth ? `<div class="month-back" onclick="resetExpenseMonth()">回到本月</div>` : ''}
        <div class="summary-row">
          <div class="sum-col sum-inc"><span class="sum-label">收入</span><span class="sum-income">NT$${incTotal.toLocaleString()}</span></div>
          <div class="sum-col sum-exp"><span class="sum-label">支出</span><span class="sum-expense">NT$${expTotal.toLocaleString()}</span></div>
          <div class="sum-col sum-bal"><span class="sum-label">結餘</span><span class="sum-balance ${balance>=0?'pos':'neg'}">${balance<0?'-':''}NT$${Math.abs(balance).toLocaleString()}</span></div>
        </div>
        <div class="label">${monthItems.length} 筆</div>
      </div>
      ${(catHtml || recentHtml) ? `<div class="cat-stats"><div class="cat-stats-title">支出分類總額</div>${catHtml}${recentHtml}</div>` : ''}`;
    chartHtml = `
      <div class="chart-box">
        <div class="chart-title">📈 每日花費（${vMonth}月 1-${maxDay}日）</div>
        ${renderDailyChart(expItems, maxDay)}
      </div>`;
    // 本月過濾的列表
    items = monthItems;
  }

  // 列表（收支頁：支出已在分類明細中，列表只顯示收入）
  // 本次剛新增的先排除（改顯示在輸入框下方的「剛新增」區），重新整理後才歸位
  const todoMode = cat.id === 'todo';   // 待辦一律直接進四象限方框
  const listItems = (isExpense ? items.filter(it => (it.type || 'expense') === 'income') : items)
    .filter(it => todoMode || !pendingIds.has(it.id));
  const pendingItems = todoMode ? [] : getItems(cat.id).filter(it => pendingIds.has(it.id));
  const pendingHtml = pendingItems.length
    ? `<div class="pending-box">
         <div class="pending-title">✅ 剛新增 ${pendingItems.length} 筆（重新整理後歸位）</div>
         <ul class="pending-list">${pendingItems.map(it => renderItem(cat, it)).join('')}</ul>
       </div>`
    : '';
  let listHtml = '';
  if (cat.id === 'todo') {
    // 艾森豪矩陣：四象限各一個方框
    const QUADS = [
      { q: 1, name: '重要且緊急' },
      { q: 2, name: '重要不緊急' },
      { q: 3, name: '緊急不重要' },
      { q: 4, name: '不重要不緊急' }
    ];
    const openItems = listItems.filter(it => !it.completed);
    const doneItems = listItems.filter(it => it.completed);
    listHtml = QUADS.map(g => {
      const arr = openItems.filter(it => (Number(it.q) || 4) === g.q);
      const head = `<div class="quad-head"><span class="quad-no">${g.q}</span>${g.name}<span class="quad-n">${arr.length}</span></div>`;
      if (!arr.length) return `<div class="quad q${g.q} is-empty">${head}</div>`;   // 空象限收成一行細條
      const body = arr.map(it => editingId === it.id ? renderEditForm(cat, it) : renderItem(cat, it)).join('');
      return `<div class="quad q${g.q}">${head}<ul class="quad-list">${body}</ul></div>`;
    }).join('');
    if (doneItems.length) {
      const open = !!window.__doneOpen;
      listHtml += `<div class="quad qdone${open ? '' : ' collapsed'}">
          <div class="quad-head quad-head-btn" data-donetoggle="1">
            <span class="quad-no">✓</span>已完成<span class="quad-n">${doneItems.length}</span>
            <span class="quad-caret">${open ? '▾' : '▸'}</span>
          </div>
          ${open ? `<ul class="quad-list">${doneItems.map(it => renderItem(cat, it)).join('')}</ul>
            <button type="button" class="quad-clear" data-cleardone="1">清除全部已完成</button>` : ''}
        </div>`;
    }
  } else if (listItems.length === 0) {
    listHtml = isExpense ? '' : (pendingItems.length ? '' : `<div class="card empty">尚無內容，用上方輸入框或語音新增</div>`);
  } else if (cat.id === 'diary') {
    if (diaryFresh) { diaryQuery = ''; diaryMoodFilter = ''; }   // 進日記頁從乾淨狀態開始
    listHtml = diaryToolbarHtml() + `<div id="diaryCards">${diaryCardsHtml(listItems)}</div>`;
  } else {
    const sorted = [...listItems].sort((a,b) => (b.date||'').localeCompare(a.date||''));
    listHtml = sorted.map(it => {
      if (editingId === it.id) {
        return renderEditForm(cat, it);
      }
      return renderItem(cat, it);
    }).join('');
  }

  // 新增區（置於標題下方最上方；麥克風獨立一顆在上、輸入框緊接其下，新增後項目顯示在輸入框下方）
  // 日記頁已有工具列的「聽寫」，不再重複顯示上方麥克風（前賢 2026-10-29 要求）
  const micBtn = (voiceSupported && cat.id !== 'diary') ? '<button id="micBtn" class="mic-btn" title="語音輸入">🎤</button>' : '';
  const addForm = isExpense
    ? `<div class="add-form">
         ${micBtn}
         <div class="add-row">
           <textarea id="addText" rows="2" placeholder="例如：全家 買飲料 50元｜薪水 50000元"></textarea>
           <button id="addBtn">新增</button>
         </div>
       </div>`
    : cat.id === 'diary'
    ? `<div class="add-form diary-cream">
         <div class="dc-top">
           <div class="dc-stats" id="dcStats">${diaryStatsHtml()}</div>
           <button type="button" class="dc-ai-btn" id="diaryAiBtn">${ico('bulb', 14)} AI 回顧</button>
         </div>
         <div class="dc-moods" id="dcMoods">${DIARY_MOODS.map(m => `<button type="button" class="dc-mood" data-mood="${m}">${m}</button>`).join('')}</div>
         <div class="add-row">
           <div class="diary-box">
             <div id="addText" class="dc-edit" contenteditable="true" role="textbox" aria-multiline="true" data-ph="寫下今天…"></div>
             <div id="diaryTools"></div>
           </div>
         </div>
         <div class="diary-act-row"><button type="button" id="diaryAddBtn" aria-label="新增日記">新增</button></div>
       </div>`
    : cat.id === 'todo'
    ? `<div class="add-form">
         <div class="quad-pick">
           ${[[1,'重要且緊急'],[2,'重要不緊急'],[3,'緊急不重要'],[4,'不重要不緊急']]
             .map(p => `<button type="button" class="qp q${p[0]}${newQuad===p[0]?' on':''}" data-q="${p[0]}">${p[1]}</button>`).join('')}
         </div>
         <div class="add-row">
           <textarea id="addText" rows="2" placeholder="新增待辦…"></textarea>
           <button id="addBtn">新增</button>
         </div>
       </div>`
    : `<div class="add-form">
         ${micBtn}
         <div class="add-row">
           <textarea id="addText" rows="2" placeholder="輸入${cat.name}內容..."></textarea>
           <button id="addBtn">新增</button>
         </div>
       </div>`;

  main.innerHTML = `
    <section class="tab-content active">
      <h2>${catIcon(cat, 20)} ${cat.name}</h2>
      ${addForm}
      ${pendingHtml}
      ${summaryHtml}
      <div id="itemList">${listHtml}</div>
      ${chartHtml}
    </section>`;

  // 綁定事件（新增區：分類頁與首頁共用）
  bindAddForm();

  // 日記：工具列（照片/錄音/語音轉字/表情/背景/明細/手寫/字級）與附件互動
  if (cat.id === 'diary' && window.DiaryUI) {
    const af = main.querySelector('.add-form');
    if (af) window.DiaryUI.mount(af, 'diary');
    if (diaryFresh) {
      // 進日記頁 = 空白日記開始：收掉上一筆的暫存（內容本身已存進清單，不會遺失）
      diaryFresh = false;
      diaryCurId = null;
      diaryMood = '';
      try { localStorage.removeItem('diary.currentId'); } catch (e) {}
      if (window.DiaryUI && window.DiaryUI.clearDraft) window.DiaryUI.clearDraft();
    }
    if (!diaryCurId) { try { diaryCurId = localStorage.getItem('diary.currentId') || null; } catch (e) {} }
    const cur = diaryCurId ? getItems('diary').find(x => x.id === diaryCurId) : null;
    diaryMood = (cur && cur.mood) || '';
    main.querySelectorAll('.dc-mood').forEach(b => b.classList.toggle('on', b.dataset.mood === diaryMood));
    if (cur && window.DiaryUI.loadEntry) window.DiaryUI.loadEntry(cur);
    window.DiaryUI.afterRender(main, saveData);   // 含待歸位清單與正式列表
  }

  // 列表事件
  const list = document.getElementById('itemList');
  if (list) {
    // 勾選
    main.querySelectorAll('.todo-check').forEach(el => {
      el.addEventListener('click', async () => {
        const hit = findItemById(el.dataset.id);
        const it = hit ? hit.arr[hit.idx] : items.find(i => i.id === el.dataset.id);
        if (!it) return;
        if (it.completed) {           // 取消完成：直接還原
          it.completed = false;
          saveData();
          renderMain();
          return;
        }
        // 打勾：先播放漸閃淡出動畫，再歸入已完成
        const li = el.closest('li');
        if (li) li.classList.add('todo-fading');
        setTimeout(() => {
          it.completed = true;
          saveData();
          renderMain();
        }, 480);
      });
    });

    // 已完成：展開／收合
    main.querySelectorAll('[data-donetoggle]').forEach(h => {
      h.addEventListener('click', () => { window.__doneOpen = !window.__doneOpen; renderMain(); });
    });
    // 已完成：清除全部（可復原）
    main.querySelectorAll('[data-cleardone]').forEach(b => {
      b.addEventListener('click', () => {
        const arr = getItems('todo');
        const gone = arr.filter(x => x.completed);
        if (!gone.length) return;
        for (let i = arr.length - 1; i >= 0; i--) if (arr[i].completed) arr.splice(i, 1);
        saveData();
        renderMain();
        showUndo(`已清除 ${gone.length} 筆已完成`, () => { arr.push(...gone); saveData(); renderMain(); });
      });
    });

    // 象限切換（點編號循環 1→2→3→4）
    main.querySelectorAll('.q-badge').forEach(b => {
      b.addEventListener('click', e => {
        e.stopPropagation();
        const hit = findItemById(b.dataset.id);
        if (!hit) return;
        const cur = Number(hit.arr[hit.idx].q) || 4;
        hit.arr[hit.idx].q = cur % 4 + 1;
        saveData();
        renderMain();
      });
    });
    // 編輯（itemList 收入 + 分類明細支出）
    main.querySelectorAll('.edit-btn').forEach(el => {
      el.__boundEdit = true;
      el.addEventListener('click', () => doEditItem(el.dataset.id));
    });
    // 刪除（itemList 收入 + 分類明細支出）
    main.querySelectorAll('.del-btn').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        // 注意：收支頁的 items 是當月過濾後的複本，splice 它不會刪到資料 → 用 findItemById
        const hit = findItemById(id);
        if (hit) {
          const removed = hit.arr.splice(hit.idx, 1)[0];
          pendingIds.delete(id);
          saveData();
          renderMain();
          showUndo(`已刪除「${String((removed && removed.text) || '').slice(0, 10)}」`, () => {
            hit.arr.splice(Math.min(hit.idx, hit.arr.length), 0, removed);
            saveData();
            renderMain();
          });
        }
      });
    });
    // 編輯表單
    const saveEdit = document.getElementById('saveEdit');
    if (saveEdit) {
      saveEdit.addEventListener('click', () => {
        const it = items.find(i => i.id === editingId);
        if (!it) return;
        const textEl = document.getElementById('editText');
        const storeEl = document.getElementById('editStore');
        const amountEl = document.getElementById('editAmount');
        const catEl = document.getElementById('editCat');
        const typeEl = document.getElementById('editType');
        if (textEl) it.text = textEl.value.trim() || it.text;
        if (storeEl) it.store = storeEl.value.trim() || it.store;
        if (amountEl) it.amount = parseInt(amountEl.value) || 0;
        if (catEl) it.cat = catEl.value;
        if (typeEl) it.type = typeEl.value;
        editingId = null;
        saveData();
        renderMain();
      });
    }
    const cancelEdit = document.getElementById('cancelEdit');
    if (cancelEdit) {
      cancelEdit.addEventListener('click', () => {
        editingId = null;
        renderMain();
      });
    }
  }
}

// 去掉舊版自動加在開頭的日期（顯示時才去掉，不動原始資料）
function stripDiaryDate(text) {
  return String(text || '').replace(/^\s*\d{1,2}-\d{1,2}\s*(?:上午|下午)?\s*\d{0,2}:?\d{0,2}\s*\n?/, '');
}

function renderItem(cat, it) {
  if (cat.id === 'expense') {
    const mainName = (it.store && it.store !== '手動') ? it.store : (it.item || '手動');
    const subText = (it.store && it.store !== '手動')
      ? (it.item || it.text || '')
      : (it.text !== it.item ? it.text : '');
    const isIncome = (it.type || 'expense') === 'income';
    const c = isIncome ? '收入' : (it.cat || expenseCat(it.store, it.text));
    const itemsHtml = (it.items && it.items.length > 1)
      ? `<div class="inv-items">${
          it.items.map(x => {
            const amt = (x.amount >= 0 ? '' : '-') + 'NT$' + Math.abs(x.amount);
            return `<div class="inv-item"><span class="inv-name">${escHtml(x.name)}</span><span class="inv-qty">×${x.qty}</span><span class="inv-amt">${amt}</span></div>`;
          }).join('')
        }</div>`
      : '';
    return `
      <li>
        <span style="flex:1">
          <strong>${escHtml(mainName)}</strong>
          ${subText ? `<span style="font-size:0.8rem;color:var(--text2);display:block">${escHtml(subText)}</span>` : ''}
        </span>
        <span class="cat-badge cat-${c === '收入' ? 'income' : c}">${c}</span>
        <span style="font-weight:600;color:${isIncome ? 'var(--success)' : 'var(--danger)'}">${isIncome ? '+' : '-'}NT$${it.amount||0}</span>
        <span style="font-size:0.7rem;color:var(--text2)">${it.date||''}</span>
        <button class="edit-btn" data-id="${it.id}" aria-label="編輯">${ico('edit', 16)}</button>
        <button class="del-btn" data-id="${it.id}" aria-label="刪除">${ico('trash', 16)}</button>
        ${itemsHtml}
      </li>`;
  }
  if (cat.id === 'todo') {
    const q = Number(it.q) || 4;
    return `
      <li class="todo-li${it.completed ? ' is-done' : ''}">
        <span class="todo-check ${it.completed?'done':''}" data-id="${it.id}">✓</span>
        <span class="todo-text ${it.completed?'done':''}" style="flex:1"><span class="todo-marker">▸</span>${escHtml(it.text)}</span>
        ${it.due ? `<span class="due-chip" title="截止日">截止 ${escHtml(it.due)}</span>` : ''}
        <button class="q-badge q${q}" data-id="${it.id}" aria-label="優先級 ${q}" title="${q<=2 ? '重要' : '一般'}（點一下切換優先級）">${q<=2 ? '★' : '☆'}</button>
        <span class="todo-date" title="建立日期">${it.date||''}</span>
        <button class="edit-btn" data-id="${it.id}" aria-label="編輯">${ico('edit', 16)}</button>
        <button class="del-btn" data-id="${it.id}" aria-label="刪除">${ico('trash', 16)}</button>
      </li>`;
  }
  if (cat.id === 'diary' && window.DiaryUI) {
    return `
    <li class="diary-li" data-id="${it.id}" data-diary-bg="${it.bg || ''}" style="${window.DiaryUI.bgStyle(it)}">
      <span style="flex:1;min-width:0">
        <span class="diary-summary">${escHtml(diarySummary(stripDiaryDate(it.text), it))}</span>
      </span>
      <span class="diary-date-out">${it.date||''}</span>
      <button class="read-btn" data-id="${it.id}" aria-label="閱讀">${ico('eye', 16)}</button>
      <button class="share-btn" data-id="${it.id}" aria-label="分享">${ico('share', 16)}</button>
      <button class="edit-btn" data-id="${it.id}" aria-label="編輯">${ico('edit', 16)}</button>
      <button class="del-btn" data-id="${it.id}" aria-label="刪除">${ico('trash', 16)}</button>
    </li>`;
  }
  return `
    <li>
      <span style="flex:1">
        ${escHtml(it.text)}
        <span class="meta">${it.date||''}</span>
      </span>
      <button class="edit-btn" data-id="${it.id}" aria-label="編輯">${ico('edit', 16)}</button>
      <button class="del-btn" data-id="${it.id}" aria-label="刪除">${ico('trash', 16)}</button>
    </li>`;
}

function renderEditForm(cat, it) {
  if (cat.id === 'expense') {
    const curCat = it.cat || expenseCat(it.store, it.text);
    const isIncome = (it.type || 'expense') === 'income';
    const catOptions = EXPENSE_CATS.map(c =>
      `<option value="${c}" ${c===curCat?'selected':''}>${c}</option>`).join('');
    return `
      <li class="edit-form">
        <div class="edit-row">
          <select id="editType" style="flex:1">
            <option value="expense" ${!isIncome?'selected':''}>支出</option>
            <option value="income" ${isIncome?'selected':''}>收入</option>
          </select>
          <input id="editAmount" type="number" value="${it.amount||0}" placeholder="金額">
        </div>
        <input id="editStore" value="${escHtml(it.store||'')}" placeholder="商店/來源">
        <input id="editText" value="${escHtml(it.text||'')}" placeholder="品項">
        <div class="edit-row">
          <select id="editCat">${catOptions}</select>
          <span style="font-size:0.8rem;color:var(--text2);align-self:center">分類</span>
        </div>
        <div class="edit-actions">
          <button id="saveEdit" style="background:var(--accent);color:white">儲存</button>
          <button id="cancelEdit">取消</button>
        </div>
      </li>`;
  }
  return `
    <li class="edit-form">
      <input id="editText" value="${escHtml(it.text)}">
      <div class="edit-actions">
        <button id="saveEdit" style="background:var(--accent);color:white">儲存</button>
        <button id="cancelEdit">取消</button>
      </div>
    </li>`;
}

// === 新增類別 ===
function addCategory() {
  const name = prompt('新類別名稱：');
  if (!name || !name.trim()) return;
  const id = 'cat_' + uid();
  appData.categories.push({id, name: name.trim(), icon: '📁'});
  appData.items[id] = [];
  currentTab = id;
  saveData();
  renderAll();
}

// === 全站搜尋：搜尋待辦、日記、收支、靈感及自訂分類 ===
function openGlobalSearch() {
  const old = document.getElementById('globalSearchLayer');
  if (old) old.remove();
  const layer = document.createElement('div');
  layer.id = 'globalSearchLayer';
  layer.className = 'utility-layer';
  layer.innerHTML = `
    <section class="utility-dialog" role="dialog" aria-modal="true" aria-labelledby="globalSearchTitle">
      <div class="utility-dialog-head"><h2 id="globalSearchTitle">搜尋所有紀錄</h2><button type="button" class="utility-close" aria-label="關閉" onclick="closeUtilityLayer()">✕</button></div>
      <label class="sr-only" for="globalSearchInput">搜尋關鍵字</label>
      <input id="globalSearchInput" type="search" placeholder="輸入關鍵字，例如：買菜、靈感、金額…" autocomplete="off">
      <div id="globalSearchResults" class="global-search-results"><p class="utility-hint">輸入關鍵字，即時搜尋所有分類。</p></div>
    </section>`;
  layer.addEventListener('click', e => { if (e.target === layer) closeUtilityLayer(); });
  document.body.appendChild(layer);
  const input = layer.querySelector('#globalSearchInput');
  input.addEventListener('input', () => renderGlobalSearchResults(input.value));
  input.addEventListener('keydown', e => { if (e.key === 'Escape') closeUtilityLayer(); });
  input.focus();
}

function renderGlobalSearchResults(query) {
  const target = document.getElementById('globalSearchResults');
  if (!target) return;
  const q = String(query || '').trim().toLocaleLowerCase();
  if (!q) { target.innerHTML = '<p class="utility-hint">輸入關鍵字，即時搜尋所有分類。</p>'; return; }
  const found = [];
  for (const cat of (appData.categories || [])) {
    for (const item of (appData.items[cat.id] || [])) {
      const haystack = [item.text, item.store, item.cat, item.date, item.amount, item.due]
        .filter(v => v !== undefined && v !== null).join(' ').toLocaleLowerCase();
      if (haystack.includes(q)) found.push({cat, item});
    }
  }
  found.sort((a,b) => String(b.item.date || '').localeCompare(String(a.item.date || '')));
  if (!found.length) { target.innerHTML = '<p class="utility-hint">找不到符合的紀錄，試試其他關鍵字。</p>'; return; }
  target.innerHTML = `<p class="utility-result-count">找到 ${found.length} 筆紀錄</p>` + found.slice(0,80).map(({cat,item}, i) =>
    `<button type="button" class="global-result" data-search-cat="${escHtml(cat.id)}" data-search-id="${escHtml(String(item.id))}">
      <span class="global-result-icon">${catIcon(cat, 18)}</span><span class="global-result-body"><b>${escHtml(cat.name)}</b><span>${escHtml(String(item.text || item.store || '（無文字）').slice(0,140))}</span><small>${escHtml(String(item.date || ''))}${item.amount != null ? ` · NT$${Number(item.amount).toLocaleString()}` : ''}</small></span><span class="global-result-arrow">›</span>
    </button>`).join('') + (found.length > 80 ? '<p class="utility-hint">僅顯示前 80 筆，請增加關鍵字縮小範圍。</p>' : '');
  target.querySelectorAll('.global-result').forEach(btn => btn.addEventListener('click', () => {
    const catId = btn.dataset.searchCat, itemId = btn.dataset.searchId;
    closeUtilityLayer();
    goTab(catId);
    requestAnimationFrame(() => {
      const el = [...document.querySelectorAll('[data-id]')].find(n => n.dataset.id === itemId);
      if (el) { el.scrollIntoView({behavior:'smooth', block:'center'}); el.classList.add('search-result-highlight'); setTimeout(() => el.classList.remove('search-result-highlight'), 2200); }
    });
  }));
}

function closeUtilityLayer() {
  const layer = document.getElementById('globalSearchLayer');
  if (layer) layer.remove();
  const backup = document.getElementById('backupFileInput');
  if (backup && backup.dataset.cleanup === '1') backup.remove();
}

// === 資料備份與還原：匯出完整 JSON，匯入前驗證格式並二次確認 ===
function exportBackup() {
  try {
    const payload = {format:'rongge-personal-platform-backup', schema:2, exportedAt:new Date().toISOString(), data:appData, habitData:localStorage.getItem('habit.v2') || localStorage.getItem('habit.v1') || null};
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    a.href = url;
    a.download = `榮哥動起來_備份_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    showUtilityNotice('備份檔已開始下載。日記照片、錄音等附件需另行保存。');
  } catch (e) { showUtilityNotice('備份失敗，請確認瀏覽器下載權限。', true); }
}

function importBackup() {
  let input = document.getElementById('backupFileInput');
  if (!input) {
    input = document.createElement('input'); input.id='backupFileInput'; input.type='file'; input.accept='.json,application/json'; input.hidden=true;
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0]; if (!file) return;
      try {
        if (file.size > 20 * 1024 * 1024) throw new Error('檔案大於 20 MB，請確認是否選錯檔案。');
        const parsed = JSON.parse(await file.text());
        const data = parsed && parsed.format === 'rongge-personal-platform-backup' ? parsed.data : parsed;
        if (!data || !Array.isArray(data.categories) || !data.items || typeof data.items !== 'object' || Array.isArray(data.items)) throw new Error('檔案格式不正確，沒有找到有效的分類與紀錄。');
        if (!confirm(`將以備份內容取代目前裝置上的紀錄。備份日期：${parsed.exportedAt || '未知'}\n建議先按「備份」保存目前資料。日記照片、錄音等附件不包含在 JSON 備份中。\n確定還原嗎？`)) return;
        const cleanCategories = data.categories.filter(c => c && typeof c.id === 'string' && typeof c.name === 'string' && c.id !== 'sticky');
        if (!cleanCategories.some(c => c.id === 'todo')) throw new Error('備份缺少必要的待辦分類，為避免資料損壞已取消還原。');
        const cleanItems = {};
        for (const c of cleanCategories) cleanItems[c.id] = Array.isArray(data.items[c.id]) ? data.items[c.id] : [];
        const next = {...appData, ...data, categories:cleanCategories, items:cleanItems};
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        if (typeof parsed.habitData === 'string') localStorage.setItem('habit.v2', parsed.habitData);
        appData = next; currentTab = 'todo'; homeOpen = true; dashboardOpen = false; saveNav(); renderAll();
        showUtilityNotice('資料還原完成。若有習慣資料，請切換至習慣頁確認。');
      } catch (e) { showUtilityNotice('還原失敗：' + (e.message || '檔案無法讀取'), true); }
      finally { input.value = ''; }
    });
    document.body.appendChild(input);
  }
  input.click();
}

function showUtilityNotice(message, isError=false) {
  const old = document.getElementById('utilityNotice'); if (old) old.remove();
  const el = document.createElement('div'); el.id='utilityNotice'; el.className='utility-notice' + (isError?' is-error':'');
  el.setAttribute('role','status'); el.textContent=message; document.body.appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

// === 小工具 ===
function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// === Service Worker ===
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js', {updateViaCache: 'none'}).catch(() => {});
}

// === 啟動 ===
document.addEventListener('DOMContentLoaded', init);
