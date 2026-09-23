/**
 * 내 포트폴리오 — 구글 자동 시세 + 자동 백업 (Google Apps Script 웹 앱)
 *
 * 설치: 새 구글 스프레드시트 → 확장 프로그램 → Apps Script → 이 파일 내용 붙여넣기
 *       → setup 실행(권한 허용) → 배포 → 새 배포 → 웹 앱(실행: 나 / 액세스: 모든 사용자)
 *       → 웹 앱 URL과 「설정」 탭의 토큰을 앱에 입력
 *
 * 앱 → 여기로 오는 정보: 종목 코드(시세 조회), 앱 백업 JSON(자동 백업, 이 시트의 숨김 탭에 저장). 그 밖의 곳으로는 보내지 않는다.
 * 필요한 권한: 이 스프레드시트만(spreadsheets.currentonly), 트리거(script.scriptapp). 드라이브 권한은 쓰지 않는다.
 */

const SHEET_QUOTES = 'Quotes';
const SHEET_SETTINGS = '설정';
const SHEET_HOLDINGS = '보유현황';
const SHEET_BACKUP = '_백업'; // 숨김 탭. 백업 JSON을 나눠 저장
const CHUNK = 40000;       // 셀 하나에 넣는 글자 수
const KEEP_DAILY = 30;
const KEY_RE = /^(US:[A-Z][A-Z0-9.\-]{0,9}|KR:[0-9][0-9A-Z]{5}|FX:USDKRW)$/;

// ---------- 설치 ----------
function setup() {
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty('TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    props.setProperty('TOKEN', token);
  }
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone('Asia/Seoul');
  const s = ss.getSheetByName(SHEET_SETTINGS) || ss.insertSheet(SHEET_SETTINGS, 0);
  s.clear();
  s.getRange(1, 1, 5, 2).setValues([
    ['항목', '값'],
    ['토큰', token],
    ['사용법', '이 토큰을 앱의 「구글 자동 시세」 화면에 붙여 넣으세요. 다른 사람에게 알려 주지 마세요.'],
    ['토큰 바꾸기', 'Apps Script에서 resetToken 함수를 실행하면 새 토큰이 만들어지고 이전 토큰은 막힙니다.'],
    ['백업 위치', '이 시트의 숨김 탭 「' + SHEET_BACKUP + '」 (보기 → 숨겨진 시트). 보유 현황은 「' + SHEET_HOLDINGS + '」 탭'],
  ]);
  s.setColumnWidth(2, 520);
  quoteSheet_();
  // 하루 한 번 오래 안 쓴 시세 행 정리
  if (!ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === 'cleanup')) {
    ScriptApp.newTrigger('cleanup').timeBased().everyDays(1).atHour(4).create();
  }
  backupSheet_();
  Logger.log('설치 완료. 토큰: ' + token);
}

function resetToken() {
  PropertiesService.getScriptProperties().deleteProperty('TOKEN');
  setup();
}

// ---------- 웹 앱 입구 ----------
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!auth_(p.t)) return json_({ error: 'auth' });
  try {
    if (p.action === 'quotes') return json_(quotes_(p.s || ''));
    if (p.action === 'restore') return json_({ payload: readBackup_() });
    if (p.action === 'ping') return json_({ ok: true });
    return json_({ error: 'unknown action' });
  } catch (err) {
    return json_({ error: String(err && err.message || err) });
  }
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (x) { return json_({ error: 'bad json' }); }
  if (!auth_(body.t)) return json_({ error: 'auth' });
  try {
    if (body.action === 'backup') {
      writeBackup_(body.payload);
      return json_({ ok: true, savedAt: new Date().toISOString() });
    }
    return json_({ error: 'unknown action' });
  } catch (err) {
    return json_({ error: String(err && err.message || err) });
  }
}

function auth_(t) {
  const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  return !!token && typeof t === 'string' && t === token;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- 시세 ----------
function quoteSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_QUOTES);
  if (!sh) {
    sh = ss.insertSheet(SHEET_QUOTES);
    sh.getRange(1, 1, 1, 5).setValues([['키', '구글 심볼', '현재가', '거래 시각', '마지막 요청']]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function symbolOf_(key) {
  const [m, code] = key.split(':');
  if (m === 'US') return code;
  if (m === 'KR') return 'KRX:' + code;
  if (m === 'FX') return 'CURRENCY:' + code;
  return null;
}
const currencyOf_ = (key) => (key.indexOf('US:') === 0 ? 'USD' : 'KRW');
// 환율(CURRENCY:)은 속성 없이, 주식은 "price" 속성으로 조회
const priceFormula_ = (key, r) => (key.indexOf('FX:') === 0 ? '=IFERROR(GOOGLEFINANCE(B' + r + '),"")' : '=IFERROR(GOOGLEFINANCE(B' + r + ',"price"),"")');

function quotes_(s) {
  const keys = Array.from(new Set(String(s).split(',').map((k) => k.trim().toUpperCase()).filter(Boolean)));
  if (keys.length > 50) throw new Error('too many symbols');
  const bad = keys.filter((k) => !KEY_RE.test(k));
  const valid = keys.filter((k) => KEY_RE.test(k));
  const fetchedAt = new Date().toISOString();
  const out = {};
  bad.forEach((k) => { out[k] = { error: 'bad symbol' }; });

  // 60초 캐시
  const cache = CacheService.getScriptCache();
  const cached = cache.getAll(valid.map((k) => 'q:' + k));
  const need = [];
  valid.forEach((k) => { const c = cached['q:' + k]; if (c) out[k] = JSON.parse(c); else need.push(k); });
  if (!need.length) return { fetchedAt, quotes: out };

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = quoteSheet_();
    const last = sh.getLastRow();
    const rows = last > 1 ? sh.getRange(2, 1, last - 1, 5).getValues() : [];
    const rowOf = {};
    rows.forEach((r, i) => { rowOf[r[0]] = i + 2; });
    const add = need.filter((k) => !rowOf[k]);
    if (add.length) {
      const start = sh.getLastRow() + 1;
      const vals = add.map((k, i) => {
        const r = start + i;
        return [k, symbolOf_(k), priceFormula_(k, r), k.indexOf('FX:') === 0 ? '' : '=IFERROR(GOOGLEFINANCE(B' + r + ',"tradetime"),"")', new Date()];
      });
      sh.getRange(start, 1, vals.length, 5).setValues(vals);
      add.forEach((k, i) => { rowOf[k] = start + i; });
    }
    // 예전 수식(환율에 "price" 속성 사용)을 고친다
    need.forEach((k) => {
      const cell = sh.getRange(rowOf[k], 3);
      const f = priceFormula_(k, rowOf[k]);
      if (cell.getFormula() !== f) cell.setFormula(f);
    });
    SpreadsheetApp.flush();

    const read = () => {
      const n = sh.getLastRow() - 1;
      const v = sh.getRange(2, 1, n, 4).getValues();
      const m = {};
      v.forEach((r) => { m[r[0]] = r; });
      return m;
    };
    let data = read();
    // 새로 넣은 수식은 계산에 몇 초 걸릴 수 있다(최대 3초 대기)
    for (let tries = 0; tries < 3 && need.some((k) => !(Number(data[k] && data[k][2]) > 0)); tries++) {
      Utilities.sleep(1000);
      SpreadsheetApp.flush();
      data = read();
    }
    const now = new Date();
    need.forEach((k) => {
      const r = data[k];
      const price = r ? Number(r[2]) : NaN;
      if (price > 0) {
        const t = r[3] instanceof Date ? r[3].toISOString() : fetchedAt;
        out[k] = { price: price, currency: currencyOf_(k), asOf: t };
        cache.put('q:' + k, JSON.stringify(out[k]), 60);
      } else {
        out[k] = { error: 'pending' };
      }
      sh.getRange(rowOf[k], 5).setValue(now);
    });
  } finally {
    lock.releaseLock();
  }
  return { fetchedAt, quotes: out };
}

// 30일 넘게 요청이 없던 시세 행 정리(매일 트리거)
function cleanup() {
  const sh = quoteSheet_();
  const last = sh.getLastRow();
  if (last < 2) return;
  const v = sh.getRange(2, 5, last - 1, 1).getValues();
  const limit = Date.now() - 30 * 86400000;
  for (let i = v.length - 1; i >= 0; i--) {
    const d = v[i][0];
    if (d instanceof Date && d.getTime() < limit) sh.deleteRow(i + 2);
  }
  pruneDaily_();
}

// ---------- 백업 (드라이브 대신 이 시트의 숨김 탭에 저장: 추가 권한 불필요) ----------
function backupSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_BACKUP);
  if (!sh) {
    sh = ss.insertSheet(SHEET_BACKUP);
    sh.getRange(1, 1, 1, 3).setValues([['키', '순번', '데이터']]);
    sh.hideSheet();
  }
  return sh;
}

// 키가 keys에 있는 행을 지운다(아래에서 위로)
function deleteKeys_(sh, test) {
  const last = sh.getLastRow();
  if (last < 2) return;
  const v = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = v.length - 1; i >= 0; i--) if (test(String(v[i][0]))) sh.deleteRow(i + 2);
}

function writeBackup_(payload) {
  if (!payload || payload.app !== 'portfolio' || !payload.data) throw new Error('invalid backup');
  const text = JSON.stringify(payload);
  if (text.length > 3000000) throw new Error('backup too large');
  const day = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = backupSheet_();
    deleteKeys_(sh, (k) => k === 'latest' || k === day);
    const rows = [];
    // 'J' 접두어: 셀이 수식·숫자로 바뀌지 않게
    for (const key of ['latest', day]) for (let i = 0, n = 0; i < text.length; i += CHUNK, n++) rows.push([key, n, 'J' + text.slice(i, i + CHUNK)]);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
  } finally {
    lock.releaseLock();
  }
  writeHoldingsSheet_(payload.data);
}

function readBackup_() {
  const sh = backupSheet_();
  const last = sh.getLastRow();
  if (last < 2) return null;
  const v = sh.getRange(2, 1, last - 1, 3).getValues().filter((r) => String(r[0]) === 'latest').sort((a, b) => a[1] - b[1]);
  if (!v.length) return null;
  return JSON.parse(v.map((r) => String(r[2]).slice(1)).join(''));
}

// 날짜별 사본은 최근 KEEP_DAILY일만 남긴다
function pruneDaily_() {
  const limit = Utilities.formatDate(new Date(Date.now() - KEEP_DAILY * 86400000), 'Asia/Seoul', 'yyyy-MM-dd');
  deleteKeys_(backupSheet_(), (k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && k < limit);
}

// 사람이 볼 수 있는 표(엑셀 대신 보기용). 매 백업마다 새로 씀
function writeHoldingsSheet_(d) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_HOLDINGS) || ss.insertSheet(SHEET_HOLDINGS);
  sh.clear();
  const acc = {};
  (d.accounts || []).forEach((a) => { acc[a.id] = a.name; });
  const rows = [['계좌', '시장', '종목', '종목코드/티커', '분류', '보유수량', '평균단가', '평단 통화']];
  (d.holdings || []).forEach((h) => rows.push([acc[h.accountId] || '', h.market === 'US' ? '해외' : '국내', h.market === 'US' ? (h.ticker || '') : (h.name || ''), h.ticker || '', h.category || '', h.quantity, h.avgPrice, h.costCurrency || '']));
  rows.push(['', '', '', '', '', '', '', '']);
  rows.push(['계좌', '현금 통화', '예수금', '', '', '', '', '']);
  (d.cash || []).forEach((c) => rows.push([acc[c.accountId] || '', c.currency, c.amount, '', '', '', '', '']));
  sh.getRange(1, 1, rows.length, 8).setValues(rows);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, 8).setFontWeight('bold');
}
