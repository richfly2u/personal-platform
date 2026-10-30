/* 榮哥動起來 — 完整備份（JSON＋日記照片/影片/錄音/手畫）→ 前賢的 Google 雲端硬碟
 * 流程：把 localStorage 資料與 IndexedDB 內所有附件打包成一個 zip（僅儲存、不壓縮），
 *       POST 到 kindhome.net/pp-backup/upload，VPS 收到後用 rclone 丟進 gdrive:榮哥動起來備份/
 * 特色：零外部相依（自寫 STORE 模式 zip writer），有上傳進度、成功/失敗都會明確顯示。
 */
(function () {
  'use strict';

  var API = 'https://kindhome.net/pp-backup';
  var KEY = 'sV9q8JzI2r_OYzHqjxLYnSTGgqxguHZg';
  var DB_NAME = 'pp_diary', STORE = 'media';
  var MAX_BYTES = 1800 * 1024 * 1024; // 服務端上限 1900MB，留餘裕

  /* ---------- CRC32 ---------- */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* ---------- 最小 ZIP 產生器（STORE） ---------- */
  function dosTime(d) {
    var time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
    var date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
    return { time: time, date: date };
  }

  function makeZip(entries) {
    // entries: [{name, data: Uint8Array, date}]
    var encoder = new TextEncoder();
    var parts = [];
    var central = [];
    var offset = 0;
    var stamp = dosTime(new Date());

    entries.forEach(function (e) {
      var nameBytes = encoder.encode(e.name);
      var crc = crc32(e.data);
      var size = e.data.length;
      var dt = e.date ? dosTime(e.date) : stamp;

      var lh = new Uint8Array(30 + nameBytes.length);
      var dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);          // version needed
      dv.setUint16(6, 0x0800, true);      // UTF-8 flag
      dv.setUint16(8, 0, true);           // store
      dv.setUint16(10, dt.time, true);
      dv.setUint16(12, dt.date, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, size, true);
      dv.setUint32(22, size, true);
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true);
      lh.set(nameBytes, 30);

      parts.push(lh, e.data);

      var ch = new Uint8Array(46 + nameBytes.length);
      var cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, dt.time, true);
      cv.setUint16(14, dt.date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      ch.set(nameBytes, 46);
      central.push(ch);

      offset += lh.length + size;
    });

    var centralSize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var eocd = new Uint8Array(22);
    var ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    return new Blob(parts.concat(central, [eocd]), { type: 'application/zip' });
  }

  /* ---------- IndexedDB 附件 ---------- */
  function openDB() {
    return new Promise(function (res, rej) {
      var rq = indexedDB.open(DB_NAME, 1);
      rq.onupgradeneeded = function () {
        var d = rq.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
  }

  function readAllBlobs() {
    return openDB().then(function (db) {
      return new Promise(function (res, rej) {
        if (!db.objectStoreNames.contains(STORE)) return res([]);
        var tx = db.transaction(STORE, 'readonly');
        var st = tx.objectStore(STORE);
        var keysReq = st.getAllKeys();
        var valsReq = st.getAll();
        tx.oncomplete = function () {
          var keys = keysReq.result || [], vals = valsReq.result || [];
          res(keys.map(function (k, i) { return { id: String(k), blob: vals[i] }; }).filter(function (x) { return x.blob instanceof Blob; }));
        };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }

  function extOf(blob, id) {
    var t = (blob && blob.type) || '';
    if (t.indexOf('jpeg') >= 0) return 'jpg';
    if (t.indexOf('png') >= 0) return 'png';
    if (t.indexOf('webp') >= 0) return 'webp';
    if (t.indexOf('mp4') >= 0) return 'mp4';
    if (t.indexOf('quicktime') >= 0) return 'mov';
    if (t.indexOf('webm') >= 0) return 'webm';
    if (t.indexOf('mpeg') >= 0) return 'mp3';
    if (t.indexOf('wav') >= 0) return 'wav';
    if (t.indexOf('ogg') >= 0) return 'ogg';
    if (t.indexOf('json') >= 0) return 'json';
    return 'bin';
  }

  /* ---------- 進度面板 ---------- */
  var panel = null;
  function showPanel() {
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'ppFullBackupPanel';
      panel.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(30,26,20,.55);display:flex;align-items:center;justify-content:center;padding:24px;';
      panel.innerHTML = '<div style="background:#fffdf7;border-radius:18px;padding:20px 18px;max-width:340px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,.18);font-family:inherit;">' +
        '<div id="ppFbTitle" style="font-size:16px;font-weight:700;color:#4b3f2f;margin-bottom:10px;">完整備份中…</div>' +
        '<div id="ppFbMsg" style="font-size:13px;color:#7a6a55;line-height:1.6;margin-bottom:12px;">正在整理資料</div>' +
        '<div style="height:8px;background:#efe6d6;border-radius:99px;overflow:hidden;"><div id="ppFbBar" style="height:100%;width:0%;background:#8fae7a;transition:width .25s;"></div></div>' +
        '<div id="ppFbClose" style="margin-top:14px;text-align:right;display:none;"><button type="button" style="border:0;background:#8fae7a;color:#fff;border-radius:10px;padding:8px 16px;font-size:14px;">關閉</button></div>' +
        '</div>';
      document.body.appendChild(panel);
      panel.querySelector('#ppFbClose button').addEventListener('click', function () { panel.remove(); panel = null; });
    }
    panel.querySelector('#ppFbClose').style.display = 'none';
    panel.querySelector('#ppFbBar').style.width = '0%';
    return panel;
  }
  function setProgress(pct, msg, title) {
    if (!panel) return;
    if (title) panel.querySelector('#ppFbTitle').textContent = title;
    if (msg) panel.querySelector('#ppFbMsg').textContent = msg;
    if (typeof pct === 'number') panel.querySelector('#ppFbBar').style.width = Math.max(0, Math.min(100, pct)) + '%';
  }
  function finish(title, msg, ok) {
    if (!panel) showPanel();
    setProgress(100, msg, title);
    panel.querySelector('#ppFbBar').style.background = ok ? '#8fae7a' : '#c47a6a';
    panel.querySelector('#ppFbClose').style.display = 'block';
  }

  function fmt(n) {
    if (n > 1024 * 1024 * 1024) return (n / 1073741824).toFixed(2) + ' GB';
    if (n > 1024 * 1024) return (n / 1048576).toFixed(1) + ' MB';
    if (n > 1024) return (n / 1024).toFixed(0) + ' KB';
    return n + ' B';
  }

  function todayName() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return '榮哥動起來_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
  }

  /* ---------- 主流程 ---------- */
  async function run() {
    try {
      showPanel();
      setProgress(4, '讀取資料（文字紀錄／習慣）', '完整備份中…');

      var appData = null;
      try {
        appData = JSON.parse(localStorage.getItem('personal_platform_data_v2') || 'null');
      } catch (e) {}
      if (!appData && window.appData) appData = window.appData;
      var habit = localStorage.getItem('habit.v2') || localStorage.getItem('habit.v1') || null;

      var entries = [];
      var payload = {
        format: 'rongge-personal-platform-backup',
        schema: 2,
        exportedAt: new Date().toISOString(),
        kind: 'full',
        data: appData,
        habitData: habit,
        files: []
      };

      setProgress(10, '掃描日記附件（照片／影片／錄音／手畫）');
      var blobs = [];
      try { blobs = await readAllBlobs(); } catch (e) {}
      var totalBytes = 0;
      blobs.forEach(function (b) { totalBytes += (b.blob.size || 0); });

      if (totalBytes > MAX_BYTES) {
        finish('備份中止', '附件 ' + fmt(totalBytes) + ' 超過單次上限 ' + fmt(MAX_BYTES) + '，請先清理或分批。', false);
        return;
      }

      var done = 0;
      for (var i = 0; i < blobs.length; i++) {
        var b = blobs[i];
        var buf = new Uint8Array(await b.blob.arrayBuffer());
        var ext = extOf(b.blob, b.id);
        var path = 'media/' + b.id + '.' + ext;
        entries.push({ name: path, data: buf });
        payload.files.push({ id: b.id, path: path, type: b.blob.type || '', size: b.blob.size || buf.length });
        done += buf.length;
        setProgress(10 + 45 * (totalBytes ? done / totalBytes : 0), '打包附件 ' + (i + 1) + '/' + blobs.length + '（' + fmt(done) + '）');
        if (i % 8 === 0) await new Promise(function (r) { setTimeout(r, 0); });
      }

      var jsonBytes = new TextEncoder().encode(JSON.stringify(payload, null, 1));
      entries.push({ name: 'backup.json', data: jsonBytes });

      setProgress(58, '壓縮成 zip（僅封裝，不壓縮以保留原畫質）');
      var zip = makeZip(entries);
      entries = null;

      setProgress(62, '上傳 ' + fmt(zip.size) + ' 到雲端…（請保持連線）', '上傳備份中…');
      var res = await upload(zip);

      finish('備份完成 ☁',
        '已存到你的 Google 雲端硬碟：\n榮哥動起來備份／' + res.name + '\n大小 ' + fmt(res.bytes) + '（雲端已核對大小一致）',
        true);
      if (window.tipToast) try { window.tipToast('完整備份已上傳 Google 雲端'); } catch (e) {}
    } catch (err) {
      var m = (err && err.message) ? err.message : String(err);
      finish('備份失敗', m + '\n請確認網路後再試一次。', false);
    }
  }

  function upload(zip) {
    return new Promise(function (resolve, reject) {
      var fd = new FormData();
      fd.append('file', zip, todayName() + '.zip');
      fd.append('name', 'rongge');
      var xhr = new XMLHttpRequest();
      xhr.open('POST', API + '/upload');
      xhr.setRequestHeader('X-Key', KEY);
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) {
          var pct = 62 + 36 * (e.loaded / e.total);
          setProgress(pct, '已上傳 ' + fmt(e.loaded) + ' / ' + fmt(e.total));
        }
      };
      xhr.onload = function () {
        var body = null;
        try { body = JSON.parse(xhr.responseText || '{}'); } catch (e) {}
        if (xhr.status >= 200 && xhr.status < 300 && body && body.ok) resolve(body);
        else reject(new Error('伺服器回應 ' + xhr.status + '：' + ((body && (body.detail || body.error)) || '未知錯誤')));
      };
      xhr.onerror = function () { reject(new Error('網路中斷，上傳未完成')); };
      xhr.ontimeout = function () { reject(new Error('上傳逾時')); };
      xhr.timeout = 3600000;
      xhr.send(fd);
    });
  }

  window.fullBackupToDrive = run;
})();
