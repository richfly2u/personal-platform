/* === 個人平台 PWA — 主邏輯（動態類別版） === */

const STORAGE_KEY = 'personal_platform_data_v2';

// 預設類別
const BUILTIN_CATEGORIES = [
  {id: 'todo',    name: '待辦事項', icon: '✓'},
  {id: 'diary',   name: '日記',     icon: '📅'},
  {id: 'expense', name: '收支',     icon: '💰'},
  {id: 'idea',    name: '靈感',     icon: '💡'}
];

// === 自動更新偵測（v18：不再自動重載，避免抖動迴圈）===
// 舊版（v16 之前）看到 version.txt 空值也會停止重載 → 一舉停止所有迴圈
const APP_VERSION = '20';
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
let expenseView = { year: null, month: null };  // 收支檢視月份（null=本月）
let dashboardOpen = false;  // 養成好習慣 iframe 是否開啟
let homeOpen = true;  // 首頁（整合五項目摘要）是否顯示
const DASH_URL = 'https://richfly2u.github.io/daily-dashboard/';
let voiceSupported = false;  // 瀏覽器是否支援語音辨識（決定是否顯示麥克風按鈕）
const NAV_KEY = 'personal_platform_nav';  // 目前頁面狀態（重整後維持）
let autoSaveTimer = null;  // 語音後 5 秒未觸碰 → 自動存入計時
const AUTOSAVE_MS = 5000;

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
  if (!addText || !addText.value.trim()) return;
  autoSaveTimer = setTimeout(() => { autoSaveTimer = null; submitAddText(); }, AUTOSAVE_MS);
}

// === 初始化 ===
async function init() {
  loadData();
  migrateOldData();
  await loadSyncData();
  setupVoice();
  restoreNav();  // 重整後回到上次的頁面
  if (dashboardOpen) {
    showDashboard();
  } else {
    renderAll();
  }
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
      homeOpen = !!s.homeOpen;
      dashboardOpen = !!s.dashboardOpen;
    }
  } catch(e) {}
}

// 本機伺服器（語音潤飾/待辦勾選/行事曆同步用）
const SYNC_HOST = (location.hostname === '192.168.0.75') ? location.origin : 'https://192.168.0.75:9443';

// === 資料讀寫 ===
function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const saved = JSON.parse(raw);
      if (saved.categories) appData.categories = saved.categories;
      if (saved.items) appData.items = saved.items;
    } catch(e) {}
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
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
    const invRes = await fetch('data/invoices.json');
    if (invRes.ok) {
      const invoices = await invRes.json();
      const expenseItems = getItems('expense');
      const existingById = new Map(expenseItems.filter(e=>e.source==='invoice').map(e=>[e.id, e]));
      for (const inv of invoices) {
        if (existingById.has(inv.id)) {
          // 更新既有發票的明細（保留使用者手動改的 store/date）
          const existing = existingById.get(inv.id);
          existing.items = inv.items || existing.items || [];
          if (inv.amount != null) existing.amount = inv.amount;
          if (inv.item) existing.text = inv.item;
        } else {
          expenseItems.push({
            id: inv.id,
            store: inv.store || '未知',
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

  try {
    // easynote 待辦只匯入一次，避免使用者刪除後每次重整又被加回來
    const todoRes = await fetch('data/todos.json');
    if (todoRes.ok && !localStorage.getItem('easynote_imported')) {
      const todosData = await todoRes.json();
      const todoItems = getItems('todo');
      const hasEasynote = todoItems.some(t => t.source === 'easynote');
      if (!hasEasynote) {
        const existingTexts = new Set(todoItems.map(t => t.text));
        for (const item of todosData.items || []) {
          if (!existingTexts.has(item.text)) {
            todoItems.push({
              id: 'esynote_' + uid(),
              text: item.text,
              completed: item.completed || false,
              date: today(),
              source: 'easynote'
            });
          }
        }
      }
      localStorage.setItem('easynote_imported', '1');
    }
  } catch(e) {}

  saveData();
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
  let finalText = '';
  let finalCount = 0;  // 已累積的最終結果數（防重複輸出）
  let stoppedByUser = false;
  let silenceTimer = null;
  const SILENCE_MS = 3000;  // 斷音超過 3 秒自動停止

  function micBtn() { return document.getElementById('micBtn'); }
  function addInput() { return document.getElementById('addText'); }

  // 語音文字直接寫進輸入框（即時）
  function setInput(text) {
    const inp = addInput();
    if (inp) { inp.value = text; autoGrowInput(inp); }
  }
  // 錯誤訊息：暫時顯示在輸入框 placeholder
  function showInputError(msg) {
    const inp = addInput();
    if (inp) inp.placeholder = msg;
  }

  function stopListening() {
    const b = micBtn();
    if (b) { b.classList.remove('listening'); b.textContent = '🎤'; }
    if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
    startAutoSave();  // 語音停止後，5 秒未觸碰 → 自動存入
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
    finalCount = 0;  // 新辨識工作階段，最終結果計數歸零

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
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) {
          // 只累積「新的」最終結果（i >= finalCount），避免 Chrome 重複回報同一段
          if (i >= finalCount) {
            finalText += r[0].transcript;
            finalCount = i + 1;
          }
        } else if (i >= finalCount) {
          interim += r[0].transcript;
        }
      }
      setInput(finalText + interim);  // 直接寫進輸入框
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
    // 接續輸入框已有的文字（語音追加）
    finalText = addInput() ? addInput().value : '';
    startListening();
  });

  // 螢幕觸碰／輸入 → 重設自動存入計時（前賢在確認/編輯時不自動存）
  ['touchstart', 'click', 'input'].forEach(evt => {
    document.addEventListener(evt, () => {
      if (autoSaveTimer) startAutoSave();
    });
  });
}

// 日記語音潤稿：DeepSeek 加標點 + 潤飾（需在家連本機伺服器）
async function polishText(text) {
  try {
    const resp = await fetch(`${SYNC_HOST}/api/polish`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({text})
    });
    const data = await resp.json();
    if (data.ok && data.text) return data.text;
  } catch(e) {}
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
  getItems('expense').unshift({
    id: uid(), store, item: extractItem(text, store), text, amount, date: today(),
    source: 'voice', type: isIncome ? 'income' : 'expense'
  });
}

// 新增目前頁面的內容（新增按鈕 + 語音自動存入共用）
function submitAddText() {
  clearAutoSave();
  const addText = document.getElementById('addText');
  if (!addText) return;
  const text = addText.value.trim();
  if (!text) return;
  const cat = appData.categories.find(c => c.id === currentTab) || appData.categories[0];
  if (!cat) return;
  const isExpense = cat.id === 'expense';
  if (isExpense) {
    const amt = parseAmount(text);
    addExpense(text, amt);
  } else {
    getItems(cat.id).unshift({id: uid(), text, date: cat.id === 'diary' ? nowStamp() : today(), source: 'manual', completed: false});
  }
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

function expenseCat(store, text) {
  const s = (store + ' ' + (text || '')).toLowerCase();
  // 道場（優先）
  if (/道場|佛堂|法會|辦道|供品|香燭|點傳|前賢|道親|發一|崇德|素食餐廳|素菜館/.test(s)) return '道場';
  // 行
  if (/中油|加油站|加油|汽油|柴油|捷運|高鐵|台鐵|客運|公車|計程車|小黃|停車|機車|汽車|油錢|悠遊卡|過路費|高鐵票|車票/.test(s)) return '行';
  // 住
  if (/房租|水電|電費|水費|瓦斯|第四台|網路費|家具|家電|修繕|裝潢|管理費|房屋|寢具|床墊/.test(s)) return '住';
  // 衣
  if (/衣服|上衣|褲子|鞋子|襪子|帽子|外套|飾品|配件|包包|皮包|皮帶|百貨/.test(s)) return '衣';
  // 食
  if (/全家|萊爾富|7-11|711|全聯|便利|超市|餐廳|便當|飲料|咖啡|早餐|午餐|晚餐|小吃|麵包|飯|菜|水果|肉|蛋|牛奶|豆漿|點心|夜市|鹹酥|速食|麥當勞|肯德基|披薩|餐飲|食堂/.test(s)) return '食';
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
  } else if (!dashboardOpen) {
    renderMain();
  }
  saveNav();
}

// 首頁：整合五項目重點摘要（收支/待辦/日記/靈感/養成好習慣）
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
        <h2>🏠 首頁</h2>
        <div class="home-links">
          <a class="home-link" href="https://kindhome.net/bentotable/" target="_blank" rel="noopener">🍱便當組合</a>
          <a class="home-link" href="https://kindhome.herokuapp.com/" target="_blank" rel="noopener">🏢凱鴻</a>
          <a class="home-link" href="https://www.google.com/maps?q=%E5%87%B1%E5%BE%B7%E8%81%96%E9%81%93%E9%99%A2" target="_blank" rel="noopener">🛕凱德</a>
        </div>
      </div>
      <div class="home-grid">
        <div class="home-card home-card-expense" onclick="goTab('expense')">
          <div class="home-card-title">💰 ${vMonth}月收支</div>
          <div class="home-sum-row">
            <div class="home-sum"><span class="home-sum-label">收入</span><b>NT$${incTotal.toLocaleString()}</b></div>
            <div class="home-sum"><span class="home-sum-label">支出</span><b>NT$${expTotal.toLocaleString()}</b></div>
            <div class="home-sum"><span class="home-sum-label">結餘</span><b class="${balance >= 0 ? 'home-pos' : 'home-neg'}">${balance < 0 ? '-' : ''}NT$${Math.abs(balance).toLocaleString()}</b></div>
          </div>
          <div class="home-sec-title">🍽️ 食衣住行比例</div>
          ${renderPieChart(catSum)}
        </div>
        <div class="home-card" onclick="goTab('todo')">
          <div class="home-card-title">✓ 待辦</div>
          ${topTodos.length
            ? topTodos.map(t => `<div class="home-line"><span class="todo-marker">▸</span>${escHtml((t.text || '').slice(0, 16))}</div>`).join('')
              + (pendingTodos.length > 3 ? `<div class="home-line home-line-more">另有 ${pendingTodos.length - 3} 筆未完成</div>` : '')
            : '<div class="home-line">全部完成 🎉</div>'}
        </div>
        <div class="home-card" onclick="goTab('diary')">
          <div class="home-card-title">📅 日記</div>
          ${topDiaries.length
            ? topDiaries.map(d => `<div class="home-line">${d.date || ''} ${escHtml((d.text || '').slice(0, 14))}</div>`).join('')
            : '<div class="home-line">尚無日記</div>'}
        </div>
        <div class="home-card" onclick="goTab('idea')">
          <div class="home-card-title">💡 靈感</div>
          <div class="home-line">${lastIdea ? escHtml((lastIdea.text || '').slice(0, 14)) : '尚無靈感'}</div>
        </div>
        <div class="home-card" onclick="goDashboard()">
          <div class="home-card-title">📊 養成好習慣</div>
          <div class="home-line">進入每日行動儀表板</div>
        </div>
      </div>
    </section>`;
}

// 首頁點卡片 → 跳到對應分類
function goTab(tabId) {
  homeOpen = false;
  hideDashboard();
  currentTab = tabId;
  editingId = null;
  renderAll();
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
    `<button class="nav-btn home-btn ${homeOpen?'active':''}" id="homeBtn" title="回首頁">🏠</button>` +
    appData.categories.map(c => `
    <button class="nav-btn ${(c.id===currentTab && !dashboardOpen && !homeOpen)?'active':''}" data-tab="${c.id}">
      ${c.icon} ${c.name.replace('事項','')}
    </button>
  `).join('') + `
    <button class="nav-btn add-cat-btn" title="新增類別">＋</button>
    <button class="nav-btn dash-btn ${dashboardOpen?'active':''}" id="dashBtn" title="養成好習慣（每日行動儀表板）">📊 習慣</button>`;

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

  // 養成好習慣：iframe 內嵌顯示，保留底部導航
  const dashBtn = document.getElementById('dashBtn');
  if (dashBtn) {
    dashBtn.addEventListener('click', () => {
      if (dashboardOpen) {
        hideDashboard();
        renderAll();
      } else {
        showDashboard();
      }
    });
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
    // 六個分類永遠顯示（沒花費顯示 $0）；每個分類下方有 toggle 顯示該分類明細
    const catHtml = EXPENSE_CATS.map(c => {
      const v = catSum[c] || 0;
      const catItems = expItems.filter(it => (it.cat || expenseCat(it.store, it.text)) === c);
      let detailHtml = '';
      if (c === '住' && MONTHLY_HOUSING > 0) {
        detailHtml += `<li class="cat-fixed"><span style="flex:1">固定（房租）</span><span style="font-weight:600;color:var(--danger)">-NT$${MONTHLY_HOUSING.toLocaleString()}</span></li>`;
      }
      detailHtml += catItems.map(it => (editingId === it.id ? renderEditForm(cat, it) : renderItem(cat, it))).join('');
      return `
        <div class="cat-row">
          <span class="cat-name">${c}</span>
          <span class="cat-bar"><span class="cat-fill" style="width:${Math.round(v/catMax*100)}%"></span></span>
          <span class="cat-amt">NT$${v.toLocaleString()}</span>
        </div>
        <button type="button" class="cat-toggle" onclick="toggleCatDetail(this)">明細</button>
        <ul class="cat-detail">${detailHtml || '<li class="cat-empty">本月無支出</li>'}</ul>`;
    }).join('');

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
      ${catHtml ? `<div class="cat-stats"><div class="cat-stats-title">支出分類總額</div>${catHtml}</div>` : ''}`;
    chartHtml = `
      <div class="chart-box">
        <div class="chart-title">📈 每日花費（${vMonth}月 1-${maxDay}日）</div>
        ${renderDailyChart(expItems, maxDay)}
      </div>`;
    // 本月過濾的列表
    items = monthItems;
  }

  // 列表（收支頁：支出已在分類明細中，列表只顯示收入）
  const listItems = isExpense ? items.filter(it => (it.type || 'expense') === 'income') : items;
  let listHtml = '';
  if (listItems.length === 0) {
    listHtml = isExpense ? '' : `<div class="card empty">尚無內容，用下方輸入框或語音新增</div>`;
  } else {
    const sorted = [...listItems].sort((a,b) => (b.date||'').localeCompare(a.date||''));
    listHtml = sorted.map(it => {
      if (editingId === it.id) {
        return renderEditForm(cat, it);
      }
      return renderItem(cat, it);
    }).join('');
  }

  // 新增輸入框（麥克風按鈕在輸入框旁）
  const micBtn = voiceSupported ? '<button id="micBtn" class="mic-btn" title="語音輸入">🎤</button>' : '';
  const addForm = isExpense
    ? `<div class="add-form">
         <textarea id="addText" rows="2" placeholder="例如：全家 買飲料 50元｜薪水 50000元"></textarea>
         ${micBtn}
         <button id="addBtn">新增</button>
       </div>`
    : `<div class="add-form">
         <textarea id="addText" rows="2" placeholder="輸入${cat.name}內容..."></textarea>
         ${micBtn}
         <button id="addBtn">新增</button>
       </div>`;

  main.innerHTML = `
    <section class="tab-content active">
      <h2>${cat.icon} ${cat.name}</h2>
      ${summaryHtml}
      <div id="itemList">${listHtml}</div>
      ${chartHtml}
      ${addForm}
    </section>`;

  // 綁定事件
  const addBtn = document.getElementById('addBtn');
  const addText = document.getElementById('addText');
  if (addBtn) {
    addBtn.addEventListener('click', () => submitAddText());
    addText.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addBtn.click(); }
    });
    addText.addEventListener('input', () => autoGrowInput(addText));
    autoGrowInput(addText);
  }

  // 列表事件
  const list = document.getElementById('itemList');
  if (list) {
    // 勾選
    list.querySelectorAll('.todo-check').forEach(el => {
      el.addEventListener('click', async () => {
        const it = items.find(i => i.id === el.dataset.id);
        if (!it) return;
        const checking = !it.completed;
        it.completed = checking;
        saveData();
        renderMain();

        // easynote 來源：勾選完成時回寫手機 easynote
        if (checking && it.source === 'easynote') {
          try {
            const resp = await fetch(`${SYNC_HOST}/api/todo-done`, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({text: it.text})
            });
            const result = await resp.json();
            if (!result.ok) {
              console.warn('easynote writeback fail:', result);
              alert(result.error || '回寫失敗（需手機解鎖、在家裡 WiFi）');
            }
          } catch (e) {
            alert('回寫失敗：需在家裡 WiFi');
          }
        }
      });
    });
    // 編輯（itemList 收入 + 分類明細支出）
    main.querySelectorAll('.edit-btn').forEach(el => {
      el.addEventListener('click', () => {
        editingId = el.dataset.id;
        renderMain();
      });
    });
    // 刪除（itemList 收入 + 分類明細支出）
    main.querySelectorAll('.del-btn').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const idx = items.findIndex(i => i.id === id);
        if (idx >= 0) {
          items.splice(idx, 1);
          saveData();
          renderMain();
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
        <button class="edit-btn" data-id="${it.id}">✏️</button>
        <button class="del-btn" data-id="${it.id}">🗑</button>
        ${itemsHtml}
      </li>`;
  }
  if (cat.id === 'todo') {
    return `
      <li>
        <span class="todo-check ${it.completed?'done':''}" data-id="${it.id}">✓</span>
        <span class="todo-text ${it.completed?'done':''}" style="flex:1"><span class="todo-marker">▸</span>${escHtml(it.text)}</span>
        <span style="font-size:0.7rem;color:var(--text2)">${it.date||''}</span>
        <button class="edit-btn" data-id="${it.id}">✏️</button>
        <button class="del-btn" data-id="${it.id}">🗑</button>
      </li>`;
  }
  return `
    <li>
      <span style="flex:1">
        ${escHtml(it.text)}
        <span class="meta">${it.date||''}</span>
      </span>
      <button class="edit-btn" data-id="${it.id}">✏️</button>
      <button class="del-btn" data-id="${it.id}">🗑</button>
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

// === 小工具 ===
function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// === Service Worker ===
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// === 啟動 ===
document.addEventListener('DOMContentLoaded', init);
