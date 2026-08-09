/* === 行事曆（Jorte 風格月視圖）=== */

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

function calEventsFor(dateStr) {
  const synced = (appData.syncEvents || []).filter(e => e.date === dateStr && calVisible(e.calendar));
  const local = (appData.calEvents || []).filter(e => e.date === dateStr);
  return {synced, local};
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
        <span class="cal-moy">${monthLabel}</span>
        <button id="calNext">›</button>
        <button id="calToday" class="cal-today-btn">今天</button>
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
      renderMain();
    };
    newEvBtn.addEventListener('click', add);
    newEvTitle.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  }

  main.querySelectorAll('.ev-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      appData.calEvents = (appData.calEvents || []).filter(e => e.id !== id);
      saveData();
      renderMain();
    });
  });
}
