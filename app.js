/* === 個人平台 PWA — 主邏輯（動態類別版） === */

const STORAGE_KEY = 'personal_platform_data_v2';

// 預設類別
const BUILTIN_CATEGORIES = [
  {id: 'todo',    name: '待辦事項', icon: '✓'},
  {id: 'diary',   name: '日記',     icon: '📅'},
  {id: 'expense', name: '收支',     icon: '💰'},
  {id: 'idea',    name: '靈感',     icon: '💡'}
];

// 資料結構
let appData = {
  categories: [...BUILTIN_CATEGORIES],
  items: {},          // catId -> [{id, text, completed?, store?, amount?, date, source}]
  calEvents: [],      // 本機新增的行事曆事件
  syncEvents: []      // 同步進來的行事曆事件
};

let currentTab = 'todo';
let editingId = null;  // 目前正在編輯的項目 id

// === 初始化 ===
async function init() {
  loadData();
  migrateOldData();
  await loadSyncData();
  renderAll();
  setupVoice();
  setupSyncButton();
}

// === 同步按鈕（🔄）===
const isLocalHost = location.hostname === '192.168.0.75';
const SYNC_HOST = isLocalHost ? location.origin : 'https://192.168.0.75:9443';

function setupSyncButton() {
  const btn = document.getElementById('syncBtn');
  const statusEl = document.getElementById('syncStatus');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.textContent = '⏳';
    statusEl.textContent = '同步中...';
    try {
      const resp = await fetch(`${SYNC_HOST}/sync`, {cache: 'no-store'});
      const result = await resp.json();
      if (result.ok) {
        // 重新載入最新資料（本機伺服器上的最新 JSON）
        await reloadSyncData();
        statusEl.textContent = '✓ 已更新';
      } else {
        statusEl.textContent = '✗ 同步失敗';
        console.warn('sync fail:', result);
      }
    } catch (e) {
      statusEl.textContent = '需在家裡 WiFi';
      // 非本機版：引導開本機版（同源 fetch 才不會被憑證擋）
      if (!isLocalHost) {
        setTimeout(() => {
          if (confirm('同步需要連到家裡的本機伺服器（192.168.0.75）。\n要打開本機版嗎？')) {
            window.open('https://192.168.0.75:9443', '_blank');
          }
        }, 500);
      }
    }
    btn.textContent = '🔄';
    setTimeout(() => { statusEl.textContent = ''; }, 4000);
  });
}

// 從本機伺服器重新載入同步資料（GitHub Pages 版改抓本機，速度最快）
async function reloadSyncData() {
  try {
    const invRes = await fetch(`${SYNC_HOST}/data/invoices.json`, {cache: 'no-store'});
    if (invRes.ok) {
      const invoices = await invRes.json();
      const expenseItems = getItems('expense');
      appData.items.expense = expenseItems.filter(e => e.source !== 'invoice');
      for (const inv of invoices) {
        appData.items.expense.push({
          id: inv.id, store: inv.store || '未知', text: inv.item || '',
          amount: inv.amount || 0, date: inv.date || '', source: 'invoice'
        });
      }
    }
  } catch(e) {}

  try {
    const todoRes = await fetch(`${SYNC_HOST}/data/todos.json`, {cache: 'no-store'});
    if (todoRes.ok) {
      const todosData = await todoRes.json();
      const todoItems = getItems('todo');
      appData.items.todo = todoItems.filter(t => t.source !== 'easynote');
      for (const item of todosData.items || []) {
        appData.items.todo.push({
          id: 'esynote_' + uid(), text: item.text,
          completed: item.completed || false, date: today(), source: 'easynote'
        });
      }
    }
  } catch(e) {}

  // 行事曆事件
  try {
    const calRes = await fetch(`${SYNC_HOST}/data/calendar.json`, {cache: 'no-store'});
    if (calRes.ok) {
      const calData = await calRes.json();
      appData.syncEvents = calData.events || [];
    }
  } catch(e) {}

  saveData();
  renderAll();
}

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

// === 同步資料 ===
async function loadSyncData() {
  try {
    const invRes = await fetch('data/invoices.json');
    if (invRes.ok) {
      const invoices = await invRes.json();
      const expenseItems = getItems('expense');
      const existingIds = new Set(expenseItems.filter(e=>e.source==='invoice').map(e=>e.id));
      for (const inv of invoices) {
        if (!existingIds.has(inv.id)) {
          expenseItems.push({
            id: inv.id,
            store: inv.store || '未知',
            text: inv.item || '',
            amount: inv.amount || 0,
            date: inv.date || '',
            source: 'invoice'
          });
        }
      }
    }
  } catch(e) {}

  try {
    const todoRes = await fetch('data/todos.json');
    if (todoRes.ok) {
      const todosData = await todoRes.json();
      const todoItems = getItems('todo');
      const existingTexts = new Set(todoItems.filter(t=>t.source==='easynote').map(t=>t.text));
      for (const item of todosData.items || []) {
        if (!existingTexts.has(item.text)) {
          todoItems.push({
            id: 'esynote_'+uid(),
            text: item.text,
            completed: item.completed || false,
            date: today(),
            source: 'easynote'
          });
        }
      }
    }
  } catch(e) {}

  // 行事曆事件
  try {
    const calRes = await fetch('data/calendar.json');
    if (calRes.ok) {
      const calData = await calRes.json();
      appData.syncEvents = calData.events || [];
    }
  } catch(e) {}

  saveData();
  document.getElementById('syncStatus').textContent = '已同步';
}

// === 語音輸入 ===
function setupVoice() {
  const btn = document.getElementById('voiceBtn');
  const resultDiv = document.getElementById('voiceResult');
  const voiceText = document.getElementById('voiceText');
  const categorySelect = document.getElementById('categorySelect');
  const saveBtn = document.getElementById('saveVoice');
  const cancelBtn = document.getElementById('cancelVoice');

  // 填入分類選單
  categorySelect.innerHTML = appData.categories.map(c =>
    `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    btn.style.display = 'none';
    return;
  }

  let recognition = null;
  let finalText = '';
  let stoppedByUser = false;

  function stopListening() {
    btn.classList.remove('listening');
    btn.textContent = '🎤';
    if (finalText.trim()) {
      voiceText.textContent = finalText.trim();
      const auto = classifyText(finalText.trim());
      if (categorySelect.querySelector(`option[value="${auto}"]`)) {
        categorySelect.value = auto;
      }
    }
  }

  function startListening() {
    stoppedByUser = false;
    recognition = new SpeechRecognition();
    recognition.lang = 'zh-TW';
    recognition.interimResults = true;
    recognition.continuous = false;   // 關鍵：每段話乾淨單一結果，不重複

    btn.classList.add('listening');
    btn.textContent = '🔴';

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) {
          finalText += r[0].transcript;
        } else {
          interim += r[0].transcript;
        }
      }
      voiceText.textContent = finalText + interim;
      resultDiv.classList.remove('hidden');
    };

    recognition.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        stopListening();
      }
    };

    recognition.onend = () => {
      if (!stoppedByUser) {
        // 沒按停止 → 自動續聽（無縫接下一段話）
        setTimeout(startListening, 400);
      } else {
        stopListening();
      }
    };

    recognition.start();
  }

  btn.addEventListener('click', () => {
    if (recognition && btn.classList.contains('listening')) {
      stoppedByUser = true;
      recognition.stop();
      return;
    }
    if (btn.classList.contains('listening')) return;
    finalText = '';
    startListening();
  });

  saveBtn.addEventListener('click', () => {
    const text = voiceText.textContent.trim();
    const catId = categorySelect.value;
    if (!text) return;

    if (catId === 'expense') {
      const amtMatch = text.match(/(\d+)\s*元/);
      addExpense(text, amtMatch ? parseInt(amtMatch[1]) : 0);
    } else {
      getItems(catId).unshift({
        id: uid(), text, date: today(), source: 'voice', completed: false
      });
    }
    saveData();
    renderAll();
    resultDiv.classList.add('hidden');
    voiceText.textContent = '';
  });

  cancelBtn.addEventListener('click', () => {
    resultDiv.classList.add('hidden');
    voiceText.textContent = '';
  });
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

function addExpense(text, amount) {
  const store = detectStore(text);
  // 收入偵測：薪水/獎金/紅包/賣了/退款/中獎等
  const isIncome = /收入|賺了|賺到|領到|領錢|薪水|薪資|獎金|紅包|賣了|退款|退費|中獎|理賠/.test(text);
  getItems('expense').unshift({
    id: uid(), store, item: extractItem(text, store), text, amount, date: today(),
    source: 'voice', type: isIncome ? 'income' : 'expense'
  });
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

// 每日花費曲線圖（SVG 直條圖）
function renderDailyChart(monthItems, maxDay) {
  const daily = new Array(maxDay + 1).fill(0);
  for (const it of monthItems) {
    const d = dayOf(it.date);
    if (d >= 1 && d <= maxDay) daily[d] += (it.amount || 0);
  }
  const max = Math.max(...daily.slice(1), 1);
  const W = 340, H = 120, pad = 6;
  const barW = (W - pad * 2) / maxDay;
  let bars = '';
  for (let d = 1; d <= maxDay; d++) {
    const h = Math.max(3, (daily[d] / max) * (H - 24));
    const x = pad + (d - 1) * barW;
    const y = H - 4 - h;
    bars += `<rect x="${x}" y="${y}" width="${Math.max(barW - 2, 1)}" height="${h}" rx="2" fill="${daily[d] ? '#f59e0b' : '#f0e0cc'}">
      <title>${d}日：$${daily[d].toLocaleString()}</title></rect>`;
    if (d % 5 === 0 || d === maxDay) {
      bars += `<text x="${x + 1}" y="${H - 1}" font-size="8" fill="#8b7355">${d}</text>`;
    }
  }
  // 最大值標示
  if (max > 1) {
    bars += `<text x="${W - 40}" y="10" font-size="9" fill="#d97706" text-anchor="end">$${max.toLocaleString()}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" preserveAspectRatio="xMidYMid meet">${bars}</svg>`;
}

// === 渲染 ===
function renderAll() {
  renderNav();
  renderMain();
}

function renderNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = `
    <button class="nav-btn ${currentTab==='calendar'?'active':''}" data-tab="calendar">🗓️ 行事曆</button>` +
    appData.categories.map(c => `
    <button class="nav-btn ${c.id===currentTab?'active':''}" data-tab="${c.id}">
      ${c.icon} ${c.name.replace('事項','')}
    </button>
  `).join('') + `
    <button class="nav-btn add-cat-btn" title="新增類別">＋</button>
    <button class="nav-btn dash-btn" id="dashBtn" title="每日行動儀表板">📊 儀表板</button>`;

  nav.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      editingId = null;
      renderAll();
    });
  });

  nav.querySelector('.add-cat-btn').addEventListener('click', addCategory);

  // 儀表板切換：在 iframe 內→關閉上層遮罩；獨立開→直接跳轉
  const dashBtn = document.getElementById('dashBtn');
  if (dashBtn) {
    dashBtn.addEventListener('click', () => {
      if (window.self !== window.top) {
        try {
          window.top.document.getElementById('ppOverlay').style.display = 'none';
          return;
        } catch(e) {}
      }
      window.location.href = 'https://richfly2u.github.io/daily-dashboard/';
    });
  }
}

function renderMain() {
  // 行事曆
  if (currentTab === 'calendar') { renderCalendarMain(); return; }

  const main = document.getElementById('main');
  const cat = appData.categories.find(c => c.id === currentTab) || appData.categories[0];
  if (!cat) return;

  let items = getItems(cat.id);
  const isExpense = cat.id === 'expense';

  // 收支摘要（本月份 + 收入支出表 + 分類 + 每日曲線圖）
  let summaryHtml = '';
  if (isExpense) {
    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const maxDay = now.getDate();
    const monthItems = items.filter(it => monthOf(it.date) === curMonth);
    // 收入/支出分開
    const expItems = monthItems.filter(it => (it.type || 'expense') !== 'income');
    const incItems = monthItems.filter(it => (it.type || 'expense') === 'income');
    const expTotal = expItems.reduce((s, e) => s + (e.amount || 0), 0);
    const incTotal = incItems.reduce((s, e) => s + (e.amount || 0), 0);
    const balance = incTotal - expTotal;

    // 支出分類統計（食衣住行道場）
    const catSum = {};
    for (const it of expItems) {
      const c = it.cat || expenseCat(it.store, it.text);
      catSum[c] = (catSum[c] || 0) + (it.amount || 0);
    }
    const catMax = Math.max(...Object.values(catSum), 1);
    const catHtml = EXPENSE_CATS.map(c => {
      const v = catSum[c] || 0;
      if (v === 0) return '';
      return `
        <div class="cat-row">
          <span class="cat-name">${c}</span>
          <span class="cat-bar"><span class="cat-fill" style="width:${Math.round(v/catMax*100)}%"></span></span>
          <span class="cat-amt">$${v.toLocaleString()}</span>
        </div>`;
    }).join('');

    summaryHtml = `
      <div id="expenseSummary">
        <div class="label">${curMonth} 月收支</div>
        <div class="summary-row">
          <div class="sum-col"><span class="sum-label">收入</span><span class="sum-income">$${incTotal.toLocaleString()}</span></div>
          <div class="sum-col"><span class="sum-label">支出</span><span class="sum-expense">$${expTotal.toLocaleString()}</span></div>
          <div class="sum-col"><span class="sum-label">結餘</span><span class="sum-balance ${balance>=0?'pos':'neg'}">$${balance.toLocaleString()}</span></div>
        </div>
        <div class="label">${monthItems.length} 筆（本月）</div>
      </div>
      ${catHtml ? `<div class="cat-stats"><div class="cat-stats-title">支出分類總額</div>${catHtml}</div>` : ''}
      <div class="chart-box">
        <div class="chart-title">📈 每日花費（${curMonth}月 1-${maxDay}日）</div>
        ${renderDailyChart(expItems, maxDay)}
      </div>`;
    // 本月過濾的列表
    items = monthItems;
  }

  // 列表
  let listHtml = '';
  if (items.length === 0) {
    listHtml = `<div class="card empty">尚無內容，用下方輸入框或語音新增</div>`;
  } else {
    const sorted = [...items].sort((a,b) => (b.date||'').localeCompare(a.date||''));
    listHtml = sorted.map(it => {
      if (editingId === it.id) {
        return renderEditForm(cat, it);
      }
      return renderItem(cat, it);
    }).join('');
  }

  // 新增輸入框
  const addForm = isExpense
    ? `<div class="add-form">
         <input id="addText" placeholder="例如：全家 買飲料 50元｜薪水 50000元">
         <button id="addBtn">新增</button>
       </div>`
    : `<div class="add-form">
         <input id="addText" placeholder="輸入${cat.name}內容...">
         <button id="addBtn">新增</button>
       </div>`;

  main.innerHTML = `
    <section class="tab-content active">
      <h2>${cat.icon} ${cat.name}</h2>
      ${summaryHtml}
      <div id="itemList">${listHtml}</div>
      ${addForm}
    </section>`;

  // 綁定事件
  const addBtn = document.getElementById('addBtn');
  const addText = document.getElementById('addText');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const text = addText.value.trim();
      if (!text) return;
      if (isExpense) {
        const amt = text.match(/(\d+)\s*元/);
        addExpense(text, amt ? parseInt(amt[1]) : 0);
      } else {
        getItems(cat.id).unshift({id: uid(), text, date: today(), source: 'manual', completed: false});
      }
      saveData();
      renderMain();
    });
    addText.addEventListener('keydown', e => {
      if (e.key === 'Enter') addBtn.click();
    });
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
    // 編輯
    list.querySelectorAll('.edit-btn').forEach(el => {
      el.addEventListener('click', () => {
        editingId = el.dataset.id;
        renderMain();
      });
    });
    // 刪除
    list.querySelectorAll('.del-btn').forEach(el => {
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
    return `
      <li>
        <span style="flex:1">
          <strong>${escHtml(mainName)}</strong>
          ${subText ? `<span style="font-size:0.8rem;color:var(--text2);display:block">${escHtml(subText)}</span>` : ''}
        </span>
        <span class="cat-badge cat-${c === '收入' ? 'income' : c}">${c}</span>
        <span style="font-weight:600;color:${isIncome ? 'var(--success)' : 'var(--danger)'}">${isIncome ? '+' : '-'}$${it.amount||0}</span>
        <span style="font-size:0.7rem;color:var(--text2)">${it.date||''}</span>
        <button class="edit-btn" data-id="${it.id}">✏️</button>
        <button class="del-btn" data-id="${it.id}">🗑</button>
      </li>`;
  }
  if (cat.id === 'todo') {
    return `
      <li>
        <span class="todo-check ${it.completed?'done':''}" data-id="${it.id}">✓</span>
        <span class="todo-text ${it.completed?'done':''}" style="flex:1">${escHtml(it.text)}</span>
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
