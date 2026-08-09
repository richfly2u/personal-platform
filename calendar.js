/* === 行事曆（Jorte 風格月視圖）=== */

// === 農曆計算（1900-2100，標準陰陽曆查表法）===
const lunarInfo = [0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,0x06ca0,0x0b550,0x15355,0x04da0,0x0a5d0,0x14573,0x052d0,0x0a9a8,0x0e950,0x06aa0,0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x055c0,0x0ab60,0x096d5,0x092e0,0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0];

function lYearDays(y) {
  let i, sum = 348;
  for (i = 0x8000; i > 0x8; i >>= 1) sum += (lunarInfo[y - 1900] & i) ? 1 : 0;
  return sum + leapDays(y);
}
function leapMonth(y) { return lunarInfo[y - 1900] & 0xf; }
function leapDays(y) {
  if (leapMonth(y)) return (lunarInfo[y - 1900] & 0x10000) ? 30 : 29;
  return 0;
}
function monthDays(y, m) { return (lunarInfo[y - 1900] & (0x10000 >> m)) ? 30 : 29; }

// 陽曆 y/m/d → 陰曆 {year, month, day, isLeap}
function lunarDate(y, m, d) {
  const base = new Date(1900, 0, 31).getTime();
  const target = new Date(y, m - 1, d).getTime();
  let offset = Math.floor((target - base) / 86400000);
  let i, temp = 0, lm = 0, isLeap = false, year;
  for (i = 1900; i < 2101 && offset > 0; i++) {
    temp = lYearDays(i);
    offset -= temp;
  }
  if (offset < 0) { offset += temp; i--; }
  year = i;
  lm = leapMonth(year);
  for (i = 1; i < 13 && offset > 0; i++) {
    if (lm > 0 && i === (lm + 1) && !isLeap) { --i; isLeap = true; temp = leapDays(year); }
    else { temp = monthDays(year, i); }
    if (isLeap && i === (lm + 1)) isLeap = false;
    offset -= temp;
  }
  if (offset === 0 && lm > 0 && i === lm + 1) {
    if (isLeap) { isLeap = false; } else { isLeap = true; --i; }
  }
  if (offset < 0) { offset += temp; --i; }
  return { year, month: i, day: offset + 1, isLeap };
}

const nStr1 = ['日','一','二','三','四','五','六','七','八','九','十'];
const lMonNames = ['正','二','三','四','五','六','七','八','九','十','冬','臘'];

function lunarDayName(day) {
  if (day === 10) return '初十';
  if (day === 20) return '二十';
  if (day === 30) return '三十';
  const n = day < 10 ? '初' : (day < 20 ? '十' : '廿');
  return n + nStr1[day % 10];
}
function lunarMonthName(month, isLeap) {
  return (isLeap ? '閏' : '') + lMonNames[month - 1] + '月';
}

// 行事曆顏色對照
const CAL_COLORS = {
  'alan行事曆': '#f59e0b',
  '道場行事曆': '#6c5ce7',
  '一貫道祭典': '#a855f7',
  '家族': '#ec4899',
  '凱鴻素食': '#10b981',
  '農曆': '#9ca3af',
  '我的行程': '#3b82f6'
};
function calColor(name) {
  if (CAL_COLORS[name]) return CAL_COLORS[name];
  if (/節|假|農曆|holiday/i.test(name)) return '#d1d5db';  // 節日灰色
  return '#94a3b8';
}

// 是否顯示該行事曆（節日可選隱藏）
function calVisible(name) {
  return !(/節慶|节假日|Holidays|農曆/.test(name));
}

let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();   // 0-based
let calSelectedDay = null;              // 'YYYY-MM-DD'

// 回寫行事曆到手機（Jorte 小工具即時顯示）
async function postCal(mode, title, date) {
  try {
    const resp = await fetch(`${SYNC_HOST}/api/cal-${mode}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({title, date})
    });
    const data = await resp.json();
    if (!data.ok) console.log('行事曆回寫失敗:', data.error);
  } catch(e) {
    console.log('行事曆回寫需在家裡 WiFi:', e.message);
  }
}

function calEventsFor(dateStr) {
  const synced = (appData.syncEvents || []).filter(e => e.date === dateStr && calVisible(e.calendar));
  const local = (appData.calEvents || []).filter(e => e.date === dateStr);
  // 去重：本機已存在的行程（同 title），不重複顯示同步版
  const localKeys = new Set(local.map(e => e.title));
  const syncedDedup = synced.filter(e => !localKeys.has(e.title));
  return {synced: syncedDedup, local};
}

function renderCalendarMain() {
  const main = document.getElementById('main');
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  // 月曆資料
  const firstDay = new Date(calYear, calMonth, 1);
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const startWeekday = firstDay.getDay();  // 0=日
  const monthLabel = `${calYear}年${calMonth+1}月`;
  const lunFirst = lunarDate(calYear, calMonth + 1, 1);
  const lunMonthLabel = `農曆${lunarMonthName(lunFirst.month, lunFirst.isLeap)}`;

  // 事件索引：date -> events
  const syncedByDate = {};
  for (const e of appData.syncEvents || []) {
    if (!calVisible(e.calendar)) continue;
    (syncedByDate[e.date] = syncedByDate[e.date] || []).push(e);
  }
  const localByDate = {};
  for (const e of appData.calEvents || []) {
    (localByDate[e.date] = localByDate[e.date] || []).push(e);
  }

  // 月格
  let cells = '';
  for (let i = 0; i < startWeekday; i++) {
    cells += '<div class="cal-cell empty"></div>';
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const synced = syncedByDate[ds] || [];
    const local = localByDate[ds] || [];
    const isToday = ds === todayStr;
    const isSel = ds === calSelectedDay;
    // 陰曆
    const lun = lunarDate(calYear, calMonth + 1, d);
    const isLunarMonthStart = lun.day === 1;
    const lunLabel = isLunarMonthStart ? lunarMonthName(lun.month, lun.isLeap) : lunarDayName(lun.day);
    let chips = '';
    for (const e of synced.slice(0, 2)) {
      chips += `<span class="cal-chip" style="background:${calColor(e.calendar)}">${escHtml(e.title)}</span>`;
    }
    for (const e of local.slice(0, 2)) {
      chips += `<span class="cal-chip" style="background:${calColor(e.calendar)}">${escHtml(e.title)}</span>`;
    }
    if (synced.length + local.length > 2) chips += `<span class="cal-more">+${synced.length+local.length-2}</span>`;
    cells += `<div class="cal-cell ${isToday?'today':''} ${isSel?'selected':''}" data-day="${ds}">
      <span class="cal-num">${d}</span>
      <span class="cal-lunar ${isLunarMonthStart?'lunar-mstart':''}">${lunLabel}</span>
      ${chips}
    </div>`;
  }

  // 選定日事件清單
  let dayDetail = '';
  if (calSelectedDay) {
    const {synced, local} = calEventsFor(calSelectedDay);
    const items = [
      ...synced.map(e => `<div class="ev-row"><span class="ev-dot" style="background:${calColor(e.calendar)}"></span><span class="ev-title">${escHtml(e.title)}</span><span class="ev-cal">${escHtml(e.calendar)}</span></div>`),
      ...local.map(e => `<div class="ev-row"><span class="ev-dot" style="background:${calColor(e.calendar)}"></span><span class="ev-title">${escHtml(e.title)}</span><button class="del-btn ev-del" data-id="${e.id}">🗑</button></div>`)
    ];
    dayDetail = `
      <div class="day-detail">
        <div class="day-title">${calSelectedDay} 的行程（${items.length}）</div>
        ${items.length ? items.join('') : '<div class="ev-empty">當天無行程</div>'}
        <div class="add-event-row">
          <input id="newEvTitle" placeholder="新增行程...">
          <button id="newEvBtn">＋</button>
        </div>
      </div>`;
  }

  main.innerHTML = `
    <section class="tab-content active">
      <h2>🗓️ 行事曆</h2>
      <div class="cal-nav">
        <button id="calPrev">‹</button>
        <span class="cal-moy">${monthLabel}<small class="cal-lunmon">${lunMonthLabel}</small></span>
        <button id="calNext">›</button>
        <button id="calToday" class="cal-today-btn">今天</button>
        <button id="calAddBtn" class="cal-add-btn" title="新增行程">＋</button>
      </div>
      <div class="cal-weekdays">
        <span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span>
      </div>
      <div class="cal-grid">${cells}</div>
      ${dayDetail}
    </section>`;

  // 事件綁定
  document.getElementById('calPrev').addEventListener('click', () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } calSelectedDay = null; renderMain(); });
  document.getElementById('calNext').addEventListener('click', () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } calSelectedDay = null; renderMain(); });
  document.getElementById('calToday').addEventListener('click', () => {
    const t = new Date();
    calYear = t.getFullYear(); calMonth = t.getMonth();
    calSelectedDay = todayStr; renderMain();
  });
  // ＋ 新增：沒選日期就預設今天，開輸入框並聚焦
  document.getElementById('calAddBtn').addEventListener('click', () => {
    calSelectedDay = calSelectedDay || todayStr;
    renderMain();
    const inp = document.getElementById('newEvTitle');
    if (inp) { inp.focus(); inp.scrollIntoView({behavior: 'smooth', block: 'center'}); }
  });
  main.querySelectorAll('.cal-cell[data-day]').forEach(cell => {
    cell.addEventListener('click', () => {
      calSelectedDay = cell.dataset.day;
      renderMain();
    });
  });

  const newEvBtn = document.getElementById('newEvBtn');
  const newEvTitle = document.getElementById('newEvTitle');
  if (newEvBtn) {
    const add = () => {
      const title = newEvTitle.value.trim();
      if (!title) return;
      if (!appData.calEvents) appData.calEvents = [];
      appData.calEvents.push({id: uid(), title, date: calSelectedDay, calendar: '我的行程'});
      saveData();
      postCal('add', title, calSelectedDay);   // 回寫手機行事曆
      renderMain();
    };
    newEvBtn.addEventListener('click', add);
    newEvTitle.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  }

  main.querySelectorAll('.ev-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const ev = (appData.calEvents || []).find(e => e.id === id);
      appData.calEvents = (appData.calEvents || []).filter(e => e.id !== id);
      saveData();
      if (ev) postCal('del', ev.title, ev.date);   // 同步刪除手機行事曆
      renderMain();
    });
  });
}
