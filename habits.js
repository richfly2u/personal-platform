/* === 習慣模組（原生，整合自 kindhome.net/habits v2.0） ================
   特色：
   - 打勾 / 數字累計（目標+單位）/ 計時（同日累計）
   - 連續天數即時重算、最佳紀錄、30 天達標率、12 週熱圖
   - 本週列一鍵跳日、月曆補打卡
   - 頻率：每天 / 指定星期 / 每週 N 次
   - 常用範本、長名稱兩行不截斷
   - 資料存在本機（habit.v2），可匯出/匯入與 kindhome.net/habits 互通
   ==================================================================== */
(function () {
  "use strict";

  const KEY = "habit.v2";
  const WD = ["日", "一", "二", "三", "四", "五", "六"];
  const WEEKDAYS = [1, 2, 3, 4, 5];
  const EMOJIS = ["💧", "🏃", "📖", "🧘", "🥗", "😴", "✍️", "🎯", "🧹", "💊", "🌱", "🪥", "📵", "🙏", "🏋️", "🚶", "☀️", "🌙"];
  const COLORS = ["#f59e0b", "#3b82f6", "#ec4899", "#10b981", "#8b5cf6", "#ef4444", "#14b8a6", "#f97316"];
  const TEMPLATES = [
    { name: "喝水", emoji: "💧", kind: "count", target: 2000, unit: "ml", color: "#3b82f6" },
    { name: "運動", emoji: "🏃", kind: "timer", target: 1800, unit: "分", color: "#10b981" },
    { name: "閱讀", emoji: "📖", kind: "timer", target: 1200, unit: "分", color: "#f59e0b" },
    { name: "冥想", emoji: "🧘", kind: "timer", target: 600, unit: "分", color: "#8b5cf6" },
    { name: "蔬果", emoji: "🥗", kind: "count", target: 5, unit: "份", color: "#10b981" },
    { name: "早睡", emoji: "😴", kind: "check", target: 1, unit: "", color: "#3b82f6" },
    { name: "不滑手機", emoji: "📵", kind: "check", target: 1, unit: "", color: "#ef4444" },
    { name: "讀經", emoji: "🙏", kind: "check", target: 1, unit: "", color: "#f59e0b" }
  ];

  const DEFAULT = { v: 2, habits: [], logs: {}, settings: { notify: false, nudge: "21:00" }, running: null };
  let S = null;
  let host = null;              // 容器
  let view = "today";
  let calCursor = null, calSel = null;
  let editing = null, draft = null, vHabit = null, vKey = null, vVal = 0;
  let oldDashCb = null;

  /* ---------- 日期（一律本地時間） ---------- */
  const dayKey = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const keyToDate = k => { const p = k.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const startOfMonth = d => new Date(d.getFullYear(), d.getMonth(), 1);
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const startOfWeek = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - x.getDay()); return x; };
  const isFuture = k => k > dayKey(new Date());
  const today = () => dayKey(new Date());

  /* ---------- 儲存 ---------- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function normalize(o) {
    o = o || {};
    o.v = 2;
    o.habits = Array.isArray(o.habits) ? o.habits : [];
    o.logs = (o.logs && typeof o.logs === "object") ? o.logs : {};
    o.settings = Object.assign({ notify: false, nudge: "21:00" }, o.settings || {});
    o.habits.forEach((h, i) => {
      if (typeof h.order !== "number") h.order = i;
      if (!h.freq) h.freq = { type: "daily" };
      if (!h.kind) h.kind = "check";
      if (typeof h.target !== "number" || h.target <= 0) h.target = h.kind === "timer" ? 1800 : 1;
      if (typeof h.unit !== "string") h.unit = h.kind === "timer" ? "分" : "";
    });
    return o;
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return normalize(JSON.parse(raw));
      // 舊版 v1（kindhome 早期格式）自動遷移
      const old = localStorage.getItem("habit.v1");
      if (old) {
        const v1 = JSON.parse(old);
        const o = { v: 2, habits: [], logs: {}, settings: v1.settings || {}, running: null };
        (v1.habits || []).forEach((h, i) => o.habits.push(Object.assign({}, h, { kind: "check", unit: "", target: 1, order: typeof h.order === "number" ? h.order : i })));
        Object.keys(v1.logs || {}).forEach(hid => {
          o.logs[hid] = {};
          Object.keys(v1.logs[hid]).forEach(k => { const v = v1.logs[hid][k]; o.logs[hid][k] = typeof v === "number" ? v : (v ? 1 : 0); });
        });
        localStorage.setItem(KEY, JSON.stringify(o));
        return normalize(o);
      }
    } catch (e) {}
    return clone(DEFAULT);
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast("儲存失敗：空間不足"); } }

  /* ---------- 資料邏輯 ---------- */
  const activeHabits = () => S.habits.filter(h => !h.archived).sort((a, b) => a.order - b.order);
  function val(h, k) { const m = S.logs[h.id]; const v = m && m[k]; return typeof v === "number" ? v : (v ? 1 : 0); }
  function setVal(h, k, v) {
    S.logs[h.id] = S.logs[h.id] || {};
    if (!v) delete S.logs[h.id][k]; else S.logs[h.id][k] = v;
    save();
  }
  function isDone(h, k) {
    const v = val(h, k);
    if (h.kind === "count") return v >= (h.target || 1);
    if (h.kind === "timer") return v >= Math.max(1, h.target || 60);
    return v > 0;
  }
  function isScheduled(h, d) {
    if (h.archived) return false;
    const f = h.freq || { type: "daily" };
    if (f.type === "daily") return true;
    if (f.type === "days") return (f.days || []).includes(d.getDay());
    return true;
  }
  function weekCount(h, d) {
    const s = startOfWeek(d); let n = 0;
    for (let i = 0; i < 7; i++) if (isDone(h, dayKey(addDays(s, i)))) n++;
    return n;
  }
  function streak(h) {
    const f = h.freq || { type: "daily" };
    if (f.type === "weekly") {
      let n = 0, d = addDays(new Date(), -7);
      while (n < 520) { if (weekCount(h, d) >= (f.n || 3)) { n++; d = addDays(d, -7); } else break; }
      if (weekCount(h, new Date()) >= (f.n || 3)) n++;
      return n;
    }
    let n = 0, d = new Date();
    if (!isDone(h, dayKey(d))) d = addDays(d, -1);
    for (let i = 0; i < 3650; i++) {
      if (isScheduled(h, d)) { if (isDone(h, dayKey(d))) n++; else break; }
      d = addDays(d, -1);
    }
    return n;
  }
  function bestStreak(h) {
    const f = h.freq || { type: "daily" };
    const keys = Object.keys(S.logs[h.id] || {}).filter(k => isDone(h, k)).sort();
    if (!keys.length) return 0;
    if (f.type === "weekly") {
      const w = [...new Set(keys.map(k => dayKey(startOfWeek(keyToDate(k)))))].sort();
      let best = 0, cur = 0, prev = null;
      w.forEach(x => { if (prev && dayKey(addDays(keyToDate(prev), 7)) === x) cur++; else cur = 1; best = Math.max(best, cur); prev = x; });
      return best;
    }
    let best = 0, cur = 0, prev = null;
    keys.forEach(k => {
      const d = keyToDate(k);
      if (!isScheduled(h, d)) return;
      if (prev && dayKey(addDays(keyToDate(prev), 1)) === k) cur++; else cur = 1;
      best = Math.max(best, cur); prev = k;
    });
    return best;
  }
  function rate30(h) {
    let sched = 0, done = 0, d = new Date(), tk = today();
    for (let i = 0; i < 30; i++) {
      const k = dayKey(d);
      if (isScheduled(h, d) && k <= tk) { sched++; if (isDone(h, k)) done++; }
      d = addDays(d, -1);
    }
    return sched ? Math.round(done / sched * 100) : 0;
  }
  const dueToday = () => activeHabits().filter(h => isScheduled(h, new Date()));
  const numFmt = v => Number.isInteger(v) ? v.toLocaleString("en-US") : v.toLocaleString("en-US", { maximumFractionDigits: 1 });
  function fmtVal(h, v) {
    if (h.kind === "timer") { const m = Math.floor(v / 60), s = v % 60; return s ? m + "分" + String(s).padStart(2, "0") + "秒" : m + "分"; }
    if (h.kind === "count") return numFmt(v) + (h.unit || "");
    return "";
  }
  function hintText(h) {
    if (h.kind === "timer") return "今日 " + fmtVal(h, val(h, today())) + " / 目標 " + Math.round((h.target || 1800) / 60) + "分";
    if (h.kind === "count") return "今日 " + fmtVal(h, val(h, today())) + " / 目標 " + fmtVal(h, h.target || 1);
    return "";
  }
  const esc = s => String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  /* ---------- 樣式（只注入一次） ---------- */
  function injectCSS() {
    if (document.getElementById("hb-style")) return;
    const st = document.createElement("style");
    st.id = "hb-style";
    st.textContent = `
.hb-wrap{padding:4px 0 8px}
.hb-top{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;padding:6px 2px 10px}
.hb-d1{font-size:1.35rem;font-weight:700;color:var(--text)}
.hb-d2{font-size:.78rem;color:var(--text2);margin-top:2px}
.hb-ring{width:52px;height:52px;position:relative;flex:0 0 auto}
.hb-ring .pct{position:absolute;inset:0;display:grid;place-items:center;font-size:.72rem;font-weight:700}
.hb-seg{display:flex;gap:6px;margin:2px 0 10px}
.hb-seg button{flex:1;padding:8px 0;font-size:.82rem;border:1px solid var(--border);background:var(--card);border-radius:10px;color:var(--text2)}
.hb-seg button.on{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
.hb-week{display:flex;gap:5px;margin:0 0 8px}
.hb-ws{flex:1;border:1px solid var(--border);border-radius:9px;padding:5px 0 3px;text-align:center;font-size:.66rem;color:var(--text2);background:var(--card)}
.hb-ws b{display:block;font-size:.8rem;color:var(--text);margin-top:1px}
.hb-ws.on{border-color:var(--accent)}
.hb-ws .bar{height:3px;border-radius:2px;background:var(--border);margin:4px 4px 0;overflow:hidden}
.hb-ws .bar i{display:block;height:100%;background:var(--accent)}
.hb-sec{font-size:.72rem;letter-spacing:.1em;color:var(--text2);margin:14px 2px 6px}
.hb-card{background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.hb-row{display:flex;align-items:center;gap:10px;padding:11px 12px;border-bottom:1px solid var(--border)}
.hb-row:last-child{border-bottom:0}
.hb-em{width:34px;height:34px;display:grid;place-items:center;font-size:1.15rem;border-radius:50%;flex:0 0 auto;
  background:color-mix(in srgb,var(--c,#f59e0b) 18%,transparent)}
.hb-mid{flex:1;min-width:0}
.hb-name{font-size:.95rem;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.hb-sub{font-size:.72rem;color:var(--text2);margin-top:2px}
.hb-chk{width:42px;height:42px;border-radius:50%;border:2px solid #d8c9b4;display:grid;place-items:center;
  font-size:.68rem;font-weight:700;color:var(--text2);flex:0 0 auto;background:transparent}
.hb-chk.on{background:var(--c,#10b981);border-color:var(--c,#10b981);color:#fff}
.hb-chk.on::after{content:"✓";font-size:19px;font-weight:700}
.hb-chk.num.on::after{content:""}
.hb-empty{color:var(--text2);text-align:center;padding:18px 8px;font-size:.82rem}
.hb-fab{position:fixed;right:16px;bottom:78px;width:52px;height:52px;border-radius:50%;background:var(--accent);color:#fff;
  font-size:1.5rem;font-weight:600;display:grid;place-items:center;box-shadow:0 4px 14px rgba(245,158,11,.4);z-index:30;border:0}
.hb-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;padding:10px}
.hb-cal .wd{font-size:.66rem;color:var(--text2);text-align:center}
.hb-cal .d{aspect-ratio:1;display:grid;place-items:center;border-radius:9px;font-size:.8rem;background:var(--bg);border:1px solid transparent}
.hb-cal .d.out{background:transparent;color:transparent}
.hb-cal .d.today{border-color:var(--accent)}
.hb-cal .d.sel{background:#fde68a}
.hb-cal .d.fut{opacity:.4}
.hb-cal .d .dot{width:4px;height:4px;border-radius:50%;background:var(--accent);margin-top:2px}
.hb-kv{display:flex;gap:14px;margin-top:6px}
.hb-kv div{font-size:.68rem;color:var(--text2)}
.hb-kv b{display:block;font-size:.95rem;color:var(--text);font-weight:700}
.hb-heat{display:grid;grid-auto-flow:column;grid-template-rows:repeat(7,1fr);gap:3px;margin-top:8px}
.hb-heat i{width:8px;height:8px;border-radius:2px;background:var(--border);display:block}
.hb-heat i.on{background:var(--c,var(--accent))}
.hb-lrow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;border-bottom:1px solid var(--border)}
.hb-lrow:last-child{border-bottom:0}
.hb-lrow .t{font-size:.88rem}
.hb-lrow .s{font-size:.72rem;color:var(--text2);margin-top:2px}
.hb-btn{border:1px solid var(--border);border-radius:9px;padding:8px 12px;font-size:.8rem;background:var(--card);color:var(--text)}
.hb-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
.hb-btn.warn{color:var(--danger);border-color:#f5c2c2}
.hb-mask{position:fixed;inset:0;background:rgba(0,0,0,.42);display:none;z-index:40}
.hb-mask.on{display:block}
.hb-sheet{position:fixed;left:0;right:0;bottom:0;z-index:41;background:var(--card);border-radius:16px 16px 0 0;max-height:90vh;overflow:auto;
  transform:translateY(102%);transition:transform .22s ease;padding-bottom:calc(16px + env(safe-area-inset-bottom))}
.hb-sheet.on{transform:translateY(0)}
.hb-hd{display:flex;align-items:center;justify-content:space-between;padding:14px 14px 4px}
.hb-hd .t{font-size:.98rem;font-weight:700}
.hb-fld{padding:9px 14px}
.hb-fld label{display:block;font-size:.7rem;color:var(--text2);margin-bottom:5px}
.hb-inp{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:9px;padding:10px;font-size:.95rem;color:var(--text)}
.hb-chips{display:flex;flex-wrap:wrap;gap:6px}
.hb-chip{border:1px solid var(--border);border-radius:999px;padding:6px 11px;font-size:.8rem;background:var(--bg);color:var(--text)}
.hb-chip.on{border-color:var(--accent);background:#fef3c7}
.hb-sw{display:flex;gap:8px}
.hb-sw button{width:28px;height:28px;border-radius:50%;border:2px solid transparent}
.hb-sw button.on{border-color:var(--text)}
.hb-2{display:flex;gap:8px}
.hb-2>*{flex:1}
.hb-vbig{font-size:2.2rem;font-weight:800;text-align:center;font-variant-numeric:tabular-nums;padding:6px 0 0}
.hb-vunit{text-align:center;font-size:.74rem;color:var(--text2);margin-bottom:10px}
.hb-steps{display:flex;gap:8px;padding:0 14px}
.hb-steps button{flex:1;padding:12px 0;border:1px solid var(--border);border-radius:11px;background:var(--bg);color:var(--text);font-size:.86rem}
.hb-steps button.on{border-color:var(--accent);color:var(--accent2);font-weight:600}
.hb-toast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%) translateY(8px);background:#3d2c1e;color:#fff;
  padding:9px 15px;border-radius:999px;font-size:.78rem;opacity:0;transition:.2s;z-index:60;pointer-events:none;max-width:86vw;text-align:center}
.hb-toast.on{opacity:1;transform:translateX(-50%) translateY(0)}
`;
    document.head.appendChild(st);
  }

  /* ---------- 外框 ---------- */
  function shell() {
    return `<div class="hb-wrap">
      <div class="hb-top">
        <div><div class="hb-d1" id="hbTitle">今天</div><div class="hb-d2" id="hbSub"></div></div>
        <div class="hb-ring">
          <svg viewBox="0 0 54 54" width="52" height="52">
            <circle cx="27" cy="27" r="23" fill="none" stroke="var(--border)" stroke-width="4"></circle>
            <circle id="hbArc" cx="27" cy="27" r="23" fill="none" stroke="var(--accent)" stroke-width="4"
              stroke-linecap="round" stroke-dasharray="144.5" stroke-dashoffset="144.5" transform="rotate(-90 27 27)"></circle>
          </svg>
          <div class="pct" id="hbPct">—</div>
        </div>
      </div>
      <div class="hb-seg" id="hbSeg">
        <button data-v="today" class="on">今天</button>
        <button data-v="cal">月曆</button>
        <button data-v="stats">統計</button>
      </div>
      <div id="hbBody"></div>
      <div class="hb-sec">資料</div>
      <div class="hb-card">
        <div class="hb-lrow"><div><div class="t">匯出備份</div><div class="s">可匯入 kindhome.net/habits 或另一台裝置</div></div><button class="hb-btn" id="hbExport">匯出</button></div>
        <div class="hb-lrow"><div><div class="t">匯入備份</div><div class="s">讀取 JSON 會覆蓋現有習慣</div></div><button class="hb-btn" id="hbImport">匯入</button></div>
        <div class="hb-lrow"><div><div class="t">舊版每日儀表板</div><div class="s">原本的養成好習慣頁（雲端資料仍保留）</div></div><button class="hb-btn" id="hbOld">開啟</button></div>
      </div>
    </div>
    <button class="hb-fab" id="hbAdd">+</button>
    <div class="hb-mask" id="hbMask"></div>
    <div class="hb-sheet" id="hbSheet">
      <div class="hb-hd"><div class="t" id="hbSheetTitle">新增習慣</div><button class="hb-btn" id="hbSheetClose">關閉</button></div>
      <div class="hb-fld" id="hbTplWrap"><label>常用範本</label><div class="hb-chips" id="hbTpl"></div></div>
      <div class="hb-fld"><label>名稱</label><input class="hb-inp" id="hbName" maxlength="30" placeholder="例如：喝水 2000ml"></div>
      <div class="hb-fld"><label>圖示</label><div class="hb-chips" id="hbEmoji"></div></div>
      <div class="hb-fld"><label>顏色</label><div class="hb-sw" id="hbColor"></div></div>
      <div class="hb-fld"><label>記錄方式</label><div class="hb-chips" id="hbKind">
        <button class="hb-chip on" data-kind="check">打勾</button>
        <button class="hb-chip" data-kind="count">數字累計</button>
        <button class="hb-chip" data-kind="timer">計時</button>
      </div></div>
      <div class="hb-fld" id="hbTargetWrap" style="display:none">
        <label>每日目標</label>
        <div class="hb-2"><input class="hb-inp" id="hbTarget" type="number" inputmode="decimal" step="any" placeholder="例如 2000">
        <input class="hb-inp" id="hbUnit" maxlength="6" placeholder="單位，如 ml"></div>
        <div class="s" style="font-size:.7rem;color:var(--text2);margin-top:5px" id="hbTargetHint"></div>
      </div>
      <div class="hb-fld"><label>頻率</label><div class="hb-chips" id="hbFreq">
        <button class="hb-chip on" data-f="daily">每天</button>
        <button class="hb-chip" data-f="days">指定星期</button>
        <button class="hb-chip" data-f="weekly">每週 N 次</button>
      </div></div>
      <div class="hb-fld" id="hbDaysWrap" style="display:none"><label>哪幾天</label><div class="hb-chips" id="hbDays"></div></div>
      <div class="hb-fld" id="hbWeeklyWrap" style="display:none"><label>每週次數</label><input class="hb-inp" id="hbWeeklyN" type="number" min="1" max="7" value="3" style="width:110px"></div>
      <div class="hb-fld"><label>提醒時間（可留空）</label><input class="hb-inp" id="hbRemind" type="time" style="width:150px"></div>
      <div class="hb-fld"><div class="hb-2"><button class="hb-btn" id="hbUp">↑ 上移</button><button class="hb-btn" id="hbDown">↓ 下移</button></div></div>
      <div class="hb-fld"><div class="hb-2"><button class="hb-btn warn" id="hbDel">刪除</button><button class="hb-btn primary" id="hbSave">儲存</button></div></div>
    </div>
    <div class="hb-sheet" id="hbVSheet">
      <div class="hb-hd"><div class="t" id="hbVTitle">記錄</div><button class="hb-btn" id="hbVClose">關閉</button></div>
      <div class="hb-vbig" id="hbVNum">0</div>
      <div class="hb-vunit" id="hbVUnit"></div>
      <div class="hb-steps" id="hbVSteps"></div>
      <div class="hb-fld" style="margin-top:8px"><label>手動輸入</label>
        <input class="hb-inp" id="hbVInput" type="number" inputmode="decimal" step="any" placeholder="輸入數值"></div>
      <div class="hb-fld"><div class="hb-2"><button class="hb-btn warn" id="hbVClear">清除這天</button><button class="hb-btn primary" id="hbVSave">完成</button></div></div>
    </div>
    <div class="hb-toast" id="hbToast"></div>
    <input type="file" id="hbFile" accept="application/json" style="display:none">`;
  }

  /* ---------- 繪製 ---------- */
  function $(s) { return host ? host.querySelector(s) : document.querySelector(s); }
  function render() {
    if (!host) return;
    renderTop();
    const body = $("#hbBody");
    if (view === "today") body.innerHTML = viewToday();
    else if (view === "cal") body.innerHTML = viewCal();
    else body.innerHTML = viewStats();
    $("#hbSeg").querySelectorAll("[data-v]").forEach(b => b.classList.toggle("on", b.dataset.v === view));
    $("#hbAdd").style.display = (view === "today" || view === "stats") ? "grid" : "none";
  }

  function renderTop() {
    const now = new Date(), tk = dayKey(now);
    const due = dueToday(), done = due.filter(h => isDone(h, tk));
    $("#hbTitle").textContent = view === "today" ? (now.getMonth() + 1) + "月" + now.getDate() + "日" : (view === "cal" ? "月曆" : "統計");
    $("#hbSub").textContent = due.length ? ("完成 " + done.length + " / " + due.length) : "今天沒有排定的習慣";
    const pct = due.length ? done.length / due.length : 0, C = 2 * Math.PI * 23;
    $("#hbArc").setAttribute("stroke-dasharray", C.toFixed(1));
    $("#hbArc").setAttribute("stroke-dashoffset", (C * (1 - pct)).toFixed(1));
    $("#hbPct").textContent = due.length ? Math.round(pct * 100) + "%" : "—";
    $("#hbPct").style.color = "var(--text)";
  }

  function row(h, k, opts) {
    const done = isDone(h, k), st = streak(h), f = h.freq || { type: "daily" };
    let sub = f.type === "daily" ? "每天" : f.type === "days" ? "每週 " + (f.days || []).map(d => WD[d]).join("、") : "每週 " + (f.n || 3) + " 次";
    const hint = hintText(h); if (hint) sub = hint + " · " + sub;
    if (st > 0) sub += " · 連續 " + st + (f.type === "weekly" ? "週" : "天");
    if (h.remind) sub += " · " + h.remind;
    const dis = (opts && opts.disable) ? "disabled" : "";
    const num = (h.kind !== "check" && !done) ? fmtVal(h, val(h, k)) : "";
    return `<div class="hb-row" style="--c:${h.color}">
      <button class="hb-em" data-edit="${h.id}">${h.emoji}</button>
      <div class="hb-mid" data-edit="${h.id}"><div class="hb-name">${esc(h.name)}</div><div class="hb-sub">${esc(sub)}</div></div>
      <button class="hb-chk${done ? " on" : ""}${h.kind !== "check" ? " num" : ""}" data-toggle="${h.id}" data-k="${k}" ${dis}>${esc(num)}</button>
    </div>`;
  }

  function viewToday() {
    const now = new Date(), tk = dayKey(now);
    const ws = startOfWeek(now); let strip = "";
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i), k = dayKey(d);
      const list = activeHabits().filter(h => isScheduled(h, d));
      const dn = list.filter(h => isDone(h, k)).length;
      const ratio = list.length ? dn / list.length : 0;
      strip += `<button class="hb-ws${k === tk ? " on" : ""}" data-day="${k}">${WD[i]}<b>${d.getDate()}</b><span class="bar"><i style="width:${Math.round(ratio * 100)}%"></i></span></button>`;
    }
    const due = dueToday();
    const pending = due.filter(h => !isDone(h, tk));
    const dl = due.filter(h => isDone(h, tk));
    return `<div class="hb-week">${strip}</div>
      <div class="hb-sec">待打卡</div>
      <div class="hb-card">${pending.length ? pending.map(h => row(h, tk)).join("") : `<div class="hb-empty">${due.length ? "今天全部完成。" : "按右下角 + 新增第一個習慣"}</div>`}</div>
      ${dl.length ? `<div class="hb-sec">已完成</div><div class="hb-card">${dl.map(h => row(h, tk)).join("")}</div>` : ""}`;
  }

  function viewCal() {
    if (!calCursor) calCursor = startOfMonth(new Date());
    if (!calSel) calSel = today();
    const y = calCursor.getFullYear(), m = calCursor.getMonth();
    const pad = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate(), tk = today();
    let html = `<div class="hb-card"><div class="hb-cal">` + WD.map(w => `<div class="wd">${w}</div>`).join("");
    for (let i = 0; i < pad; i++) html += `<div class="d out"></div>`;
    for (let d = 1; d <= days; d++) {
      const k = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      const hits = activeHabits().filter(h => isScheduled(h, keyToDate(k)) && isDone(h, k)).length;
      const cls = ["d"]; if (k === tk) cls.push("today"); if (k === calSel) cls.push("sel"); if (isFuture(k)) cls.push("fut");
      html += `<button class="${cls.join(" ")}" data-day="${k}">${d}${hits ? '<span class="dot"></span>' : ""}</button>`;
    }
    html += `</div></div>`;
    const list = activeHabits().filter(h => isScheduled(h, keyToDate(calSel)));
    html += `<div class="hb-sec">${calSel}${isFuture(calSel) ? "（未來）" : ""}</div><div class="hb-card">` +
      (list.length ? list.map(h => row(h, calSel, { disable: isFuture(calSel) })).join("") : `<div class="hb-empty">這天沒有排定的習慣</div>`) + `</div>`;
    return html;
  }

  function heat(h, weeks) {
    const start = addDays(startOfWeek(new Date()), -7 * (weeks - 1)); let c = "";
    for (let w = 0; w < weeks; w++) for (let i = 0; i < 7; i++) {
      const d = addDays(start, w * 7 + i), k = dayKey(d);
      c += `<i class="${(!isFuture(k) && isDone(h, k)) ? "on" : ""}" title="${k}"></i>`;
    }
    return `<div class="hb-heat" style="--c:${h.color}">${c}</div>`;
  }
  function viewStats() {
    const list = activeHabits();
    if (!list.length) return `<div class="hb-card"><div class="hb-empty">還沒有習慣</div></div>`;
    return `<div class="hb-card">` + list.map(h => {
      const f = h.freq || { type: "daily" };
      return `<div class="hb-row"><div class="hb-em" style="--c:${h.color}">${h.emoji}</div>
        <div class="hb-mid"><div class="hb-name">${esc(h.name)}</div>
        <div class="hb-kv"><div>連續<b>${streak(h)}${f.type === "weekly" ? "週" : "天"}</b></div>
        <div>最佳<b>${bestStreak(h)}</b></div><div>30天達標<b>${rate30(h)}%</b></div></div>
        ${heat(h, 12)}</div></div>`;
    }).join("") + `</div>`;
  }

  /* ---------- 打勾 / 數值 ---------- */
  function buzz() { try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {} }
  function tapToggle(h, k) {
    if (isFuture(k)) { toast("不能打未來的卡"); return; }
    if (h.kind === "check") { setVal(h, k, isDone(h, k) ? 0 : 1); buzz(); render(); return; }
    openValue(h, k);
  }
  function openValue(h, k) {
    vHabit = h; vKey = k; vVal = val(h, k) || 0;
    $("#hbVTitle").textContent = h.emoji + " " + h.name;
    $("#hbVSteps").innerHTML = h.kind === "timer"
      ? `<button data-add="300">+5 分</button><button data-add="600">+10 分</button><button data-start="1" id="hbVStart">開始計時</button>`
      : `<button data-add="-1">−1</button><button data-add="1">+1</button><button data-add="5">+5</button><button data-add="10">+10</button>`;
    drawValue();
    $("#hbMask").classList.add("on");
    $("#hbVSheet").classList.add("on");
  }
  function drawValue() {
    const h = vHabit; if (!h) return;
    $("#hbVNum").textContent = h.kind === "timer" ? (Math.floor(vVal / 60) + " 分 " + String(vVal % 60).padStart(2, "0") + " 秒") : numFmt(vVal);
    $("#hbVUnit").textContent = h.kind === "timer"
      ? ("今日累計 · 目標 " + Math.round((h.target || 1800) / 60) + " 分")
      : ("單位 " + (h.unit || "次") + " · 目標 " + fmtVal(h, h.target || 1));
    $("#hbVInput").value = h.kind === "timer" ? "" : (vVal || "");
    const btn = $("#hbVStart");
    if (btn) {
      const on = S.running && S.running.hid === h.id && S.running.k === vKey;
      btn.textContent = on ? "暫停計時" : "開始計時";
      btn.classList.toggle("on", !!on);
    }
  }
  function closeValue() { $("#hbMask").classList.remove("on"); $("#hbVSheet").classList.remove("on"); vHabit = null; }

  /* ---------- 編輯 ---------- */
  function openSheet(id) {
    editing = id || null;
    const h = id ? S.habits.find(x => x.id === id) : null;
    draft = h ? clone(h) : {
      id: "h" + Date.now().toString(36), name: "", emoji: "🎯", color: COLORS[0],
      freq: { type: "daily", days: WEEKDAYS.slice(), n: 3 }, remind: "", order: S.habits.length,
      archived: false, kind: "check", target: 1, unit: ""
    };
    $("#hbSheetTitle").textContent = h ? "編輯習慣" : "新增習慣";
    $("#hbTplWrap").style.display = h ? "none" : "block";
    $("#hbTpl").innerHTML = TEMPLATES.map((t, i) => `<button class="hb-chip" data-tpl="${i}">${t.emoji} ${t.name}</button>`).join("");
    $("#hbName").value = draft.name;
    $("#hbEmoji").innerHTML = EMOJIS.map(e => `<button class="hb-chip${e === draft.emoji ? " on" : ""}" data-em="${e}">${e}</button>`).join("");
    $("#hbColor").innerHTML = COLORS.map(c => `<button data-col="${c}" style="background:${c}" class="${c === draft.color ? "on" : ""}"></button>`).join("");
    paintKind(); paintFreq();
    $("#hbDays").innerHTML = WD.map((w, i) => `<button class="hb-chip${((draft.freq.days || []).includes(i)) ? " on" : ""}" data-wd="${i}">${w}</button>`).join("");
    $("#hbWeeklyN").value = draft.freq.n || 3;
    $("#hbRemind").value = draft.remind || "";
    $("#hbDel").style.visibility = h ? "visible" : "hidden";
    $("#hbMask").classList.add("on");
    $("#hbSheet").classList.add("on");
  }
  function paintKind() {
    $("#hbKind").querySelectorAll("[data-kind]").forEach(b => b.classList.toggle("on", b.dataset.kind === draft.kind));
    $("#hbTargetWrap").style.display = draft.kind === "check" ? "none" : "block";
    $("#hbTargetHint").textContent = draft.kind === "timer" ? "計時以秒記錄，目標請填分鐘（例 30）" : "每次記錄會累加，達到目標即完成";
    if (draft.kind === "timer") { $("#hbUnit").disabled = true; $("#hbUnit").value = ""; $("#hbTarget").value = Math.round((draft.target > 60 ? draft.target : 1800) / 60); }
    else if (draft.kind === "count") { $("#hbUnit").disabled = false; $("#hbTarget").value = draft.target > 1 ? draft.target : ""; $("#hbUnit").value = draft.unit || ""; }
    else $("#hbUnit").disabled = false;
  }
  function paintFreq() {
    const t = (draft.freq || {}).type || "daily";
    $("#hbFreq").querySelectorAll("[data-f]").forEach(b => b.classList.toggle("on", b.dataset.f === t));
    $("#hbDaysWrap").style.display = t === "days" ? "block" : "none";
    $("#hbWeeklyWrap").style.display = t === "weekly" ? "block" : "none";
  }
  function closeSheet() { $("#hbMask").classList.remove("on"); $("#hbSheet").classList.remove("on"); editing = null; draft = null; }
  function saveSheet() {
    draft.name = $("#hbName").value.trim();
    draft.remind = $("#hbRemind").value || "";
    draft.freq.n = Math.max(1, Math.min(7, parseInt($("#hbWeeklyN").value || "3", 10) || 3));
    const t = parseFloat($("#hbTarget").value);
    if (draft.kind === "timer") { draft.target = Math.max(60, (isNaN(t) ? 30 : t) * 60); draft.unit = "分"; }
    else if (draft.kind === "count") { draft.target = (isNaN(t) || t <= 0) ? 1 : t; draft.unit = ($("#hbUnit").value || "").trim(); }
    else { draft.target = 1; draft.unit = ""; }
    if (!draft.name) { toast("請輸入名稱"); return; }
    if (!draft.freq.days || !draft.freq.days.length) draft.freq.days = WEEKDAYS.slice();
    if (editing) { const i = S.habits.findIndex(x => x.id === editing); S.habits[i] = Object.assign(S.habits[i], draft); }
    else { draft.order = S.habits.length; S.habits.push(draft); }
    save(); closeSheet(); render(); toast("已儲存");
  }

  /* ---------- 匯出／匯入 ---------- */
  function exportJSON() {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "habits-" + today() + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("已匯出");
  }
  function importJSON(file) {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const o = JSON.parse(fr.result);
        if (!o || !Array.isArray(o.habits)) throw new Error("格式不符");
        S = normalize(o); save(); render(); toast("匯入完成：" + S.habits.length + " 個習慣");
      } catch (e) { toast("匯入失敗：" + e.message); }
    };
    fr.readAsText(file);
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $("#hbToast"); if (!el) return;
    el.textContent = msg; el.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("on"), 1900);
  }

  /* ---------- 事件（容器內委派） ---------- */
  function bind() {
    host.addEventListener("click", e => {
      const t = e.target.closest("[data-toggle],[data-edit],[data-day],[data-v],[data-tpl],[data-kind],[data-f],[data-wd],[data-em],[data-col],[data-add],[data-start]");
      if (!t) return;
      if (t.dataset.toggle) { const h = S.habits.find(x => x.id === t.dataset.toggle); if (h) tapToggle(h, t.dataset.k); return; }
      if (t.dataset.edit) { openSheet(t.dataset.edit); return; }
      if (t.dataset.day) { calSel = t.dataset.day; if (view !== "cal") { view = "cal"; } calCursor = startOfMonth(keyToDate(calSel)); render(); return; }
      if (t.dataset.v) { view = t.dataset.v; render(); return; }
      if (t.dataset.tpl !== undefined && t.dataset.tpl !== "") {
        const p = TEMPLATES[Number(t.dataset.tpl)];
        draft.name = p.name; draft.emoji = p.emoji; draft.kind = p.kind; draft.color = p.color;
        draft.target = p.target || 1; draft.unit = p.unit || "";
        $("#hbName").value = draft.name;
        $("#hbEmoji").querySelectorAll(".hb-chip").forEach(c => c.classList.toggle("on", c.dataset.em === draft.emoji));
        $("#hbColor").querySelectorAll("button").forEach(c => c.classList.toggle("on", c.dataset.col === draft.color));
        paintKind(); return;
      }
      if (t.dataset.kind) { draft.kind = t.dataset.kind; paintKind(); return; }
      if (t.dataset.f) { draft.freq.type = t.dataset.f; paintFreq(); return; }
      if (t.dataset.wd !== undefined && t.dataset.wd !== "") {
        const i = Number(t.dataset.wd); draft.freq.days = draft.freq.days || [];
        const at = draft.freq.days.indexOf(i);
        if (at >= 0) draft.freq.days.splice(at, 1); else draft.freq.days.push(i);
        t.classList.toggle("on"); return;
      }
      if (t.dataset.em) { draft.emoji = t.dataset.em; $("#hbEmoji").querySelectorAll(".hb-chip").forEach(c => c.classList.toggle("on", c === t)); return; }
      if (t.dataset.col) { draft.color = t.dataset.col; $("#hbColor").querySelectorAll("button").forEach(c => c.classList.toggle("on", c === t)); return; }
      if (t.dataset.add !== undefined && t.dataset.add !== "") { vVal = Math.max(0, vVal + Number(t.dataset.add)); drawValue(); return; }
      if (t.dataset.start) {
        if (S.running && S.running.hid === vHabit.id && S.running.k === vKey) {
          vVal += Math.max(0, Math.round((Date.now() - S.running.since) / 1000));
          S.running = null; setVal(vHabit, vKey, vVal);
        } else { S.running = { hid: vHabit.id, k: vKey, since: Date.now() }; save(); }
        drawValue(); return;
      }
    });

    $("#hbAdd").addEventListener("click", () => openSheet(null));
    $("#hbSheetClose").addEventListener("click", closeSheet);
    $("#hbVClose").addEventListener("click", closeValue);
    $("#hbMask").addEventListener("click", () => { if ($("#hbVSheet").classList.contains("on")) closeValue(); else closeSheet(); });
    $("#hbSave").addEventListener("click", saveSheet);
    $("#hbUp").addEventListener("click", () => move(-1));
    $("#hbDown").addEventListener("click", () => move(1));
    $("#hbDel").addEventListener("click", () => {
      if (!editing) return;
      const h = S.habits.find(x => x.id === editing); if (!h) return;
      if (!confirm("刪除「" + h.name + "」？打卡紀錄也會一起刪除。")) return;
      S.habits = S.habits.filter(x => x.id !== editing); delete S.logs[editing];
      S.habits.forEach((x, i) => x.order = i);
      save(); closeSheet(); render(); toast("已刪除");
    });
    $("#hbVSave").addEventListener("click", () => {
      const raw = $("#hbVInput").value;
      if (raw !== "") { const n = parseFloat(raw); if (!isNaN(n)) vVal = Math.max(0, n); }
      setVal(vHabit, vKey, Math.round(vVal)); buzz(); closeValue(); render();
    });
    $("#hbVClear").addEventListener("click", () => { setVal(vHabit, vKey, 0); S.running = null; save(); buzz(); closeValue(); render(); toast("已清除"); });
    $("#hbExport").addEventListener("click", exportJSON);
    $("#hbImport").addEventListener("click", () => $("#hbFile").click());
    $("#hbFile").addEventListener("change", e => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ""; });
    $("#hbOld").addEventListener("click", () => { if (oldDashCb) oldDashCb(); });
  }
  function move(dir) {
    if (!editing) return;
    const i = S.habits.findIndex(x => x.id === editing), j = i + dir;
    if (i < 0 || j < 0 || j >= S.habits.length) return;
    const a = S.habits[i]; S.habits[i] = S.habits[j]; S.habits[j] = a;
    S.habits.forEach((x, k) => x.order = k); save(); render();
  }

  /* ---------- 對外 API ---------- */
  window.Habits = {
    render(el) {
      injectCSS();
      host = el;
      if (!S) S = load();
      if (!calSel) calSel = today();
      if (!calCursor) calCursor = startOfMonth(new Date());
      el.innerHTML = shell();
      bind();
      render();
      startTicker();
    },
    summary() {
      if (!S) S = load();
      const tk = today();
      const due = activeHabits().filter(h => isScheduled(h, new Date()));
      const done = due.filter(h => isDone(h, tk)).length;
      return { total: due.length, done: done, rate: due.length ? Math.round(done / due.length * 100) : 0, habits: activeHabits().length };
    },
    onOldDashboard(fn) { oldDashCb = fn; },
    refresh() { if (host) render(); }
  };

  let ticker = null;
  function startTicker() {
    if (ticker) return;
    ticker = setInterval(() => {
      if (!host || !document.body.contains(host)) return;
      if (S && S.running && $("#hbVSheet") && $("#hbVSheet").classList.contains("on")) {
        const sec = Math.round((Date.now() - S.running.since) / 1000);
        const n = $("#hbVNum");
        if (n) n.textContent = Math.floor((vVal + sec) / 60) + " 分 " + String((vVal + sec) % 60).padStart(2, "0") + " 秒";
      }
    }, 1000);
  }
})();
