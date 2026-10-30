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
    film: SVG('<rect x="3.2" y="5.2" width="12.6" height="13.6" rx="2.4"/><path d="M15.8 10.2l4.6-2.9v9.4l-4.6-2.9z"/><path d="M6.6 5.2v13.6M12.4 5.2v13.6"/>'),
    stop: SVG('<rect x="7.2" y="7.2" width="9.6" height="9.6" rx="2" fill="currentColor" stroke="none"/>')
  };

  // ==== 影片自動上傳到前賢的 YouTube 頻道（不公開），日記改用嵌入呈現（2026-10-30） ====
  // 服務在 kindhome.net/diary-yt（VPS，systemd diary-yt，FastAPI），配額上限每天 6 支
  const YT_API = 'https://kindhome.net/diary-yt';
  const YT_KEY = 'sV9q8JzI2r_OYzHqjxLYnSTGgqxguHZg';
  function ytTitle() {
    const first = String(liveText || '').split('\n').map(x => x.trim()).filter(Boolean)[0] || '日記影片';
    const d = new Date();
    const stamp = (d.getMonth()+1) + '/' + d.getDate() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    return ('日記 ' + stamp + ' ' + first).slice(0, 92);
  }
  async function ytUploadVideo(vd, file) {
    if (!vd || !file) return;
    vd.ytState = 'up';
    if (typeof paint === 'function') try { paint(); } catch (e) {}
    try {
      const fd = new FormData();
      fd.append('file', file, file.name || 'clip.mp4');
      fd.append('title', ytTitle());
      fd.append('privacy', 'unlisted');
      const r = await fetch(YT_API + '/upload', { method: 'POST', headers: { 'X-Key': YT_KEY }, body: fd });
      let j = null;
      try { j = await r.json(); } catch (e) {}
      if (j && j.ok && j.id) { vd.yt = j.id; vd.ytState = 'ok'; delete vd.ytErr; }
      else { vd.ytState = 'err'; vd.ytErr = (j && (j.detail || j.error)) || ('HTTP ' + r.status); }
    } catch (e) {
      vd.ytState = 'err'; vd.ytErr = String((e && e.message) || e);
    }
    try { if (window.__ppDiaryUpsert) window.__ppDiaryUpsert(liveText, draft); } catch (e) {}
    // 上傳完成 → 把那支影片的畫面就地換成 YouTube 嵌入（不動其他內容）
    try {
      const fig = inputEl && inputEl.querySelector('figure[data-vid="' + vd.id + '"]');
      if (fig && vd.yt) { const nf = buildVid(vd.id); if (nf) fig.replaceWith(nf); }
    } catch (e) {}
    if (typeof paint === 'function') try { paint(); } catch (e) {}
    if (vd.ytState === 'err') toast('上傳 YouTube 失敗：' + (vd.ytErr || ''));
  }

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
.dt-bar{display:grid;grid-template-columns:repeat(9,1fr);gap:0;padding:6px 0 2px;align-items:center}
.dt-bar .dt-btn{border:0!important;background:transparent!important;box-shadow:none!important;padding:9px 0 2px!important;color:var(--text2)!important;text-align:center;line-height:1;min-width:0}
.dt-bar .dt-btn svg{width:22px;height:22px;display:block;margin:0 auto}
.dt-bar .dt-btn:active{color:var(--accent)!important}
.dt-bar .dt-btn.rec{color:#dc2626!important}
.dt-aa{font-size:.95rem;font-weight:600;letter-spacing:.5px}
.dt-btn.rec{background:#fee2e2;border-color:#fca5a5;color:#b91c1c;font-weight:600}
.dt-draft{font-size:.8rem;color:var(--text2)}
.dt-imgs{display:flex;gap:9px;overflow-x:auto;padding:8px 0}
.dt-thumb{position:relative;flex:0 0 auto}
.dt-thumb.intext::after{content:'文中';position:absolute;left:4px;bottom:4px;background:rgba(239,175,88,.92);color:#fff;font-size:9px;padding:1px 5px;border-radius:6px}
.dt-thumb img{width:108px;height:108px;object-fit:cover;border-radius:12px;border:1px solid var(--border)}
.dt-thumb b{position:absolute;top:-6px;right:-6px;background:#3d2c1e;color:#fff;width:18px;height:18px;border-radius:50%;
  display:grid;place-items:center;font-size:11px;cursor:pointer}
.dt-audio{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin:6px 0;width:100%}
.dt-audio .dt-alab{font-variant-numeric:tabular-nums}
.dt-audio audio{flex:1 1 100%;width:100%;min-width:0;height:34px}
.dt-sk{margin:6px 0;display:flex;align-items:center;gap:8px}
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
.dt-live{display:none;align-items:center;gap:8px;padding:8px 4px 2px}
.dt-live.on{display:flex}
.dt-live .dot{width:9px;height:9px;border-radius:50%;background:#dc2626;flex:none;animation:dtBlink 1s infinite}
.dt-live.dict .dot{background:#f59e0b}
.dt-live .bars{display:flex;align-items:flex-end;gap:3px;height:20px;flex:1;min-width:0}
.dt-live .bars i{display:block;width:4px;height:5px;border-radius:2px;background:#e8b46a;transition:height .08s linear}
.dt-live .lbl{font-size:.72rem;color:#8b7355;flex:none}
@keyframes dtBlink{0%,100%{opacity:1}50%{opacity:.25}}
.sk-wrap{position:fixed;inset:0;background:#fff;z-index:210;display:flex;flex-direction:column}
.sk-head{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #eee;font-size:.9rem;color:#3d2c1e}
.sk-wrap canvas{flex:1;touch-action:none;background:#fff;width:100%}
`;
    document.head.appendChild(s);
  }

  let draft = null;
  const empty = () => ({ images: [], videos: [], audio: null, bg: "none", rows: [], sketch: null, size: "" });
  let toolsEl = null, inputEl = null, popEl = null, fileEl = null, videoEl = null;

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
        <button type="button" class="dt-btn" data-dt="video" title="影片" aria-label="影片">${IC.film}</button>
        <button type="button" class="dt-btn" data-dt="emoji" title="表情" aria-label="表情">${IC.smile}</button>
        <button type="button" class="dt-btn" data-dt="bg" title="背景" aria-label="背景">${IC.palette}</button>
      </div>
      <div class="dt-live" id="dtLive" aria-live="polite">
        <span class="dot"></span>
        <span class="bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
        <span class="lbl" id="dtLiveLbl">錄音中</span>
      </div>
      <div class="dt-meta"><span class="dt-saved" id="dtSaved"></span></div>
      <div class="dt-pop" id="dtPop"></div>
      <input type="file" id="dtFile" accept="image/*,video/*" multiple style="display:none">
      <input type="file" id="dtFileVid" accept="video/*" multiple style="display:none">`;
    const host = formEl.querySelector("#diaryTools") || formEl;
    host.appendChild(toolsEl);
    popEl = toolsEl.querySelector("#dtPop");
    fileEl = toolsEl.querySelector("#dtFile");
    toolsEl.addEventListener("click", onClick);
    fileEl.addEventListener("change", e => { addImages([...e.target.files]); e.target.value = ""; });
    videoEl = toolsEl.querySelector("#dtFileVid");
    videoEl.addEventListener("change", e => {
      const files = [...e.target.files]; e.target.value = "";
      if (files.length) addVideos(files);   // 從「影片」入口選的一律當影片（Android 可能不給 mime）
    });

    // ① 自動補日期（聚焦即補），② 隨寫隨存（草稿自動保存／還原）
    restoreDraft();
    if (inputEl) {
      // 日期不顯示在輸入介面，改在存檔後的日記方框右下外側
      inputEl.addEventListener("input", e => {
        liveText = edValue(e.target); touched = true; autoSizeTa();
        clearTimeout(detachTimer);
        if (!liveText.trim() && !draft.images.length && !draft.audio && !draft.sketch && !draft.rows.length) {
          detachTimer = setTimeout(() => { if (window.__ppDiaryUpsert) window.__ppDiaryUpsert("", null); }, 900);
        }
        scheduleSave();
      });
      window.addEventListener("resize", autoSizeTa);
      // 新增或編輯：一聚焦輸入框就把畫面帶到最上頭
      inputEl.addEventListener("focus", () => { if (window.__ppScrollTop) window.__ppScrollTop(); });
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
  let detachTimer = null;   // 清空後延遲收筆，下一句自動開新的一則
  let liveText = "";   // 即時緩衝：畫面重繪也不會丟字
  let touched = false;  // 使用者是否真的動過（避免空白時誤建／誤刪）
  let suppressSave = false;
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveDraftNow, 400); }
  function saveDraftNow() {
    if (editingLoad) return;   // 載入編輯中，不要把空白寫回去
    try {
      const ta = document.querySelector("#addText");
      const domText = ta ? (ta.tagName === "TEXTAREA" ? ta.value : edValue(ta)) : (inputEl ? edValue(inputEl) : "");
      if (domText) liveText = domText;
      const text = liveText;
      const hasAny = text.trim() || (draft && (draft.images.length || draft.audio || draft.sketch || (draft.rows && draft.rows.length)));
      if (!hasAny) {
        localStorage.removeItem(DRAFT_KEY);
        markSaved("");
        if (touched && !editingLoad && window.__ppDiaryUpsert) window.__ppDiaryUpsert("", null);   // 使用者真的清空才收掉這筆
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
    if (inputEl && !edValue(inputEl).trim() && liveText) edSet(liveText);
    if (!memHas && o.d) draft = Object.assign(empty(), o.d);
    if (draft && !Array.isArray(draft.videos)) draft.videos = [];
    if ((o.text && o.text.trim()) || (o.d && ((o.d.images || []).length || o.d.audio || o.d.sketch || (o.d.rows || []).length))) {
      markSaved("已還原草稿");
      if (inputEl && edValue(inputEl)) inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  // 把「正在寫的那筆」載回輸入框（從資料還原）
  // 多行內容自動長高，換行格式才看得到
  function autoSizeTa() {
    const ta = document.querySelector("#addText") || inputEl;
    if (!ta) return;
    // 輸入框至少佔畫面 1/3（扣掉工具列高度），內容更多才繼續長高
    if (ta.tagName !== "TEXTAREA") { ta.style.minHeight = Math.max(285, Math.round(window.innerHeight / 2.4) - 60) + "px"; return; }
    const minH = Math.max(285, Math.round(window.innerHeight / 2.4) - 60);
    ta.style.height = "auto";
    ta.style.height = Math.max(minH, Math.min(640, ta.scrollHeight)) + "px";
  }

  const stripStamp = s => String(s || "").replace(/^\s*\d{1,2}-\d{1,2}\s*(?:上午|下午)?\s*\d{0,2}:?\d{0,2}\s*\n?/, "");

  let editingLoad = false;   // 正在把某一筆載入編輯框，期間不自動存檔（避免空白覆蓋）
  function loadEntry(item) {
    if (!item) return;
    editingLoad = true;
    clearTimeout(saveTimer);
    suppressSave = true;
    liveText = stripStamp(item.text || "");
    const itemHasMedia = (item.images || []).length || (item.videos || []).length || item.audio || item.sketch || (item.rows || []).length;
    // 先還原附件，再組編輯器內容：圖片節點要用 draft.images 才長得出來
    if (itemHasMedia || !draft || (!draft.images.length && !draft.audio && !draft.sketch && !draft.rows.length)) {
      draft = {
        images: item.images || [], videos: item.videos || [], audio: item.audio || null, sketch: item.sketch || null,
        rows: item.rows || [], bg: item.bg || "none", size: item.size || ""
      };
    }
    if (draft && !Array.isArray(draft.videos)) draft.videos = [];
    if (inputEl && edValue(inputEl) !== liveText) edSet(liveText);
    // 🔴 保險：資料裡有影片、文字卻沒有對應標記（舊資料或被截斷）→ 補回編輯器，
    //    否則「加好影片後要編輯」會看不到那支影片。
    try {
      if (inputEl && isDiv(inputEl)) {
        const cur = edValue(inputEl);
        (draft.videos || []).forEach(vd => {
          if (!vd || !vd.id) return;
          if (cur.indexOf('〔vid:' + vd.id + '〕') >= 0) return;
          if (inputEl.querySelector('figure[data-vid="' + vd.id + '"]')) return;
          const fig = buildVid(vd.id);
          if (fig) { inputEl.appendChild(document.createElement('br')); inputEl.appendChild(fig); }
        });
        (draft.images || []).forEach(im => {
          if (!im || !im.id) return;
          if (cur.indexOf('〔img:' + im.id + '〕') >= 0) return;
          if (inputEl.querySelector('figure[data-img="' + im.id + '"]')) return;
          const fig = buildFig(im.id);
          if (fig) { inputEl.appendChild(document.createElement('br')); inputEl.appendChild(fig); }
        });
      }
    } catch (e) {}
    autoSizeTa();
    paint();
    setTimeout(() => { suppressSave = false; editingLoad = false; }, 700);
  }

  let savedTimer = null;
  function markSaved(msg) {
    const el = document.getElementById("dtSaved");
    if (!el) return;
    if (msg === "") { el.textContent = ""; el.classList.remove("on"); return; }
    el.textContent = "✓ 已儲存";
    el.classList.add("on");
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => el.classList.remove("on"), 1600);
  }
  function clearDraft() {
    clearTimeout(saveTimer);
    liveText = "";
    draft = { images: [], videos: [], audio: null, sketch: null, rows: [], bg: "none", size: "" };
    if (inputEl) { if (isDiv(inputEl)) edSet(""); else inputEl.value = ""; }
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    markSaved("");
    if (toolsEl) { try { paint(); } catch (e) {} }
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

  // ==== 圖文混合：圖片用唯一 ID 標記 〔img:ID〕插在文字游標處 ====
  const mkOf = id => '〔img:' + id + '〕';
  const vkOf = id => '〔vid:' + id + '〕';
  // ==== 內嵌圖文編輯器配接層：日記用 div contenteditable，圖片直接在文字之間 ====
  const isDiv = el => !!el && el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT';
  const escH = str => String(str == null ? '' : str).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function edValue(el) {
    const node = el || inputEl;
    if (!node) return '';
    if (!isDiv(node)) return node.value || '';
    let out = '';
    const walk = parent => {
      parent.childNodes.forEach(n => {
        if (n.nodeType === 3) out += n.textContent;
        else if (n.nodeName === 'FIGURE' && n.dataset && n.dataset.vid) out += '\n' + vkOf(n.dataset.vid) + '\n';
        else if (n.nodeName === 'FIGURE' && n.dataset && n.dataset.img) out += '\n' + mkOf(n.dataset.img) + '\n';
        else if (n.nodeName === 'BR') out += '\n';
        else if (n.nodeType === 1) {
          if (n.tagName === 'DIV' || n.tagName === 'P') { if (out && !/\n$/.test(out)) out += '\n'; walk(n); }
          else if (n.tagName === 'IMG') out += '';
          else out += n.textContent || '';
        }
      });
    };
    walk(node);
    return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  }

  function buildFig(id) {
    const im = (draft.images || []).find(x => x.id === id);
    if (!im) return null;
    const fig = document.createElement('figure');
    fig.className = 'ed-fig'; fig.dataset.img = id; fig.contentEditable = 'false';
    const img = document.createElement('img');
    img.src = im.thumb; img.alt = ''; img.loading = 'lazy';
    // 🔴 編輯器原本只掛 280px 縮圖，放大看就是糊的 → 先放縮圖頂著，背景換成 IndexedDB 裡的原圖
    try {
      if (window.__ppDiaryBlob && window.__ppDiaryBlob.get) {
        window.__ppDiaryBlob.get(id).then(b => { if (b) img.src = URL.createObjectURL(b); });
      }
    } catch (e) {}
    const cap = document.createElement('figcaption');
    cap.className = 'ed-cap'; cap.contentEditable = 'true'; cap.dataset.cap = id;
    cap.textContent = im.caption || '';
    fig.appendChild(img); fig.appendChild(cap);
    return fig;
  }

  function buildVid(id) {
    const vd = (draft.videos || []).find(x => x.id === id);
    if (!vd) return null;
    const fig = document.createElement('figure');
    fig.className = 'ed-fig ed-vid'; fig.dataset.vid = id; fig.contentEditable = 'false';
    if (vd.yt) {
      const wrap = document.createElement('div');
      wrap.className = 'ed-yt';
      const fr = document.createElement('iframe');
      fr.src = 'https://www.youtube.com/embed/' + vd.yt;
      fr.loading = 'lazy';
      fr.allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      fr.allowFullscreen = true;
      fr.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      wrap.appendChild(fr);
      const cap0 = document.createElement('figcaption');
      cap0.className = 'ed-cap'; cap0.contentEditable = 'true'; cap0.dataset.vcap = id;
      cap0.textContent = vd.caption || '';
      fig.appendChild(wrap); fig.appendChild(cap0);
      return fig;
    }
    const v = document.createElement('video');
    v.controls = true; v.playsInline = true; v.preload = 'metadata';
    if (vd.poster) v.poster = vd.poster;
    window.__ppDiaryBlob.get(id).then(b => {
      if (b) { v.src = URL.createObjectURL(b); return; }
      // 本機檔案不在了（換手機／清過資料）→ 至少留下海報與說明，不要變空白
      if (vd.yt) return;              // 有 YouTube 版本就交給嵌入播放
      const ph = document.createElement('div');
      ph.className = 'ed-vmiss';
      ph.textContent = '影片檔已不在這台裝置（只剩記錄）';
      fig.replaceChild(ph, v);
    });
    const cap = document.createElement('figcaption');
    cap.className = 'ed-cap'; cap.contentEditable = 'true'; cap.dataset.vcap = id;
    cap.textContent = vd.caption || '';
    fig.appendChild(v); fig.appendChild(cap);
    return fig;
  }

  function edSet(text) {
    const node = inputEl;
    if (!node) return;
    if (!isDiv(node)) { node.value = text; return; }
    const src = String(text == null ? '' : text);
    node.innerHTML = '';
    const re = /〔(img|vid):([A-Za-z0-9]+)〕/g;
    let last = 0, m;
    const pushText = chunk => {
      if (!chunk) return;
      chunk.split('\n').forEach((line, idx) => {
        if (idx) node.appendChild(document.createElement('br'));
        if (line) node.appendChild(document.createTextNode(line));
      });
    };
    while ((m = re.exec(src))) {
      pushText(src.slice(last, m.index));
      const el = (m[1] === 'vid') ? buildVid(m[2]) : buildFig(m[2]);
      if (el) node.appendChild(el);
      last = m.index + m[0].length;
    }
    pushText(src.slice(last));
  }

  function edInsert(node) {
    const el = inputEl;
    if (!el) return false;
    if (!isDiv(el)) return false;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) { el.appendChild(node); return true; }
    const r = sel.getRangeAt(0);
    r.deleteContents(); r.insertNode(node);
    const r2 = document.createRange(); r2.setStartAfter(node); r2.collapse(true);
    sel.removeAllRanges(); sel.addRange(r2);
    return true;
  }

  function edAppend(node) {
    const el = inputEl;
    if (!el || !isDiv(el)) return;
    el.appendChild(node);
  }

  function insertMarker(id) {
    if (!inputEl) return;
    if (isDiv(inputEl)) {
      const fig = buildFig(id);
      if (!fig) return;
      const anchorBr = document.createElement('br');
      edInsert(fig);
      edInsert(anchorBr);
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    // 其他表單（非日記）沿用純文字版
    const ta = inputEl;
    const v = ta.value || '';
    const s0 = (typeof ta.selectionStart === 'number') ? ta.selectionStart : v.length;
    const e0 = (typeof ta.selectionEnd === 'number') ? ta.selectionEnd : s0;
    const before = v.slice(0, s0), after = v.slice(e0);
    const lead = (before === '' || /\n$/.test(before)) ? '' : '\n';
    const chunk = lead + mkOf(id) + '\n';
    ta.value = before + chunk + after;
    try { ta.setSelectionRange(before.length + chunk.length, before.length + chunk.length); } catch (err) {}
    ta.dispatchEvent(new Event('input'));
  }
  function insertVidMarker(id) {
    if (!inputEl) return;
    if (isDiv(inputEl)) {
      const fig = buildVid(id);
      if (!fig) return;
      edInsert(fig);
      edInsert(document.createElement('br'));
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  function stripVidMarker(id) {
    if (!inputEl) return;
    if (isDiv(inputEl)) {
      const fig = inputEl.querySelector('figure[data-vid="' + id + '"]');
      if (fig) fig.remove();
      const t = edValue(inputEl);
      if (t.indexOf(vkOf(id)) >= 0) edSet(t.split(vkOf(id)).join(''));
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
  }
  function hasVidMarker(id) {
    if (!inputEl) return false;
    if (isDiv(inputEl)) return !!inputEl.querySelector('figure[data-vid="' + id + '"]');
    return String(inputEl.value || '').indexOf(vkOf(id)) >= 0;
  }
  function stripMarker(id) {
    if (!inputEl) return;
    if (isDiv(inputEl)) {
      const fig = inputEl.querySelector('figure[data-img="' + id + '"]');
      if (fig) fig.remove();
      const t = edValue(inputEl);
      if (t.indexOf(mkOf(id)) >= 0) edSet(t.split(mkOf(id)).join(''));
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const t = String(inputEl.value || '');
    const next = t.split(mkOf(id)).join('').replace(/\n{3,}/g, '\n\n');
    if (next !== t) { inputEl.value = next; inputEl.dispatchEvent(new Event('input')); }
  }
  function hasMarker(id) {
    if (!inputEl) return false;
    if (isDiv(inputEl)) return !!inputEl.querySelector('figure[data-img="' + id + '"]');
    return String(inputEl.value || '').indexOf(mkOf(id)) >= 0;
  }

  async function addImages(files) {
    touched = true;
    // 影片先挑出來處理，其餘走圖片
    const vids = [...files].filter(f => /^video\//.test(f.type));
    if (vids.length) await addVideos(vids);
    for (const f of files) {
      if (/^video\//.test(f.type)) continue;
      if (!/^image\//.test(f.type)) continue;
      try {
        const big = await imgFromFile(f, 2048, 0.9);
        const sm = await imgFromFile(f, 480, 0.72);
        const id = uid();
        await putBlob(id, big.blob);
        draft.images.push({ id, thumb: await toDataURL(sm.blob), w: big.w, h: big.h, caption: '' });
        insertMarker(id);
      } catch (e) { toast("圖片處理失敗"); }
    }
    if (window.__ppDiaryUpsert) window.__ppDiaryUpsert(liveText, draft);
    paint();
    if (window.__ppDiaryRerender) window.__ppDiaryRerender();
  }

  // 影片：存原檔到 IndexedDB，抓第一格當海報，內嵌在文字之間
  function videoMeta(file) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'metadata'; v.muted = true; v.playsInline = true;
      let done = false;
      const finish = (poster) => {
        if (done) return; done = true;
        const dur = Math.round(v.duration || 0);
        URL.revokeObjectURL(url);
        resolve({ poster: poster || '', dur, ok: !!v.videoWidth || dur > 0 });
      };
      v.onloadedmetadata = () => {
        try {
          v.currentTime = Math.min(0.3, (v.duration || 1) / 2);
          v.onseeked = () => {
            try {
              const w = 320, h = Math.max(1, Math.round(w * (v.videoHeight || 9) / (v.videoWidth || 16)));
              const c = document.createElement('canvas'); c.width = w; c.height = h;
              c.getContext('2d').drawImage(v, 0, 0, w, h);
              finish(c.toDataURL('image/jpeg', 0.6));
            } catch (e) { finish(''); }
          };
        } catch (e) { finish(''); }
      };
      v.onerror = () => finish('');
      setTimeout(() => finish(''), 8000);
      v.src = url;
    });
  }

  async function addVideos(files) {
    if (!Array.isArray(draft.videos)) draft.videos = [];
    for (const f of files) {
      try {
        if (f.size > 300 * 1024 * 1024) { toast('影片超過 300MB，請先壓縮再上傳'); continue; }
        const id = uid();
        await putBlob(id, f);
        // 先內嵌，不等解碼：手機上延遲才不會卡住
        const vdNew = { id, name: f.name || '影片', dur: 0, poster: '', caption: '' };
        draft.videos.push(vdNew);
        insertVidMarker(id);
        paint();
        if (window.__ppDiaryUpsert) window.__ppDiaryUpsert(liveText, draft);
        ytUploadVideo(vdNew, f);   // 自動上傳到 YouTube（不公開），完成後就地換成嵌入播放
        // 背景補長度與海報
        videoMeta(f).then(meta => {
          const vd = (draft.videos || []).find(x => x.id === id);
          if (!vd) return;
          vd.dur = meta.dur || 0;
          vd.poster = meta.poster || '';
          const fig = inputEl && inputEl.querySelector('figure[data-vid="' + id + '"]');
          if (fig && meta.poster) { const v = fig.querySelector('video'); if (v) v.poster = meta.poster; }
          paint();
          if (window.__ppDiaryUpsert) window.__ppDiaryUpsert(liveText, draft);
        }).catch(() => {});
      } catch (e) { toast('影片處理失敗'); }
    }
    paint();
    if (window.__ppDiaryRerender) window.__ppDiaryRerender();
  }

  let rec = null, chunks = [], recAt = 0;

  // ==== 錄音／聽寫中的聲波指示（讓使用者知道正在錄）====
  let liveRAF = null, liveAC = null, liveAnalyser = null, liveT0 = 0;
  function liveNode() { return toolsEl ? toolsEl.querySelector('#dtLive') : null; }
  function showLive(kind) {
    const el = liveNode(); if (!el) return;
    el.classList.add('on');
    el.classList.toggle('dict', kind === 'dict');
    const lbl = el.querySelector('#dtLiveLbl');
    if (lbl) lbl.textContent = kind === 'dict' ? '正在聽…請說話' : '錄音中 0:00';
    liveT0 = Date.now();
    if (liveRAF) cancelAnimationFrame(liveRAF);
    const bars = [...el.querySelectorAll('.bars i')];
    const tick = () => {
      const box = liveNode();
      if (!box || !box.classList.contains('on')) { liveRAF = null; return; }
      if (liveAnalyser) {
        const data = new Uint8Array(liveAnalyser.frequencyBinCount);
        liveAnalyser.getByteFrequencyData(data);
        bars.forEach((b, i) => {
          const v = data[Math.min(data.length - 1, i)] || 0;
          b.style.height = (4 + Math.round((v / 255) * 16)) + 'px';
        });
      } else {
        bars.forEach(b => { b.style.height = (5 + Math.round(Math.random() * 13)) + 'px'; });
      }
      if (kind !== 'dict') {
        const sec = Math.floor((Date.now() - liveT0) / 1000);
        const lb = box.querySelector('#dtLiveLbl');
        if (lb) lb.textContent = '錄音中 ' + Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
      }
      liveRAF = requestAnimationFrame(tick);
    };
    tick();
  }
  function hideLive() {
    const el = liveNode();
    if (el) el.classList.remove('on', 'dict');
    if (liveRAF) { cancelAnimationFrame(liveRAF); liveRAF = null; }
    if (liveAC) { try { liveAC.close(); } catch (e) {} liveAC = null; }
    liveAnalyser = null;
  }
  function attachAnalyser(stream) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      liveAC = new AC();
      const src = liveAC.createMediaStreamSource(stream);
      liveAnalyser = liveAC.createAnalyser();
      liveAnalyser.fftSize = 32;
      src.connect(liveAnalyser);
    } catch (e) { liveAnalyser = null; }
  }
  async function startRec() {
    if (!navigator.mediaDevices || !window.MediaRecorder) { toast("此瀏覽器不支援錄音"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      rec = new MediaRecorder(stream); chunks = []; recAt = Date.now();
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = async () => {
        hideLive();
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
      attachAnalyser(stream); showLive("rec");
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
    const base = inputEl ? edValue(inputEl) : "";
    sr.onresult = e => {
      let t = "";
      for (const r of e.results) t += r[0].transcript;
      if (inputEl) { edSet((base ? base + " " : "") + t); inputEl.dispatchEvent(new Event("input")); }
    };
    sr.onend = () => { sr = null; hideLive(); };
    sr.onerror = () => { sr = null; hideLive(); };
    try { sr.start(); showLive("dict"); } catch (e) { sr = null; hideLive(); }
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
    if (draft.images.length) h += `<div class="dt-imgs">${draft.images.map(m => `<span class="dt-thumb${hasMarker(m.id) ? ' intext' : ''}"><img src="${m.thumb}"><b data-delimg="${m.id}">×</b></span>`).join("")}</div>`;
    if ((draft.videos || []).length) h += `<div class="dt-imgs dt-vids">${draft.videos.map(v => `<span class="dt-thumb dt-vthumb${hasVidMarker(v.id) ? ' intext' : ''}">${v.poster ? `<img src="${v.poster}">` : '<i class="dt-vph">▶</i>'}<u class="dt-vdur">${v.dur ? Math.floor(v.dur / 60) + ':' + String(v.dur % 60).padStart(2, '0') : ''}</u><b data-delvid="${v.id}">×</b></span>`).join("")}</div>`;
    if (draft.audio) h += `<div class="dt-audio" data-dur="${draft.audio.dur || 0}"><span class="dt-alab">🔊 錄音</span><audio controls preload="metadata" data-preview-audio></audio><button type="button" data-delaudio="1">刪除</button></div>`;
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
    // 輸入框內的錄音播放器：接上 blob 並顯示正確秒數
    const pv = d.querySelector("[data-preview-audio]");
    if (pv && draft.audio) {
      const stored = Number(pv.parentElement.dataset.dur || draft.audio.dur || 0);
      const label = pv.parentElement.querySelector(".dt-alab");
      const show = () => { if (label) label.textContent = "🔊 錄音"; };
      show();
      getBlob(draft.audio.id).then(b => {
        if (!b) return;
        if (pv.src) { try { URL.revokeObjectURL(pv.src); } catch (e) {} }
        pv.src = URL.createObjectURL(b);
        pv.addEventListener("loadedmetadata", () => {
          if (!isFinite(pv.duration)) {
            const fix = () => { if (isFinite(pv.duration) && pv.duration > 0) { pv.removeEventListener("timeupdate", fix); pv.currentTime = 0; } };
            pv.addEventListener("timeupdate", fix);
            try { pv.currentTime = 1e101; } catch (e) {}
          }
        });
      }).catch(() => {});
    }
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
    if (t.dataset.delvid) { stripVidMarker(t.dataset.delvid); draft.videos = (draft.videos || []).filter(x => x.id !== t.dataset.delvid); delBlob(t.dataset.delvid); paint(); return; }
    if (t.dataset.delimg) { stripMarker(t.dataset.delimg); draft.images = draft.images.filter(x => x.id !== t.dataset.delimg); delBlob(t.dataset.delimg); paint(); return; }
    if (t.dataset.dtNext !== undefined && t.closest("[data-dt-next]")) {
      if (window.__ppDiaryFinish) window.__ppDiaryFinish();
      return;
    }
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
    else if (act === "video") { if (videoEl) videoEl.click(); }
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
    if (isDiv(inputEl)) {
      edInsert(document.createTextNode(str));
      inputEl.focus();
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const s = inputEl.selectionStart ?? inputEl.value.length, e2 = inputEl.selectionEnd ?? s;
    inputEl.value = inputEl.value.slice(0, s) + str + inputEl.value.slice(e2);
    inputEl.selectionStart = inputEl.selectionEnd = s + str.length;
    inputEl.focus();
  }

  // 編輯區內的圖片說明即時寫回
  document.addEventListener('input', e => {
    const cap = e.target && e.target.closest ? e.target.closest('.ed-cap') : null;
    if (!cap) return;
    if (cap.dataset.vcap) {
      const vd = (draft.videos || []).find(x => x.id === cap.dataset.vcap);
      if (vd) { vd.caption = cap.textContent.trim().slice(0, 120); scheduleSave(); }
      return;
    }
    const id = cap.dataset.cap;
    const im = (draft.images || []).find(x => x.id === id);
    if (im) { im.caption = cap.textContent.trim().slice(0, 120); scheduleSave(); }
  });

  function extras(it) {
    let h = "";
    if (it.images && it.images.length) h += `<div class="diary-imgs">${it.images.map(m => `<img data-mid="${m.id}" src="${m.thumb}" alt="">`).join("")}</div>`;
    if (it.sketch) h += `<div class="diary-imgs"><img data-mid="${it.sketch.id}" src="${it.sketch.thumb}" alt="手寫"></div>`;
    if (it.audio) h += `<div class="diary-audio" data-aid="${it.audio.id}" data-dur="${it.audio.dur || 0}"><span class="adur">🔊 錄音</span><audio controls preload="metadata"></audio></div>`;
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
      if (dur) dur.textContent = (stored > 0 && stored < 3600) ? fmt(stored) : "🔊 錄音";
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
      au.addEventListener("loadedmetadata", () => setTimeout(() => {
        if (isFinite(au.duration) && au.duration > 0 && window.__ppAudioFix) window.__ppAudioFix(el.dataset.aid, au.duration);
      }, 800));
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
    if (d.images.length) out.images = d.images.map(x => ({ id: x.id, thumb: x.thumb, w: x.w, h: x.h, caption: x.caption || '' }));
    if ((d.videos || []).length) out.videos = d.videos.map(x => ({ id: x.id, name: x.name || '影片', dur: Number(x.dur) || 0, poster: x.poster || '', caption: x.caption || '' }));
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
  const hasDraft = () => !!(draft && (draft.images.length || (draft.videos || []).length || draft.audio || draft.sketch || (draft.rows && draft.rows.length)));

  let tt = null;
  function toast(msg) {
    let el = document.getElementById("diaryToast");
    if (!el) { el = document.createElement("div"); el.id = "diaryToast"; el.className = "diary-toast"; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add("on");
    clearTimeout(tt); tt = setTimeout(() => el.classList.remove("on"), 1900);
  }

  window.__ppDiaryBlob = { get: getBlob, put: putBlob };
  window.__ppDiaryEd = { value: edValue, set: edSet };
  async function ytUploadBlob(item, vd, blob) {
    try {
      const f = new File([blob], (vd && vd.name) || 'clip.mp4', { type: (blob && blob.type) || 'video/mp4' });
      const fd = new FormData();
      fd.append('file', f, f.name);
      fd.append('title', ytTitle());
      fd.append('privacy', 'unlisted');
      const r = await fetch(YT_API + '/upload', { method: 'POST', headers: { 'X-Key': YT_KEY }, body: fd });
      let j = null; try { j = await r.json(); } catch (e) {}
      if (j && j.ok && j.id) { vd.yt = j.id; vd.ytState = 'ok'; delete vd.ytErr; return true; }
      vd.ytState = 'err'; vd.ytErr = (j && (j.detail || j.error)) || ('HTTP ' + r.status);
      return false;
    } catch (e) { vd.ytState = 'err'; vd.ytErr = String((e && e.message) || e); return false; }
  }
  window.DiaryUI = { edValue, mount, loadEntry, takeDraft, hasDraft, extras, lineHtml, bgStyle, sizeStyle, afterRender, clearDraft, datePrefix, ytUploadBlob, BGS };
})();
