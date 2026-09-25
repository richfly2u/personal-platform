#!/usr/bin/env python3
"""財政部網站 — 消費細項同步（CDP 驅動本機 Chromium）

流程：
  1. 啟動本機 Chromium（可見視窗 + CDP 9222 + 持久 profile）
  2. 導到發票查詢頁；若未登入，請使用者在視窗內手動登入（首次一次）
  3. 查詢當月發票 → 全選 → 下載 CSV 明細
  4. 解析 CSV → data/invoices.json（含品項明細 items）

用法：
  python sync_invoice_web.py              # 查詢本月
  python sync_invoice_web.py --month 2026-08   # 查詢指定月份
"""
import subprocess, time, json, os, re, sys, urllib.request, urllib.parse, base64
import websocket

CHROME = "C:/Users/alan/Chromium/chrome-win/chrome.exe"
PROFILE = "C:/Users/alan/personal-platform/chrome-profile"
CDP_URL = "http://127.0.0.1:9222"
PORTAL = "https://www.einvoice.nat.gov.tw/portal/btc/mobile"
LOGIN = "https://www.einvoice.nat.gov.tw/accounts/login/mw"
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
INVOICE_JSON = os.path.join(DATA_DIR, 'invoices.json')
CSV_OUT = os.path.join(DATA_DIR, 'invoice_items.csv')


# ---------- Chrome 啟動 ----------
def chrome_running():
    try:
        urllib.request.urlopen(CDP_URL + "/json/version", timeout=2)
        return True
    except Exception:
        return False


def launch_chrome():
    subprocess.Popen([
        CHROME,
        "--remote-debugging-port=9222",
        "--remote-allow-origins=*",
        f"--user-data-dir={PROFILE}",
        "--no-first-run",
        "--no-default-browser-check",
        "--window-size=1200,900",
        "about:blank",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(40):
        if chrome_running():
            return True
        time.sleep(0.5)
    return False


# ---------- CDP ----------
class CDP:
    def __init__(self):
        tabs = json.loads(urllib.request.urlopen(CDP_URL + "/json").read())
        target = next(t for t in tabs if t.get("type") == "page")
        self.ws = websocket.create_connection(target["webSocketDebuggerUrl"], timeout=60)
        self.mid = 0

    def cmd(self, method, params=None):
        self.mid += 1
        self.ws.send(json.dumps({"id": self.mid, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.mid:
                if "error" in msg:
                    raise RuntimeError(f"CDP {method}: {msg['error']}")
                return msg.get("result", {})

    def ev(self, expr):
        r = self.cmd("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
        if "exceptionDetails" in r:
            return None
        return r.get("result", {}).get("value")

    def nav(self, url):
        self.cmd("Page.navigate", {"url": url})

    def wait(self, seconds):
        time.sleep(seconds)

    def recv_until(self, method, predicate, timeout):
        """收 CDP 事件直到 method 符合 predicate，回傳 event params；逾時回 None"""
        deadline = time.time() + timeout
        self.ws.settimeout(0.2)
        while time.time() < deadline:
            try:
                msg = json.loads(self.ws.recv())
            except Exception:
                continue
            if msg.get("method") == method and predicate(msg.get("params", {})):
                return msg["params"]
        return None

    def get_body(self, request_id):
        return self.cmd("Network.getResponseBody", {"requestId": request_id})

    def click_js(self, selector):
        return self.ev(f"""
          (() => {{
            const el = document.querySelector({selector!r});
            if (!el) return 'NOT_FOUND';
            el.click();
            return 'CLICKED';
          }})()
        """)

    def set_input_js(self, selector, value):
        return self.ev(f"""
          (() => {{
            const el = document.querySelector({selector!r});
            if (!el) return 'NOT_FOUND';
            el.value = {value!r};
            el.dispatchEvent(new Event('input', {{bubbles: true}}));
            el.dispatchEvent(new Event('change', {{bubbles: true}}));
            return 'SET';
          }})()
        """)


# ---------- 登入狀態檢查 ----------
def is_logged_in(cdp):
    """導到 portal，看是否被重導到登入頁"""
    cdp.nav(PORTAL)
    cdp.wait(5)
    url = cdp.ev("location.href")
    return bool(url) and ("sid=" in url or "btc/mobile" in url and "login" not in url)


def wait_manual_login(cdp, timeout=300):
    """等待使用者在可見視窗手動登入"""
    print("請在 Chromium 視窗內完成登入（手機號碼 + 載具驗證碼 + 圖形驗證碼）...")
    cdp.nav(LOGIN)
    deadline = time.time() + timeout
    while time.time() < deadline:
        time.sleep(3)
        url = cdp.ev("location.href")
        if url and "sid=" in url:
            print("✅ 已登入")
            return True
    return False


# ---------- 查詢 + 下載 ----------
def goto_query(cdp):
    """導到發票查詢及捐贈頁"""
    cdp.nav(PORTAL)
    cdp.wait(5)
    # 若已在查詢頁（有「查詢」按鈕）就緒
    has_query = cdp.ev("!!Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '查詢')")
    if not has_query:
        # 點左側選單「發票查詢及捐贈」
        cdp.ev("""
          Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim() === '發票查詢及捐贈')?.click();
        """)
        cdp.wait(5)
    return True


def set_date_range(cdp, year, month):
    """設定查詢日期範圍（YYYY-MM 整月）"""
    # 日期起迄是雙欄位。先清空再設值。
    # 財政部日期元件：兩個 input，format 如 2026/9/1 與 2026/9/26
    days = [31, 29 if year % 4 == 0 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
    start = f"{year}/{month}/1"
    end = f"{year}/{month}/{days}"
    cdp.ev(f"""
      (() => {{
        const inputs = Array.from(document.querySelectorAll('input[type=text]'));
        // 日期起迄通常是前兩個可輸入的 textbox
        const dateInputs = inputs.filter(i => /起|迄|日期/.test(i.getAttribute('aria-label') || i.name || i.id || ''));
        for (const i of dateInputs) console.log('date input:', i.id, i.name, i.getAttribute('aria-label'));
        return dateInputs.length;
      }})()
    """)
    # 實際設定需看 DOM 結構，先回報欄位
    return


def parse_invoice_csv(path):
    """解析財政部 CSV 明細 → 發票 items"""
    if not os.path.exists(path):
        return []
    with open(path, encoding='utf-8-sig') as f:
        text = f.read()
    print(f"CSV 內容預覽（前 800 字）：")
    print(text[:800])
    return []


def query_invoices(cdp):
    """點查詢，等結果出現，回傳結果筆數"""
    cdp.ev("Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '查詢')?.click()")
    # 等結果表出現（全選 checkbox 或 下載CSV檔 按鈕）
    for _ in range(20):
        time.sleep(1)
        r = cdp.ev("JSON.stringify({selectAll: !!document.querySelector('input[type=checkbox]'), download: !!Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().includes('下載CSV')), countText: (document.body.innerText.match(/共\\s*\\d+\\s*筆/) || [''])[0]})")
        if r:
            d = json.loads(r)
            if d.get("download"):
                return d.get("countText", "")
    return ""


def set_display_count(cdp, n=50):
    """把顯示筆數改成 n（讓全部發票一頁顯示），點同列執行按鈕"""
    r = cdp.ev(f"""
      (() => {{
        const sels = Array.from(document.querySelectorAll('#SelectSizes')).filter(s => s.offsetParent !== null);
        const sel = sels[0];
        if (!sel) return 'no_select';
        sel.value = '{n}';
        sel.dispatchEvent(new Event('change', {{bubbles: true}}));
        const btn = sel.parentElement.querySelector('button');
        if (btn) btn.click();
        return 'done';
      }})()
    """)
    time.sleep(3)
    return r


def select_all_and_download(cdp):
    """勾選明細全選 → 注入 fetch 攔截 → 點下載 → 抓 CSV 本體存檔"""
    # 勾選 invoiceDetailAll（明細全選）
    cdp.ev("""
      (() => { const cb = document.getElementById('invoiceDetailAll'); if (cb && !cb.checked) cb.click(); return cb ? cb.checked : 'no_cb'; })()
    """)
    time.sleep(1)
    # 注入 fetch/XHR 攔截，抓 downloadInvoiceDetailCSV 的回應本體
    cdp.ev("""
      (() => {
        window.__csv = null;
        if (!window.__origFetch) {
          window.__origFetch = window.fetch.bind(window);
          window.fetch = async function(...args) {
            const url = typeof args[0] === 'string' ? args[0] : ((args[0] && args[0].url) || '');
            const resp = await window.__origFetch(...args);
            if (url.includes('downloadInvoiceDetailCSV')) {
              try { const c = resp.clone(); const t = await c.text(); if (t && t.length > 50) window.__csv = t; } catch(e) {}
            }
            return resp;
          };
        }
        if (!window.__origOpen) {
          window.__origOpen = XMLHttpRequest.prototype.open;
          XMLHttpRequest.prototype.open = function(m, url, ...rest) {
            this.__isCsv = String(url).includes('downloadInvoiceDetailCSV');
            return window.__origOpen.call(this, m, url, ...rest);
          };
          const origSend = XMLHttpRequest.prototype.send;
          XMLHttpRequest.prototype.send = function(...args) {
            if (this.__isCsv) {
              this.addEventListener('load', () => { if (this.responseText && this.responseText.length > 50) window.__csv = this.responseText; });
            }
            return origSend.apply(this, args);
          };
        }
        return 'injected';
      })()
    """)
    # 點「下載CSV檔」
    clicked = cdp.ev("""
      (() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim().includes('下載CSV')); if (!b) return 'no_button'; if (b.disabled) return 'disabled'; b.click(); return 'clicked'; })()
    """)
    print(f"下載按鈕：{clicked}")
    if clicked != 'clicked':
        return None
    # 等 __csv 出現
    for _ in range(30):
        time.sleep(1)
        csv = cdp.ev("window.__csv")
        if csv and len(csv) > 100:
            path = os.path.join(DATA_DIR, "invoice_items.csv")
            with open(path, "w", encoding="utf-8") as f:
                f.write(csv)
            print(f"✅ CSV 已存：{path}（{len(csv)} chars）")
            return path
    print("⚠️ 未抓到 CSV 本體")
    return None


def short_store(full):
    """賣方全名 → 短名"""
    brands = [
        ("萊爾富", "萊爾富"), ("全家", "全家"), ("全聯", "全聯"),
        ("統一超商", "統一超商"), ("台灣中油", "台灣中油"),
        ("全國加油站", "全國加油站"), ("特力屋", "特力屋"),
        ("崇德發", "崇德發"), ("家家買", "家家買"), ("阿一蔬果", "阿一蔬果"),
        ("光南", "光南大批發"), ("國立臺灣大學", "國立臺灣大學"),
    ]
    for key, short in brands:
        if key in full:
            return short
    for sep in ("股份有限公司", "有限公司", "公司"):
        if sep in full:
            name = full.split(sep)[0]
            return name[:6] + ("..." if len(name) > 6 else "")
    return full[:6] + ("..." if len(full) > 6 else "")


def parse_invoice_csv(path):
    """解析財政部 CSV 明細 → 合併進 data/invoices.json（含 items）"""
    if not path or not os.path.exists(path):
        print("❌ CSV 檔不存在")
        return []
    import csv as csvmod
    with open(path, encoding="utf-8-sig") as f:
        rows = list(csvmod.DictReader(f))

    # 分組：id -> {date, store, items}
    invoices = {}
    for r in rows:
        inv_id = (r.get("發票號碼") or "").strip()
        if not inv_id or not inv_id[0].isalnum():
            continue
        date_raw = (r.get("發票日期") or "").strip()
        date = f"{date_raw[4:6]}/{date_raw[6:8]}" if len(date_raw) == 8 else ""
        store_full = (r.get("賣方名稱") or "").strip()
        name = (r.get("消費明細_品名") or "").strip()
        try:
            qty = float(r.get("消費明細_數量") or 0)
            unit = float(r.get("消費明細_單價") or 0)
            amt = float(r.get("消費明細_金額") or 0)
        except ValueError:
            continue
        if not name:
            continue
        if inv_id not in invoices:
            invoices[inv_id] = {"date": date, "store": short_store(store_full), "items": []}
        invoices[inv_id]["items"].append({"name": name, "qty": qty, "unit_price": unit, "amount": amt})

    # 聚合同名品項 + 組出最終發票
    csv_invoices = {}
    for inv_id, inv in invoices.items():
        agg = {}
        for it in inv["items"]:
            k = it["name"]
            if k not in agg:
                agg[k] = {"name": k, "qty": 0.0, "unit_price": 0.0, "amount": 0.0}
            agg[k]["qty"] += it["qty"]
            agg[k]["amount"] += it["amount"]
        items = []
        for a in agg.values():
            a["qty"] = round(a["qty"], 3)
            a["amount"] = round(a["amount"], 2)
            a["unit_price"] = round(a["amount"] / a["qty"], 2) if a["qty"] else round(a["amount"], 2)
            items.append(a)
        total = round(sum(i["amount"] for i in items), 2)
        total = int(total) if total == int(total) else total
        main_item = next((i["name"] for i in items if i["amount"] >= 0 and "折扣" not in i["name"]), (items[0]["name"] if items else ""))
        csv_invoices[inv_id] = {"id": inv_id, "amount": total, "store": inv["store"], "item": main_item, "date": inv["date"], "items": items}

    # 合併進現有 invoices.json
    existing = json.load(open(INVOICE_JSON, encoding="utf-8"))
    emap = {e["id"]: e for e in existing}
    for inv_id, inv in csv_invoices.items():
        if inv_id in emap:
            old = emap[inv_id]
            if old.get("store") and not old["store"].endswith("..."):
                inv["store"] = old["store"]
            if old.get("date"):
                inv["date"] = old["date"]
            if old.get("item") and old["item"] != "明細更新中，請稍候":
                inv["item"] = old["item"]
            emap[inv_id] = inv
        else:
            emap[inv_id] = inv

    # 依日期排序（MM/DD 轉可比較 key），新的在前
    def date_key(inv):
        d = inv.get("date") or "00/00"
        m, dd = (d.split("/") + ["00", "00"])[:2]
        return int(m) * 100 + int(dd)
    merged = sorted(emap.values(), key=date_key, reverse=True)

    json.dump(merged, open(INVOICE_JSON, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"✅ 已合併 {len(csv_invoices)} 筆 CSV 明細 → invoices.json（共 {len(merged)} 筆）")
    return merged


def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    # 月份參數
    month_arg = None
    if "--month" in sys.argv:
        month_arg = sys.argv[sys.argv.index("--month") + 1]  # YYYY-MM

    if not chrome_running():
        print("啟動 Chromium...")
        if not launch_chrome():
            print("❌ Chromium 啟動失敗")
            return
    else:
        print("Chromium 已在執行")

    cdp = CDP()
    cdp.cmd("Page.enable")
    cdp.cmd("Runtime.enable")
    cdp.cmd("Network.enable")

    # 登入檢查
    if not is_logged_in(cdp):
        if not wait_manual_login(cdp):
            print("❌ 登入逾時，請重試")
            return

    # 查詢頁
    goto_query(cdp)

    year = time.strftime("%Y")
    month = time.strftime("%m").lstrip("0")
    if month_arg:
        year, month = month_arg.split("-")
    print(f"目標月份：{year}-{month}（目前用頁面預設日期範圍）")

    # 查詢
    count = query_invoices(cdp)
    print(f"查詢結果：{count}")

    # 顯示筆數改 50，全部一頁
    set_display_count(cdp, 50)

    # 全選 + 下載
    csv_path = select_all_and_download(cdp)
    if csv_path:
        print(f"✅ 已下載 CSV：{csv_path}")
        parse_invoice_csv(csv_path)
    else:
        print("⚠️ 未偵測到下載檔案")


if __name__ == "__main__":
    main()
