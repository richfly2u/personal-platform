/* === 日記強化模組（參考小米備忘錄工具列） ==========================
   功能：照片 / 錄音 / 語音轉字 / 表情 / 背景 / 明細勾選 / 手寫 / 字級
   儲存：圖片、錄音、手寫圖存 IndexedDB；縮圖與文字存原本 items
   ================================================================= */
(function () {
  "use strict";

  const DB = "pp_diary", ST = "media";
  const BGS = [
    { k: "none", n: "預設", css: "" },
    { k: "sun", n: "暖陽", css: "linear-gradient(135deg,#fff7e6,#ffe6bd)" },
    { k: "sky", n: "晴空", css: "linear-gradient(135deg,#eaf4ff,#d5e8ff)" },
    { k: "mint", n: "薄荷", css: "linear-gradient(135deg,#e9fbf3,#cff3e3)" },
    { k: "rose", n: "玫瑰", css: "linear-gradient(135deg,#fff0f4,#ffdde7)" },
    { k: "sand", n: "米紙", css: "linear-gradient(135deg,#fdf6ec,#f0e2cc)" },
    { k: "night", n: "夜墨", css: "linear-gradient(135deg,#2b2f3a,#1b1f26)", dark: true },
    { k: "forest", n: "山林", css: "linear-gradient(135deg,#eef7ee,#d8edd9)" }
  ];
  const EMOJIS = ["😊", "🙏", "😌", "😴", "💪", "🌱", "🍚", "☕", "🌤", "🌙", "❤️", "🎉", "😢", "😮", "👍", "🙌", "✨", "🕯️", "📖", "🧘"];

  // 小米備忘錄風格：灰階線性圖示（無底色、無邊框）
  const SVG = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const IC = {
    check: SVG('<rect x="3.5" y="3.5" width="17" height="17" rx="3.4"/><path d="M8 12.4l2.7 2.7 5-5.6"/>'),
    mic: SVG('<path d="M12 3.6a3 3 0 0 1 3 3v5.1a3 3 0 0 1-6 0V6.6a3 3 0 0 1 3-3z"/><path d="M6.2 11.6a5.8 5.8 0 0 0 11.6 0"/><path d="M12 17.5V20.5"/>'),
    wave: SVG('<path d="M3.5 10.5v3M7.5 7.5v9M11.5 4.8v14.4M15.5 8.2v7.6M19.5 10.8v2.4"/>'),
    pen: SVG('<path d="M4 20.2l4.3-1.1 9.4-9.4a2.15 2.15 0 0 0-3-3L5.3 16.1 4 20.2z"/><path d="M13.9 6.4l3 3"/>'),
    image: SVG('<rect x="3.4" y="4.2" width="12.6" height="12.6" rx="2.2"/><circle cx="7.6" cy="8.6" r="1.3"/><path d="M4 14.4l3.9-3.3 3.4 2.9"/><path d="M19 13.8v6.4M15.8 17h6.4"/>'),
    smile: SVG('<circle cx="12" cy="12" r="8.6"/><path d="M9 10.2h.01M15 10.2h.01"/><path d="M8.4 14.4a4.6 4.6 0 0 0 7.2 0"/>'),
    palette: SVG('<path d="M12 3.4a8.6 8.6 0 0 0 0 17.2c1.5 0 2.1-.9 2.1-1.9 0-1.6 1-2.3 2.3-2.3h1.5a2.8 2.8 0 0 0 2.8-2.8 8.7 8.7 0 0 0-8.7-10.2z"/><circle cx="8.4" cy="10.2" r=".95"/><circle cx="12" cy="7.6" r=".95"/><circle cx="15.6" cy="10.2" r=".95"/>'),
    stop: SVG('<rect x="7.2" y="7.2" width="9.6" height="9.6" rx="2" fill="currentColor" stroke="none"/>')
  };

  let dbp = null;
  function openDB() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => { const d = rq.result; if (!d.objectStoreNames.contains(ST)) d.createObjectStore(ST); };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    return dbp;
  }
  async function putBlob(id, blob) {
    const d = await openDB();
    return new Promise((res, rej) => {
      const tx = d.transaction(ST, "readwrite"); tx.objectStore(ST).put(blob, id);
      tx.oncomplete = () => res(id); tx.onerror = () => rej(tx.error);
    });
  }
  async function getBlob(id) {
    try {
      const d = await openDB();
      return await new Promise((res, rej) => {
        const tx = d.transaction(ST, "readonly"); const rq = tx.objectStore(ST).get(id);
        rq.onsuccess = () => res(rq.result || null); rq.onerror = () => rej(rq.error);
      });
    } catch (e) { return null; }
  }
  async function delBlob(id) { try { const d = await openDB(); d.transaction(ST, "readwrite").objectStore(ST).delete(id); } catch (e) {} }

  const uid = () => "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  function injectCSS() {
    if (document.getElementById("dmed-style")) return;
    const s = document.createElement("style");
    s.id = "dmed-style";
    s.textContent = `
.dt-bar{display:grid;grid-template-columns:repeat(8,1fr);gap:0;padding:6px 0 2px;align-items:center}
.dt-bar .dt-btn{border:0!important;background:transparent!important;box-shadow:none!important;padding:8px 0!important;color:var(--text2)!important;text-align:center;line-height:1;min-width:0}
.dt-bar .dt-btn svg{width:22px;height:22px;display:block;margin:0 auto}
.dt-bar .dt-btn:active{color:var(--accent)!important}
.dt-bar .dt-btn.rec{color:#dc2626!important}
.dt-aa{font-size:.95rem;font-weight:600;letter-spacing:.5px}
.dt-btn.rec{background:#fee2e2;border-color:#fca5a5;color:#b91c1c;font-weight:600}
.dt-draft{font-size:.8rem;color:var(--text2)}
.dt-imgs{display:flex;gap:6px;overflow-x:auto;padding:6px 0}
.dt-thumb{position:relative;flex:0 0 auto}
.dt-thumb img{width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border)}
.dt-thumb b{position:absolute;top:-6px;right:-6px;background:#3d2c1e;color:#fff;width:18px;height:18px;border-radius:50%;
  display:grid;place-items:center;font-size:11px;cursor:pointer}
.dt-audio,.dt-sk{margin:6px 0;display:flex;align-items:center;gap:8px}
.dt-audio button,.dt-sk button{border:1px solid var(--border);border-radius:8px;padding:4px 8px;font-size:.72rem;background:var(--card);color:var(--text)}
.dt-rows{border:1px solid var(--border);border-radius:10px;padding:8px;margin:6px 0;background:var(--card)}
.dt-row{display:flex;gap:6px;margin-bottom:6px}
.dt-row input{border:1px solid var(--border);border-radius:7px;padding:6px;font-size:.8rem;min-width:0;background:var(--bg);color:var(--text)}
.dt-row input[data-f=name]{flex:1}
.dt-row input[data-f=qty]{width:52px;text-align:center}
.dt-row input[data-f=amount]{width:80px;text-align:right}
.dt-row button{border:0;background:transparent;color:var(--danger);font-size:1rem}
.dt-total{display:flex;align-items:center;justify-content:space-between;font-size:.8rem;padding-top:4px;border-top:1px dashed var(--border)}
.dt-add{border:1px solid var(--border);border-radius:8px;padding:4px 8px;font-size:.72rem;background:var(--card);color:var(--text)}
.dt-pop{display:none;flex-wrap:wrap;gap:6px;padding:8px 0}
.dt-pop.on{display:flex}
.dt-pop button{min-width:40px;height:40px;border:1px solid var(--border);border-radius:9px;background:var(--card);color:var(--text);font-size:1.05rem;padding:0 8px}
.dt-pop button.on{border-color:var(--accent);font-weight:600}
.diary-imgs{display:flex;gap:6px;overflow-x:auto;margin-top:8px}
.diary-imgs img{width:96px;height:96px;object-fit:cover;border-radius:9px;border:1px solid var(--border);cursor:zoom-in;background:#0001}
.diary-audio{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin-top:8px;font-size:.75rem;color:var(--text2);width:100%}
.diary-audio audio{flex:1 1 100%;width:100%;min-width:0;height:34px}
.diary-audio .adur{flex:0 0 auto;font-variant-numeric:tabular-nums}
.diary-rows{margin-top:8px;border-top:1px dashed var(--border);padding-top:6px;font-size:.82rem}
.diary-check{display:flex;align-items:center;gap:8px;padding:3px 0}
.diary-check>span:last-child{margin-left:auto}
.diary-check .bx{width:19px;height:19px;border:1.6px solid #d8c9b4;border-radius:5px;display:grid;place-items:center;font-size:11px;color:transparent;flex:0 0 auto}
.diary-check.done .bx{background:var(--accent);border-color:var(--accent);color:#fff}
.diary-check.done .tx{text-decoration:line-through;color:var(--text2)}
.diary-rows-total{border-top:1px dashed var(--border);margin-top:4px;padding-top:4px;font-weight:700;text-align:right}
.diary-bullets{margin:6px 0 0 18px;font-size:.88rem}
.diary-bullets li{list-style:disc}
.diary-viewer{position:fixed;inset:0;background:rgba(0,0,0,.9);display:grid;place-items:center;z-index:200}
.diary-viewer img{max-width:94vw;max-height:86vh;border-radius:8px}
.diary-viewer button{position:absolute;bottom:24px;background:#fff;border:0;border-radius:999px;padding:9px 20px;font-size:.85rem;color:#333}
.diary-toast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%) translateY(8px);background:#3d2c1e;color:#fff;
  padding:9px 15px;border-radius:999px;font-size:.78rem;opacity:0;transition:.2s;z-index:260;pointer-events:none;max-width:86vw;text-align:center}
.diary-toast.on{opacity:1;transform:translateX(-50%) translateY(0)}
.dt-saved{font-size:.66rem;color:var(--text2);text-align:right;padding:0 4px 3px;min-height:13px;opacity:.85}
.sk-wrap{position:fixed;inset:0;background:#fff;z-index:210;display:flex;flex-direction:column}
.sk-head{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #eee;font-size:.9rem;color:#3d2c1e}
.sk-wrap canvas{flex:1;touch-action:none;background:#fff;width:100%}
`;
    document.head.appendChild(s);
  }

  let draft = null;
  const empty = () => ({ images: [], audio: null, bg: "none", rows: [], sketch: null, size: "" });
  let toolsEl = null, inputEl = null, popEl = null, fileEl = null;

  function mount(formEl, catId) {
    if (catId !== "diary" || !formEl) return;
    injectCSS();
    if (!draft) draft = empty();
    inputEl = formEl.querySelector("#addText");
    if (formEl.querySelector(".dt-bar")) { paint(); return; }
    toolsEl = document.createElement("div");
    toolsEl.innerHTML = `
      <div class="dt-draft" id="dtDraft"></div>
      <div class="dt-bar">
        <button type="button" class="dt-btn" data-dt="size" title="字級" aria-label="字級"><span class="dt-aa">Aa</span></button>
        <button type="button" class="dt-btn" data-dt="rows" title="明細勾選" aria-label="明細勾選">${IC.check}</button>
        <button type="button" class="dt-btn" data-dt="rec" title="錄音" aria-label="錄音">${IC.mic}</button>
        <button type="button" class="dt-btn" data-dt="dict" title="聽寫" aria-label="聽寫">${IC.wave}</button>
        <button type="button" class="dt-btn" data-dt="sketch" title="手寫" aria-label="手寫">${IC.pen}</button>
        <button type="button" class="dt-btn" data-dt="photo" title="照片" aria-label="照片">${IC.image}</button>
        <button type="button" class="dt-btn" data-dt="emoji" title="表情" aria-label="表情">${IC.smile}</button>
        <button type="button" class="dt-btn" data-dt="bg" title="背景" aria-label="背景">${IC.palette}</button>
      </div>
      <div class="dt-meta"><span class="dt-saved" id="dtSaved"></span></div>
      <div class="dt-pop" id="dtPop"></div>
      <input type="file" id="dtFile" accept="image/*" multiple style="display:none">`;
    const host = formEl.querySelector("#diaryTools") || formEl;
    host.appendChild(toolsEl);
    popEl = toolsEl.querySelector("#dtPop");
    fileEl = toolsEl.querySelector("#dtFile");
    toolsEl.addEventListener("click", onClick);
    fileEl.addEventListener("change", e => { addImages([...e.target.files]); e.target.value = ""; });

    // ① 自動補日期（聚焦即補），② 隨寫隨存（草稿自動保存／還原）
    restoreDraft();
    if (inputEl) {
      // 日期不顯示在輸入介面，改在存檔後的日記方框右下外側
      inputEl.addEventListener("input", e => { liveText = e.target.value; touched = true; autoSizeTa(); scheduleSave(); });
      window.addEventListener("resize", autoSizeTa);
      inputEl.addEventListener("blur", () => { saveDraftNow(); if (window.__ppDiaryRerender) window.__ppDiaryRerender(); });
    }
    window.addEventListener("pagehide", saveDraftNow);
    document.addEventListener("visibilitychange", () => { if (document.hidden) saveDraftNow(); });

    paint();
  }

  // ---------- 日期前綴 ----------
  const pad2 = n => String(n).padStart(2, "0");
  function datePrefix() {
    const d = new Date(), h = d.getHours();
    return pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + " " +
      (h < 12 ? "上午" : "下午") + (h % 12 || 12) + ":" + pad2(d.getMinutes());
  }

  // ---------- 隨寫隨存 ----------
  const DRAFT_KEY = "diary.draft.v1";
  let saveTimer = null;
  let liveText = "";   // 即時緩衝：畫面重繪也不會丟字
  let touched = false;  // 使用者是否真的動過（避免空白時誤建／誤刪）
  let suppressSave = false;
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveDraftNow, 400); }
  function saveDraftNow() {
    try {
      const ta = document.querySelector("#addText");
      const domText = ta ? ta.value : (inputEl ? inputEl.value : "");
      if (domText) liveText = domText;
      const text = liveText;
      const hasAny = text.trim() || (draft && (draft.images.length || draft.audio || draft.sketch || (draft.rows && draft.rows.length)));
      if (!hasAny) {
        localStorage.removeItem(DRAFT_KEY);
        markSaved("");
        if (touched && window.__ppDiaryUpsert) window.__ppDiaryUpsert("", null);   // 清空 → 收掉這筆
        return;
      }
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, d: draft || empty(), at: Date.now() }));
      const d = new Date();
      markSaved("已存 " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()));
      if (window.__ppDiaryUpsert && !suppressSave) window.__ppDiaryUpsert(text, draft);   // 隨寫隨存進同一筆
    } catch (e) {}
  }
  function restoreDraft() {
    let raw = null;
    try { raw = localStorage.getItem(DRAFT_KEY); } catch (e) {}
    if (!raw) return;
    let o = null;
    try { o = JSON.parse(raw); } catch (e) { return; }
    if (!o) return;
    const memHas = draft && (draft.images.length || draft.audio || draft.sketch || (draft.rows && draft.rows.length));
    if (o.text) o.text = String(o.text).replace(/^\d{2}-\d{2} (?:上午|下午)\d{1,2}:\d{2}\s*\n?/, "");  // 舊草稿去掉自動日期行
    if (!liveText && o.text) liveText = o.text;
    if (inputEl && !inputEl.value.trim() && liveText) inputEl.value = liveText;
    if (!memHas && o.d) draft = Object.assign(empty(), o.d);
    if ((o.text && o.text.trim()) || (o.d && ((o.d.images || []).length || o.d.audio || o.d.sketch || (o.d.rows || []).length))) {
      markSaved("已還原草稿");
      if (inputEl && inputEl.value) inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  // 把「正在寫的那筆」載回輸入框（從資料還原）
  // 多行內容自動長高，換行格式才看得到
  function autoSizeTa() {
    const ta = document.querySelector("#addText") || inputEl;
    if (!ta) return;
    // 輸入框至少佔畫面 1/3（扣掉工具列高度），內容更多才繼續長高
    const minH = Math.max(150, Math.round(window.innerHeight / 3) - 52);
    ta.style.height = "auto";
    ta.style.height = Math.max(minH, Math.min(640, ta.scrollHeight)) + "px";
  }

  const stripStamp = s => String(s || "").replace(/^\s*\d{1,2}-\d{1,2}\s*(?:上午|下午)?\s*\d{0,2}:?\d{0,2}\s*\n?/, "");

  function loadEntry(item) {
    if (!item) return;
    suppressSave = true;
    liveText = stripStamp(item.text || "");
    if (inputEl && inputEl.value !== liveText) inputEl.value = liveText;
    autoSizeTa();
    const itemHasMedia = (item.images || []).length || item.audio || item.sketch || (item.rows || []).length;
    if (itemHasMedia || !draft || (!draft.images.length && !draft.audio && !draft.sketch && !draft.rows.length)) {
      draft = {
        images: item.images || [], audio: item.audio || null, sketch: item.sketch || null,
        rows: item.rows || [], bg: item.bg || "none", size: item.size || ""
      };
    }
    paint();
    setTimeout(() => { suppressSave = false; }, 600);
  }

  function markSaved(msg) {
    const el = document.getElementById("dtSaved");
    if (el) el.textContent = msg || "";
  }
  function clearDraft() {
    clearTimeout(saveTimer);
    liveText = "";
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    markSaved("");
  }

  function imgFromFile(file, maxSide, q) {
    return new Promise((res, rej) => {
      const u = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const sc = Math.min(1, maxSide / Math.max(im.width, im.height));
        const w = Math.round(im.width * sc), h = Math.round(im.height * sc);
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(im, 0, 0, w, h);
        c.toBlob(b => { URL.revokeObjectURL(u); b ? res({ blob: b, w, h }) : rej(new Error("轉檔失敗")); }, "image/jpeg", q);
      };
      im.onerror = () => { URL.revokeObjectURL(u); rej(new Error("讀取失敗")); };
      im.src = u;
    });
  }
  const toDataURL = b => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });

  async function addImages(files) {
    touched = true;
    for (const f of files) {
      if (!/^image\//.test(f.type)) continue;
      try {
        const big = await imgFromFile(f, 1600, 0.82);
        const sm = await imgFromFile(f, 280, 0.6);
        const id = uid();
        await putBlob(id, big.blob);
        draft.images.push({ id, thumb: await toDataURL(sm.blob), w: big.w, h: big.h });
      } catch (e) { toast("圖片處理失敗"); }
    }
    if (window.__ppDiaryUpsert) window.__ppDiaryUpsert(liveText, draft);
    paint();
    if (window.__ppDiaryRerender) window.__ppDiaryRerender();
  }

  let rec = null, chunks = [], recAt = 0;
  async function startRec() {
    if (!navigator.mediaDevices || !window.MediaRecorder) { toast("此瀏覽器不支援錄音"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      rec = new MediaRecorder(stream); chunks = []; recAt = Date.now();
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        const id = uid();
        await putBlob(id, blob);
        touched = true;
        draft.audio = { id, dur: Math.max(1, Math.round((Date.now() - recAt) / 1000)), type: blob.type };
        rec = null;
        if (window.__ppDiaryUpsert) window.__ppDiaryUpsert(liveText, draft);
        paint();
        if (window.__ppDiaryRerender) window.__ppDiaryRerender();
      };
      rec.start(); paint();
    } catch (e) { toast("麥克風被拒絕或不可用"); }
  }
  function stopRec() { if (rec && rec.state !== "inactive") rec.stop(); }

  let sr = null;
  function dictate() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast("此瀏覽器不支援語音轉字，可用錄音"); return; }
    if (sr) { try { sr.stop(); } catch (e) {} sr = null; return; }
    sr = new SR(); sr.lang = "zh-TW"; sr.interimResults = true; sr.continuous = false;
    const base = inputEl ? inputEl.value : "";
    sr.onresult = e => {
      let t = "";
      for (const r of e.results) t += r[0].transcript;
      if (inputEl) { inputEl.value = (base ? base + " " : "") + t; inputEl.dispatchEvent(new Event("input")); }
    };
    sr.onend = () => { sr = null; };
    sr.onerror = () => { sr = null; };
    try { sr.start(); toast("請開始說話…"); } catch (e) { sr = null; }
  }

  const rowsTotal = () => draft.rows.reduce((s, r) => s + (Number(r.amount) || 0) * (Number(r.qty) || 1), 0);

  function openSketch() {
    const wrap = document.createElement("div");
    wrap.className = "sk-wrap";
    wrap.innerHTML = `<div class="sk-head"><span>✏️ 手寫</span>
      <span><button type="button" class="dt-btn" id="skClear">清除</button>
      <button type="button" class="dt-btn" id="skOk">完成</button>
      <button type="button" class="dt-btn" id="skCancel">取消</button></span></div>
      <canvas></canvas>`;
    document.body.appendChild(wrap);
    const cv = wrap.querySelector("canvas");
    const dpr = window.devicePixelRatio || 1;
    const fit = () => {
      const r = cv.getBoundingClientRect();
      cv.width = Math.max(1, r.width * dpr); cv.height = Math.max(1, r.height * dpr);
      const c = cv.getContext("2d"); c.scale(dpr, dpr);
      c.fillStyle = "#fff"; c.fillRect(0, 0, r.width, r.height);
    };
    setTimeout(fit, 40);
    let drawing = false, last = null;
    const pos = e => { const r = cv.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; return { x: p.clientX - r.left, y: p.clientY - r.top }; };
    cv.addEventListener("pointerdown", e => { drawing = true; last = pos(e); e.preventDefault(); });
    cv.addEventListener("pointermove", e => {
      if (!drawing) return;
      const p = pos(e), c = cv.getContext("2d");
      c.strokeStyle = "#3d2c1e"; c.lineWidth = 2.6; c.lineCap = "round";
      c.beginPath(); c.moveTo(last.x, last.y); c.lineTo(p.x, p.y); c.stroke();
      last = p; e.preventDefault();
    });
    window.addEventListener("pointerup", () => { drawing = false; }, { once: true });
    wrap.querySelector("#skCancel").onclick = () => wrap.remove();
    wrap.querySelector("#skClear").onclick = () => { const r = cv.getBoundingClientRect(); cv.getContext("2d").clearRect(0, 0, r.width, r.height); cv.getContext("2d").fillStyle = "#fff"; cv.getContext("2d").fillRect(0, 0, r.width, r.height); };
    wrap.querySelector("#skOk").onclick = () => {
      cv.toBlob(async blob => {
        try {
          const id = uid(); await putBlob(id, blob);
          const sm = document.createElement("canvas");
          sm.width = 280; sm.height = Math.round(280 * cv.height / cv.width);
          sm.getContext("2d").drawImage(cv, 0, 0, sm.width, sm.height);
          draft.sketch = { id, thumb: sm.toDataURL("image/jpeg", 0.65) };
          if (window.__ppDiaryUpsert) window.__ppDiaryUpsert(liveText, draft);
          paint();
          if (window.__ppDiaryRerender) window.__ppDiaryRerender();
        } catch (e) { toast("儲存失敗"); }
        wrap.remove();
      }, "image/png");
    };
  }

  function paint() {
    if (!toolsEl) return;
    const d = toolsEl.querySelector("#dtDraft");
    let h = "";
    if (draft.images.length) h += `<div class="dt-imgs">${draft.images.map(m => `<span class="dt-thumb"><img src="${m.thumb}"><b data-delimg="${m.id}">×</b></span>`).join("")}</div>`;
    if (draft.audio) h += `<div class="dt-audio">🔊 錄音 ${draft.audio.dur || 0} 秒 <button type="button" data-delaudio="1">刪除</button></div>`;
    if (draft.sketch) h += `<div class="dt-sk">✏️ 手寫 1 張 <button type="button" data-delsketch="1">刪除</button></div>`;
    if (draft.rows.length) {
      h += `<div class="dt-rows">` + draft.rows.map((r, i) => `
        <div class="dt-row" data-row="${i}">
          <input data-f="name" data-row="${i}" value="${esc(r.name)}" placeholder="品項">
          <input data-f="qty" data-row="${i}" type="number" inputmode="decimal" value="${r.qty}" placeholder="數量">
          <input data-f="amount" data-row="${i}" type="number" inputmode="decimal" value="${r.amount}" placeholder="金額">
          <button type="button" data-f="del" data-row="${i}">×</button>
        </div>`).join("") +
        `<div class="dt-total"><span>合計 <b id="dtTotal">NT$${rowsTotal().toLocaleString()}</b></span>
          <button type="button" class="dt-add" data-addrow="1">＋ 加一項</button></div></div>`;
    }
    d.innerHTML = h;
    const rb = toolsEl.querySelector('[data-dt="rec"]');
    if (rb) { rb.innerHTML = rec ? IC.stop : IC.mic; rb.title = rec ? "停止錄音" : "錄音"; rb.classList.toggle("rec", !!rec); }
    applyBoxBg();
    if (toolsEl) scheduleSave();
  }

  // 選背景 → 輸入框立刻變色
  function applyBoxBg() {
    const box = (toolsEl && toolsEl.closest(".diary-box")) || document.querySelector(".diary-box");
    if (!box) return;
    const g = BGS.find(x => x.k === (draft && draft.bg));
    if (!g || !g.css) { box.style.background = ""; box.style.color = ""; return; }
    box.style.background = g.css;
    box.style.color = g.dark ? "#f5f5f5" : "";
    if (g.dark) box.style.setProperty("--text2", "#e9e9e9");
    else box.style.removeProperty("--text2");
  }

  function onClick(e) {
    const t = e.target;
    if (t.dataset.delimg) { draft.images = draft.images.filter(x => x.id !== t.dataset.delimg); delBlob(t.dataset.delimg); paint(); return; }
    if (t.dataset.delaudio) { if (draft.audio) delBlob(draft.audio.id); draft.audio = null; paint(); return; }
    if (t.dataset.delsketch) { if (draft.sketch) delBlob(draft.sketch.id); draft.sketch = null; paint(); return; }
    if (t.dataset.addrow) { draft.rows.push({ name: "", qty: 1, amount: 0 }); paint(); return; }
    if (t.dataset.f === "del" && t.dataset.row != null) { draft.rows.splice(Number(t.dataset.row), 1); paint(); return; }
    if (t.dataset.em2) { insertText(t.dataset.em2); closePop(); return; }
    if (t.dataset.bg) { draft.bg = t.dataset.bg; paint(); closePop(); return; }
    if (t.dataset.sz !== undefined) { draft.size = t.dataset.sz; paint(); closePop(); return; }
    const b = t.closest("[data-dt]");
    if (!b) return;
    const act = b.dataset.dt;
    if (act === "photo") fileEl.click();
    else if (act === "rec") { rec ? stopRec() : startRec(); }
    else if (act === "dict") dictate();
    else if (act === "sketch") openSketch();
    else if (act === "emoji") { popEl.innerHTML = EMOJIS.map(x => `<button type="button" data-em2="${x}">${x}</button>`).join(""); popEl.classList.add("on"); }
    else if (act === "bg") { popEl.innerHTML = BGS.map(g => `<button type="button" data-bg="${g.k}" class="${draft.bg === g.k ? "on" : ""}" style="${g.css ? "background:" + g.css : ""}">${g.n}</button>`).join(""); popEl.classList.add("on"); }
    else if (act === "size") { popEl.innerHTML = [["", "標準"], ["lg", "大字"], ["sm", "小字"]].map(p => `<button type="button" data-sz="${p[0]}" class="${draft.size === p[0] ? "on" : ""}">${p[1]}</button>`).join(""); popEl.classList.add("on"); }
    else if (act === "rows") { if (!draft.rows.length) draft.rows.push({ name: "", qty: 1, amount: 0 }); paint(); }
  }
  function closePop() { if (popEl) { popEl.innerHTML = ""; popEl.classList.remove("on"); } }

  document.addEventListener("input", e => {
    const el = e.target;
    if (!draft || !el.dataset || el.dataset.row == null || !el.dataset.f) return;
    const i = Number(el.dataset.row), f = el.dataset.f, v = el.value;
    if (!draft.rows[i]) return;
    if (f === "name") draft.rows[i].name = v;
    if (f === "qty") draft.rows[i].qty = parseFloat(v) || 0;
    if (f === "amount") draft.rows[i].amount = parseFloat(v) || 0;
    const tt = document.getElementById("dtTotal");
    if (tt) tt.textContent = "NT$" + rowsTotal().toLocaleString();
  });

  function insertText(str) {
    if (!inputEl) return;
    const s = inputEl.selectionStart ?? inputEl.value.length, e2 = inputEl.selectionEnd ?? s;
    inputEl.value = inputEl.value.slice(0, s) + str + inputEl.value.slice(e2);
    inputEl.selectionStart = inputEl.selectionEnd = s + str.length;
    inputEl.focus();
  }

  function extras(it) {
    let h = "";
    if (it.images && it.images.length) h += `<div class="diary-imgs">${it.images.map(m => `<img data-mid="${m.id}" src="${m.thumb}" alt="">`).join("")}</div>`;
    if (it.sketch) h += `<div class="diary-imgs"><img data-mid="${it.sketch.id}" src="${it.sketch.thumb}" alt="手寫"></div>`;
    if (it.audio) h += `<div class="diary-audio" data-aid="${it.audio.id}" data-dur="${it.audio.dur || 0}"><span class="adur">🔊 ${it.audio.dur || 0} 秒</span><audio controls preload="metadata"></audio></div>`;
    if (it.rows && it.rows.length) {
      const tot = it.rows.reduce((s, r) => s + (Number(r.amount) || 0) * (Number(r.qty) || 1), 0);
      h += `<div class="diary-rows">${it.rows.map((r, i) => `<div class="diary-check ${r.done ? "done" : ""}" data-check="${i}">
        <span class="bx">✓</span><span class="tx">${esc(r.name)}${(r.qty && r.qty != 1) ? " ×" + r.qty : ""}</span>
        <span>NT$${((Number(r.amount) || 0) * (Number(r.qty) || 1)).toLocaleString()}</span></div>`).join("")}
        <div class="diary-rows-total">合計 NT$${tot.toLocaleString()}</div></div>`;
    }
    return h;
  }
  function lineHtml(text) {
    const lines = String(text || "").split("\n");
    let out = "", bullets = [];
    const flush = () => { if (bullets.length) { out += `<ul class="diary-bullets">${bullets.map(b => `<li>${esc(b)}</li>`).join("")}</ul>`; bullets = []; } };
    lines.forEach(l => {
      const m = l.match(/^\s*[-•*]\s+(.*)$/);
      if (m) bullets.push(m[1]);
      else if (l.trim()) { flush(); out += `<div>${esc(l)}</div>`; }
    });
    flush();
    return out;
  }
  function bgStyle(it) {
    const g = BGS.find(x => x.k === it.bg);
    if (!g || !g.css) return "";
    return `background:${g.css};border-color:transparent;${g.dark ? "color:#f5f5f5;" : ""}`;
  }
  const sizeStyle = it => it && it.size === "lg" ? "font-size:1.05rem" : it && it.size === "sm" ? "font-size:.82rem" : "";

  async function afterRender(root, saveCb) {
    if (!root) return;
    root.querySelectorAll(".diary-audio").forEach(async el => {
      if (el.dataset.b) return; el.dataset.b = "1";
      const au = el.querySelector("audio");
      const dur = el.querySelector(".adur");
      const blob = await getBlob(el.dataset.aid);
      if (!blob) { if (dur) dur.textContent = "音檔不存在"; return; }
      au.src = URL.createObjectURL(blob);
      const stored = Number(el.dataset.dur || 0);          // 錄音時自己計的秒數
      const fmt = sec => {
        const s = Math.max(0, Math.floor(sec));   // 與瀏覽器播放器顯示一致（取整數秒）
        if (s < 3600) return "🔊 " + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
        return "🔊 " + Math.floor(s / 3600) + ":" + String(Math.floor((s % 3600) / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
      };
      if (dur) dur.textContent = fmt(stored || 0);
      // 只信「自己計時的秒數」；瀏覽器回報的怪值（webm 常見 Infinity 或錯超大值）不採用
      const useDuration = d => {
        if (!dur || !isFinite(d) || d <= 0) return;
        if (stored > 0 && Math.abs(d - stored) > 5) return;
        dur.textContent = fmt(d);
      };
      au.addEventListener("loadedmetadata", () => {
        // webm 常見 duration = Infinity：先 seek 到極大值逼出真實長度
        if (!isFinite(au.duration)) {
          const fix = () => {
            if (isFinite(au.duration) && au.duration > 0) { au.removeEventListener("timeupdate", fix); au.currentTime = 0; useDuration(au.duration); }
          };
          au.addEventListener("timeupdate", fix);
          try { au.currentTime = 1e101; } catch (e) {}
        } else {
          useDuration(au.duration);
        }
      });
      au.addEventListener("ended", () => { if (au.duration && isFinite(au.duration)) useDuration(au.duration); });
      au.addEventListener("error", () => { if (dur) dur.textContent = "無法播放"; });
    });
    root.querySelectorAll("img[data-mid]").forEach(img => {
      if (img.dataset.b) return; img.dataset.b = "1";
      if (img.complete && img.naturalWidth === 0) {
        getBlob(img.dataset.mid).then(b => { if (b) img.src = URL.createObjectURL(b); });
      }
      img.addEventListener("click", async ev => {
        ev.stopPropagation();
        const blob = await getBlob(img.dataset.mid);
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const ov = document.createElement("div"); ov.className = "diary-viewer";
        ov.innerHTML = `<img src="${url}"><button type="button">關閉</button>`;
        ov.addEventListener("click", () => { URL.revokeObjectURL(url); ov.remove(); });
        document.body.appendChild(ov);
      });
    });
    root.querySelectorAll(".diary-check[data-check]").forEach(chk => {
      if (chk.dataset.b) return; chk.dataset.b = "1";
      chk.addEventListener("click", ev => {
        ev.stopPropagation();
        const li = chk.closest("li"); if (!li || !saveCb) return;
        const item = window.__ppFindItem ? window.__ppFindItem(li.dataset.id) : null;
        const idx = Number(chk.dataset.check);
        if (!item || !item.rows || !item.rows[idx]) return;
        item.rows[idx].done = !item.rows[idx].done;
        chk.classList.toggle("done", !!item.rows[idx].done);
        saveCb();
      });
    });
  }

  function takeDraft() {
    const d = draft || empty();
    const out = {};
    if (d.images.length) out.images = d.images.map(x => ({ id: x.id, thumb: x.thumb, w: x.w, h: x.h }));
    if (d.audio) out.audio = d.audio;
    if (d.sketch) out.sketch = d.sketch;
    if (d.bg && d.bg !== "none") out.bg = d.bg;
    if (d.size) out.size = d.size;
    if (d.rows.length && d.rows.some(r => r.name || r.amount)) out.rows = d.rows.filter(r => r.name || r.amount).map(r => ({ name: r.name, qty: Number(r.qty) || 1, amount: Number(r.amount) || 0, done: false }));
    draft = empty();
    clearDraft();
    paint();
    return out;
  }
  const hasDraft = () => !!(draft && (draft.images.length || draft.audio || draft.sketch || (draft.rows && draft.rows.length)));

  let tt = null;
  function toast(msg) {
    let el = document.getElementById("diaryToast");
    if (!el) { el = document.createElement("div"); el.id = "diaryToast"; el.className = "diary-toast"; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add("on");
    clearTimeout(tt); tt = setTimeout(() => el.classList.remove("on"), 1900);
  }

  window.DiaryUI = { mount, loadEntry, takeDraft, hasDraft, extras, lineHtml, bgStyle, sizeStyle, afterRender, clearDraft, datePrefix, BGS };
})();
