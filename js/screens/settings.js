import { html, useState, useRef } from '../react.js';
import { TopBar, Seg, Chips, Field, NumInput, ListRow, ask, toast, go, haptic, BROKERS, download, openSheet } from '../components.js';
import { when, daysAgo, parseNum, money } from '../format.js';
import { saveAccount, deleteAccount, saveSettings, exportData, importData, validateBackup, wipe } from '../store.js';
import { fetchQuotes, explain, pushBackup, fetchGoogleBackup, refreshQuotes } from '../google.js';

export function Settings({ ctx }) {
  const s = ctx.settings;
  const lastBk = [s.lastGoogleBackupAt, s.lastBackupAt].filter(Boolean).sort().pop();
  const Item = ({ href, onClick, label, value }) => html`<${ListRow} href=${href} onClick=${onClick} title=${label} right=${html`<span className="m" style=${{ fontSize: 'var(--fs-t6)', fontWeight: 500 }}>${value}</span>`} chev />`;
  const Toggle = ({ label, checked, onChange, desc }) => html`<label className="sw-row"><span>${label}${desc && html`<div className="sm">${desc}</div>`}</span><input type="checkbox" role="switch" className="toggle" checked=${!!checked} onChange=${(e) => onChange(e.target.checked)} /></label>`;
  const wipeAll = async () => {
    if (!(await ask({ title: '모든 데이터를 지울까요?', desc: "되돌릴 수 없어요. 먼저 백업해 두면 안전해요.\n계속하려면 '삭제'를 입력해 주세요.", ok: '모두 지우기', danger: true, typeToConfirm: '삭제' }))) return;
    await wipe(); toast('모두 지웠어요'); go('#/start');
  };
  return html`
    <${TopBar} title="설정" large />
    <div className="body">
      <section className="sec" style=${{ gap: 0 }}>
        <${Item} href="#/account/manage" label="계좌 · 수수료" value=${`${ctx.accounts.length}개`} />
        <${Item} href="#/connect" label="구글 자동 시세" value=${ctx.connected ? '연결됨' : '연결 안 됨'} />
        <${Item} onClick=${() => openSheet('prices')} label="시세 · 환율 입력" value=${ctx.pricesAt ? `${daysAgo(ctx.pricesAt)}일 전` : '없음'} />
        <${Item} href="#/backup" label="백업 · 복원" value=${lastBk ? when(lastBk) : '안 함'} />
        <${Item} href="#/account/history" label="거래내역 · 현금 기록" value="" />
      </section>
      <section className="sec" style=${{ gap: '8px' }}>
        <h2>화면</h2>
        <div className="row" style=${{ alignItems: 'center', minHeight: '48px' }}><span style=${{ fontSize: 'var(--fs-t5)' }}>테마</span>
          <${Seg} label="테마" value=${s.theme || 'dark'} onChange=${(v) => saveSettings({ theme: v })} options=${[['system', '시스템'], ['light', '밝게'], ['dark', '어둡게']]} /></div>
        <${Toggle} label="금액 가리기" checked=${s.hideAmounts} onChange=${(v) => saveSettings({ hideAmounts: v })} />
        <${Toggle} label="진동 피드백" desc="저장·매매 기록 때 짧게 진동해요." checked=${s.haptics !== false} onChange=${(v) => saveSettings({ haptics: v })} />
      </section>
      <section className="sec" style=${{ gap: '8px' }}>
        <h2>시세</h2>
        <div className="row" style=${{ alignItems: 'center', minHeight: '48px' }}><span style=${{ fontSize: 'var(--fs-t5)' }}>자동 갱신</span>
          <${Seg} label="자동 시세 갱신 주기" value=${String(s.refreshMinutes)} onChange=${(v) => saveSettings({ refreshMinutes: Number(v) })} options=${[['5', '5분'], ['15', '15분'], ['30', '30분']]} /></div>
        <div className="row" style=${{ alignItems: 'center', minHeight: '48px' }}><span style=${{ fontSize: 'var(--fs-t5)' }}>입력 알림</span>
          <${Seg} label="현재가 입력 알림 기준" value=${String(s.staleDays)} onChange=${(v) => saveSettings({ staleDays: Number(v) })} options=${[['3', '3일'], ['7', '7일'], ['30', '30일']]} /></div>
      </section>
      <section className="sec">
        <a className="btn sec2" href="#/start">처음 시작하기 다시 보기</a>
        <button className="btn danger" type="button" onClick=${wipeAll}>전체 데이터 삭제</button>
        <div className="sm">내 포트폴리오 · 데이터는 이 폰에만 있어요${s.persisted === false ? ' · 이 기기에서 영구 보존이 허용되지 않았어요. 백업을 자주 해 주세요.' : ''}</div>
      </section>
    </div>`;
}

// 계좌 만들기/편집(처음 시작하기에서도 사용)
export function AccountForm({ ctx, params = {}, onboarding, onSaved }) {
  const edit = params.id ? ctx.accById[params.id] : null;
  const d = ctx.settings.defaultFees;
  const [broker, setBroker] = useState(edit?.broker || '키움');
  const [name, setName] = useState(edit?.name || '');
  const [nameTouched, setNT] = useState(!!edit);
  const [type, setType] = useState(edit?.type || 'GENERAL');
  const [base, setBase] = useState(edit?.baseCurrency || 'USD');
  const [curs, setCurs] = useState(edit?.currencies || ['KRW', 'USD']);
  const [fb, setFb] = useState(String(edit?.buyFeePct ?? d.buyFeePct));
  const [fs, setFs] = useState(String(edit?.sellFeePct ?? d.sellFeePct));
  const [ft, setFt] = useState(String(edit?.sellTaxPct ?? d.sellTaxPct));
  const [err, setErr] = useState({});
  const isBank = broker === '은행' || type === 'BANK';
  const suggested = broker === '은행' ? '은행' : `${broker === '직접 입력' ? '' : broker + ' · '}${base === 'USD' ? '미국주식' : '국내주식'}`;
  const shownName = nameTouched ? name : suggested;

  const pickBroker = (b) => { setBroker(b); if (b === '은행') { setType('BANK'); setBase('KRW'); setCurs(['KRW']); } else if (type === 'BANK') setType('GENERAL'); };
  const pickBase = (b) => { setBase(b); if (!edit) setCurs(b === 'USD' ? ['KRW', 'USD'] : ['KRW']); };
  const toggleCur = (c) => setCurs(curs.includes(c) ? curs.filter((x) => x !== c) : [...curs, c]);

  const save = async () => {
    const e = {};
    const n = shownName.trim();
    const vb = parseNum(fb), vs = parseNum(fs), vt = parseNum(ft);
    if (!n) e.name = '계좌 이름을 넣어 주세요.';
    if (!isBank) {
      if (!(vb >= 0 && vb < 5)) e.fb = '0~5 사이의 % 값으로 넣어 주세요';
      if (!(vs >= 0 && vs < 5)) e.fs = '0~5 사이의 % 값으로 넣어 주세요';
      if (!(vt >= 0 && vt < 5)) e.ft = '0~5 사이의 % 값으로 넣어 주세요';
    }
    if (!curs.length) e.curs = '통화를 하나 이상 골라 주세요.';
    setErr(e);
    if (Object.keys(e).length) return;
    const acc = await saveAccount({
      ...(edit || {}), name: n, broker, type: isBank ? 'BANK' : type, baseCurrency: isBank ? 'KRW' : base,
      currencies: curs, buyFeePct: isBank ? 0 : vb, sellFeePct: isBank ? 0 : vs, sellTaxPct: isBank ? 0 : vt,
    });
    toast('저장했어요'); haptic();
    if (onSaved) onSaved(acc); else go('#/account/manage');
  };
  const del = async () => {
    const n = ctx.holdings.filter((h) => h.accountId === edit.id).length;
    if (!(await ask({ title: `${edit.name} 계좌를 지울까요?`, desc: n ? `이 계좌의 종목 ${n}개, 현금, 거래 내역도 함께 지워져요.` : '이 계좌의 현금 기록도 함께 지워져요.', ok: '삭제하기', danger: true }))) return;
    await deleteAccount(edit.id); toast('삭제했어요'); go('#/account/manage');
  };

  return html`
    ${!onboarding && html`<${TopBar} title=${edit ? '계좌 편집' : '계좌 추가'} back="#/account/manage" />`}
    <div className="body">
      <section className="sec" style=${{ gap: '16px' }}>
        <div className="fld"><span className="lab">증권사</span><${Chips} label="증권사" value=${broker} onChange=${pickBroker} options=${BROKERS.map((b) => [b, b])} /></div>
        <${Field} id="af-name" label="계좌 이름" error=${err.name}><input id="af-name" className="inp" value=${shownName} onChange=${(e) => { setNT(true); setName(e.target.value); }} /><//>
        ${!isBank && html`
          <div className="fld"><span className="lab">주로 사는 주식</span><${Seg} label="주로 사는 주식" block size="l" value=${base} onChange=${pickBase} options=${[['USD', '해외 ($)'], ['KRW', '국내 (원)']]} />
            <div className="sm">섞여 있어도 종목마다 바꿀 수 있어요.</div></div>
          <${Field} id="af-type" label="계좌 종류"><select id="af-type" className="inp" value=${type} onChange=${(e) => setType(e.target.value)}>
            <option value="GENERAL">일반</option><option value="ISA">ISA</option><option value="PENSION">연금저축</option><option value="IRP">IRP</option></select><//>
          <div className="two">
            <${Field} id="af-fb" label="매수 수수료 (%)" error=${err.fb}><${NumInput} id="af-fb" value=${fb} onChange=${setFb} error=${err.fb} /><//>
            <${Field} id="af-fs" label="매도 수수료 (%)" error=${err.fs}><${NumInput} id="af-fs" value=${fs} onChange=${setFs} error=${err.fs} /><//>
          </div>
          <${Field} id="af-ft" label="국내 개별주 매도 세금 (%)" error=${err.ft} hint="국내 개별주를 팔 때만 자동으로 더해요(ETF·해외 제외).">
            <${NumInput} id="af-ft" value=${ft} onChange=${setFt} error=${err.ft} /><//>
          <div className="note">요율은 예시값이에요. 증권사 앱의 수수료 안내를 보고 한 번만 맞춰 주세요.</div>`}
        <div className="fld"><span className="lab">현금 통화</span>
          <div className="chips">${['KRW', 'USD'].map((c) => html`<button key=${c} type="button" role="checkbox" aria-checked=${curs.includes(c)} className=${'chip' + (curs.includes(c) ? ' on' : '')} onClick=${() => toggleCur(c)}>${c === 'KRW' ? '원화' : '달러 $'}</button>`)}</div>
          ${err.curs && html`<div className="err">${err.curs}</div>`}
          ${edit && ctx.cash.filter((c) => c.accountId === edit.id && !curs.includes(c.currency) && Math.abs(c.amount) > 1e-9).map((c) => html`<div key=${c.id} className="note">${c.currency === 'USD' ? '달러' : '원화'} 잔액 ${money(c.amount, c.currency)}이 남아 있어요. 통화를 빼도 잔액은 계속 합산돼요.</div>`)}</div>
      </section>
      <div className="actions">
        <button className="btn" type="button" onClick=${save}>${onboarding ? (isBank ? '다음: 현금 넣기' : '다음: 종목 넣기') : '저장하기'}</button>
        ${edit && html`<button className="btn danger" type="button" onClick=${del}>계좌 삭제</button>`}
      </div>
    </div>`;
}

// 구글 자동 시세 연결(처음 시작하기에서도 사용)
export function ConnectForm({ ctx, onboarding, onDone }) {
  const q = ctx.settings.quote || {};
  const [url, setUrl] = useState(q.url || '');
  const [token, setToken] = useState(q.token || '');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const test = async () => {
    setBusy(true); setResult(null);
    const t0 = performance.now();
    try {
      const keys = ['FX:USDKRW', 'US:AAPL', 'KR:005930'];
      const j = await fetchQuotes({ url: url.trim(), token: token.trim() }, keys);
      const ms = Math.round(performance.now() - t0);
      setResult({ ok: true, ms, q: j.quotes });
    } catch (e) { setResult({ ok: false, msg: explain(e) }); }
    setBusy(false);
  };
  const save = async () => {
    await saveSettings({ quote: url.trim() && token.trim() ? { url: url.trim(), token: token.trim() } : null });
    toast(url.trim() ? '연결 정보를 저장했어요' : '연결을 해제했어요');
    try { if (url.trim()) await refreshQuotes(); } catch (e) { toast(explain(e), { type: 'error' }); }
    if (onDone) onDone(); else go('#/settings');
  };
  const f = (k) => result?.q?.[k]?.price;
  return html`
    ${!onboarding && html`<${TopBar} title="구글 자동 시세" back="#/settings" />`}
    <div className="body">
      <section className="sec" style=${{ gap: '12px' }}>
        <p className="hint">내 구글 계정의 시트로 현재가·환율을 자동으로 받고, 앱 데이터도 자동으로 백업해요. 구글에는 종목 코드와 백업 파일만 가고 다른 곳으로는 보내지 않아요.</p>
        <ol className="hint" style=${{ margin: 0, paddingLeft: '20px', display: 'grid', gap: '6px' }}>
          <li>구글 드라이브에서 새 스프레드시트를 만들고 <b>확장 프로그램 › Apps Script</b>를 열어요.</li>
          <li>받은 <b>Code.gs</b> 내용을 붙여 넣고 저장한 뒤 <b>setup</b>을 한 번 실행해요(권한 허용).</li>
          <li><b>배포 › 새 배포 › 웹 앱</b>(실행: 나, 액세스: 모든 사용자)으로 배포하고 URL을 복사해요.</li>
          <li>시트의 <b>설정</b> 탭에 생긴 토큰을 복사해 아래에 붙여 넣어요.</li>
        </ol>
        <${Field} id="cf-url" label="웹 앱 URL"><input id="cf-url" className="inp" inputMode="url" autoComplete="off" placeholder="https://script.google.com/macros/s/…/exec" value=${url} onChange=${(e) => setUrl(e.target.value)} /><//>
        <${Field} id="cf-token" label="토큰">
          <div style=${{ display: 'flex', gap: '8px' }}><input id="cf-token" className="inp" type=${show ? 'text' : 'password'} autoComplete="off" value=${token} onChange=${(e) => setToken(e.target.value)} />
          <button type="button" className="chip" onClick=${() => setShow(!show)}>${show ? '숨기기' : '보기'}</button></div>
        <//>
        <button className="btn sec2" type="button" disabled=${busy || !url || !token} onClick=${test}>${busy ? '확인 중…' : '연결 테스트'}</button>
        ${result && (result.ok
          ? html`<div className="pv"><b style=${{ color: 'var(--accent)' }}>연결됨 · 응답 ${(result.ms / 1000).toFixed(1)}초</b>
              <span className="sm">AAPL ${f('US:AAPL') ? '$' + f('US:AAPL') : '대기 중'} · 삼성전자 ${f('KR:005930') ? f('KR:005930').toLocaleString() + '원' : '대기 중'} · 환율 ${f('FX:USDKRW') || '대기 중'}</span>
              <span className="sm">'대기 중'은 구글이 처음 계산하는 중이라는 뜻이에요. 잠시 후 다시 받아요.</span></div>`
          : html`<div className="note">${result.msg}</div>`)}
      </section>
      <div className="actions">
        <button className="btn" type="button" onClick=${save}>${onboarding ? '저장하고 다음' : '저장하기'}</button>
        ${onboarding && html`<button className="link2" type="button" onClick=${onDone}>나중에 하기 (현재가 직접 입력)</button>`}
      </div>
    </div>`;
}
export const Connect = ({ ctx }) => html`<${ConnectForm} ctx=${ctx} />`;

export function Backup({ ctx }) {
  const s = ctx.settings;
  const fileRef = useRef();
  const [busy, setBusy] = useState('');
  const doExport = async () => {
    const data = await exportData();
    const d = new Date();
    const name = `portfolio-backup-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    const text = JSON.stringify(data);
    const file = new File([text], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] }) && await ask({ title: '공유하기로 바로 보낼까요?', desc: '드라이브 등에 바로 보낼 수 있어요. 아니면 파일로 저장해요.', ok: '공유하기', cancel: '파일로 저장' })) {
      try { await navigator.share({ files: [file], title: name }); } catch { /* 사용자가 닫음 */ }
    } else download(name, text);
    await saveSettings({ lastBackupAt: new Date().toISOString() });
    toast('백업 파일을 만들었어요');
  };
  const restore = async (obj) => {
    const err = validateBackup(obj);
    if (err) { toast(err, { type: 'error' }); return; }
    const n = obj.data;
    if (!(await ask({ title: `백업(${obj.exportedAt?.slice(0, 10)})으로 바꿀까요?`, desc: `계좌 ${n.accounts.length}개 · 종목 ${n.holdings.length}개 · 거래 ${n.trades.length}건\n지금 데이터는 지워져요.`, ok: '복원하기', danger: true }))) return;
    await importData(obj, { keepQuote: true });
    toast('복원했어요'); go('#/');
  };
  const onFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { await restore(JSON.parse(await f.text())); } catch { toast('백업 파일을 읽을 수 없어요.', { type: 'error' }); }
    e.target.value = '';
  };
  const gBackup = async () => { setBusy('b'); try { await pushBackup(); toast('구글에 백업했어요'); } catch (e) { toast(explain(e), { type: 'error' }); } setBusy(''); };
  const gRestore = async () => {
    setBusy('r');
    try { const p = await fetchGoogleBackup(s.quote); if (!p) toast('구글에 백업이 아직 없어요.'); else await restore(p); } catch (e) { toast(explain(e), { type: 'error' }); }
    setBusy('');
  };
  return html`
    <${TopBar} title="백업 · 복원" back="#/settings" />
    <div className="body">
      <section className="sec" style=${{ gap: '12px' }}>
        <h2>구글 자동 백업</h2>
        ${ctx.connected ? html`
          <label className="chk"><input type="checkbox" checked=${s.autoBackup} onChange=${(e) => saveSettings({ autoBackup: e.target.checked })} />입력·수정할 때마다 내 구글 계정에 자동 백업</label>
          <div className="sm">마지막 구글 백업: ${s.lastGoogleBackupAt ? when(s.lastGoogleBackupAt) : '없음'}</div>
          <div className="two"><button className="btn sec2" type="button" disabled=${!!busy} onClick=${gBackup}>${busy === 'b' ? '백업 중…' : '지금 백업'}</button>
            <button className="btn sec2" type="button" disabled=${!!busy} onClick=${gRestore}>${busy === 'r' ? '받는 중…' : '구글에서 복원'}</button></div>
          <div className="sm">새 폰에서는 앱 설치 → 구글 자동 시세 연결(같은 URL·토큰) → [구글에서 복원]을 누르면 돼요.</div>`
        : html`<p className="hint">구글 자동 시세를 연결하면 자동 백업도 함께 켜져요. <a href="#/connect" className="inline-link">연결하기 ›</a></p>`}
      </section>
      <section className="sec" style=${{ gap: '12px' }}>
        <h2>파일 백업</h2>
        <p className="hint">백업 파일 1개에 모든 데이터가 들어 있어요. 암호화되지 않은 파일이니 비공개 폴더에 보관하세요. (구글 연결 토큰은 들어가지 않아요)</p>
        <div className="sm">마지막 파일 백업: ${s.lastBackupAt ? when(s.lastBackupAt) : '없음'}</div>
        <div className="two"><button className="btn sec2" type="button" onClick=${doExport}>백업 파일 만들기</button>
          <button className="btn sec2" type="button" onClick=${() => fileRef.current.click()}>파일로 복원</button></div>
        <input ref=${fileRef} type="file" accept="application/json,.json" hidden onChange=${onFile} />
      </section>
    </div>`;
}
