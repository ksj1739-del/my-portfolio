// 공통 UI 컴포넌트
import { html, useState, useEffect, useRef } from './react.js';
import { split } from './format.js';

// 자체 선 아이콘. 'c'=원, 'r'=둥근 사각형(x,y,w,h), 'k'=채움 아이콘에서 뚫는 원
const P = {
  home: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8|M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  homeF: 'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2h-5v-7h-4v7H5a2 2 0 0 1-2-2z',
  list: 'r4,4,16,4|r4,10,11,4|r4,16,14,4',
  wallet: 'M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2|M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2|c16,14,1.2',
  walletF: 'M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2|M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2|k16,14,1.6',
  set: 'M20 7h-9M14 17H5|c17,17,3|c7,7,3',
  right: 'm9 18 6-6-6-6',
  left: 'm15 18-6-6 6-6',
  down: 'm6 9 6 6 6-6',
  eye: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0|c12,12,3',
  eyeoff: 'M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49|M14.084 14.158a3 3 0 0 1-4.242-4.242|M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143|m2 2 20 20',
  pen: 'M12 20h9|M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z',
  refresh: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8|M21 3v5h-5|M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16|M8 16H3v5',
  plus: 'M5 12h14M12 5v14',
  chart: 'M3 3v16a2 2 0 0 0 2 2h16|m19 9-5 5-4-4-3 3',
  check: 'M20 6 9 17l-5-5',
  alert: 'M12 8v5|M12 16.5h.01',
  cash: 'r3,6,18,12|c12,12,2.5',
  box: 'M21 8 12 3 3 8v8l9 5 9-5z|M3 8l9 5 9-5|M12 13v8',
  clock: 'c12,12,9|M12 7v5l3 2',
  // 거래내역 유형 아이콘
  inArr: 'M12 4v14|m6 12 6 6 6-6',
  outArr: 'M12 20V6|m6 12 6-6 6 6',
  swap: 'M4 8h14|m14 4 4 4-4 4|M20 16H6|m10 12-4 4 4 4',
  xfer: 'M3 12h18|m7 8-4 4 4 4|m17 8 4 4-4 4',
  pct: 'M19 5 5 19|c7,7,2.5|c17,17,2.5',
  eq: 'M5 9h14|M5 15h14',
  buy: 'M12 5 20 18H4z',
  sell: 'M12 19 4 6h16z',
  coin: 'c12,12,8|c12,12,3.5',
};

export function Icon({ name, className = 'i', filled }) {
  const parts = (P[filled && P[name + 'F'] ? name + 'F' : name] || '').split('|');
  const fill = filled ? 'currentColor' : 'none';
  return html`<svg className=${className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    ${parts.map((d, i) => {
      const n = d.slice(1).split(',');
      if (d[0] === 'c') return html`<circle key=${i} cx=${n[0]} cy=${n[1]} r=${n[2]} fill=${fill} />`;
      if (d[0] === 'k') return html`<circle key=${i} cx=${n[0]} cy=${n[1]} r=${n[2]} fill="var(--card)" stroke="none" />`;
      if (d[0] === 'r') return html`<rect key=${i} x=${n[0]} y=${n[1]} width=${n[2]} height=${n[3]} rx="1.5" fill=${fill} />`;
      return html`<path key=${i} d=${d} fill=${fill} />`;
    })}
  </svg>`;
}

// 상단 바. large=true면 탭 루트 화면: 본문에 큰 제목, 스크롤하면 바에 작은 제목
export function TopBar({ title, back, step, large, children }) {
  const big = useRef();
  const [stuck, setStuck] = useState(!large);
  useEffect(() => {
    if (!large || !big.current || !window.IntersectionObserver) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { rootMargin: '-56px 0px 0px 0px' });
    io.observe(big.current);
    return () => io.disconnect();
  }, [large]);
  return html`<header className=${'top' + (stuck ? ' stuck' : '')}>
      <div className="left">${back && html`<a className="icon-btn" href=${back} aria-label="뒤로"><${Icon} name="left" /></a>`}<h1 className="ttl" aria-hidden=${large ? 'true' : undefined}>${title}</h1></div>
      <div className="acts">${step && html`<span className="step-tag">${step}</span>`}${children}</div>
    </header>
    ${large && html`<h1 className="big-title" ref=${big}>${title}</h1>`}`;
}

export function TabBar({ active }) {
  const T = (id, href, ic, label) => html`<a href=${href} className=${active === id ? 'on' : ''} aria-current=${active === id ? 'page' : undefined}><${Icon} name=${ic} filled=${active === id} />${label}</a>`;
  return html`<div className="tabbar"><nav aria-label="주요 메뉴">${T('home', '#/', 'home', '홈')}${T('holdings', '#/holdings', 'list', '종목')}${T('account', '#/account', 'wallet', '내 계좌')}${T('settings', '#/settings', 'set', '설정')}</nav></div>`;
}

// 세그먼트(라디오 역할). 같은 폭 칸 + 슬라이딩 인디케이터
export function Seg({ value, options, onChange, label, size = 's', block }) {
  const i = Math.max(0, options.findIndex(([v]) => v === value));
  return html`<div className=${`seg ${size}${block ? ' block' : ''}`} role="radiogroup" aria-label=${label} style=${{ gridTemplateColumns: `repeat(${options.length},1fr)` }}>
    <i className="ind" aria-hidden="true" style=${{ width: `calc((100% - 6px) / ${options.length})`, transform: `translateX(${i * 100}%)` }} />
    ${options.map(([v, t]) => html`<button key=${v} type="button" role="radio" aria-checked=${value === v} className=${value === v ? 'on' : ''} onClick=${() => { if (value !== v) { haptic(); onChange(v); } }}>${t}</button>`)}
  </div>`;
}

// 밑줄 탭(페이지 전환용 링크)
export function UTabs({ value, options, label }) {
  return html`<nav className="tabs-u" aria-label=${label}>
    ${options.map(([v, t, href]) => html`<a key=${v} href=${href} className=${value === v ? 'on' : ''} aria-current=${value === v ? 'page' : undefined}>${t}</a>`)}
  </nav>`;
}

export function Chips({ value, options, onChange, label }) {
  return html`<div className="chips" role="radiogroup" aria-label=${label}>
    ${options.map(([v, t]) => html`<button key=${v} type="button" role="radio" aria-checked=${value === v} className=${'chip' + (value === v ? ' on' : '')} onClick=${() => onChange(v)}>${t}</button>`)}
  </div>`;
}

export const PERIODS = [['1d', '오늘'], ['1w', '1주'], ['1m', '1달'], ['3m', '3달'], ['1y', '1년'], ['all', '전체']];
export function PeriodChips({ value, onChange, disabled = [] }) {
  return html`<div className="period" role="radiogroup" aria-label="기간">
    ${PERIODS.map(([v, t]) => html`<button key=${v} type="button" role="radio" aria-checked=${value === v} className=${(value === v ? 'on' : '') + (disabled.includes(v) ? ' off' : '')} onClick=${() => onChange(v)}>${t}</button>`)}
  </div>`;
}

export function Field({ id, label, error, hint, children }) {
  return html`<div className="fld">
    <label htmlFor=${id}>${label}</label>
    ${children}
    ${hint && html`<div className="sm">${hint}</div>`}
    ${error && html`<div className="err" id=${id + '-err'}>${error}</div>`}
  </div>`;
}

// 숫자 입력(쉼표 허용). value는 문자열로 관리
export function NumInput({ id, value, onChange, placeholder, error, prefix }) {
  return html`<input id=${id} className="inp" inputMode="decimal" autoComplete="off" value=${value} placeholder=${placeholder || (prefix || '')}
    aria-invalid=${error ? 'true' : 'false'} aria-describedby=${error ? id + '-err' : undefined}
    onChange=${(e) => onChange(e.target.value)} />`;
}

export function Banner({ children, action, href, info, onClick }) {
  return html`<div className=${'banner' + (info ? ' info' : '')} role="status"><span>${children}</span>${action && (href ? html`<a href=${href}>${action}</a>` : onClick ? html`<button type="button" onClick=${onClick}>${action}</button>` : null)}</div>`;
}

// 여러 배너는 첫 개만 보이고 접는다
export function Banners({ items }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return html`<div className="banners">${open ? items : items[0]}
    ${items.length > 1 && html`<button type="button" className="more-b" onClick=${() => setOpen(!open)}>${open ? '접기' : `알림 ${items.length - 1}개 더 보기`}</button>`}</div>`;
}

// 금액(숫자 + 작은 단위). 가리기는 format.js를 그대로 따른다
function useRoll(value, on) {
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current; prev.current = value;
    if (!on || from == null || value == null || from === value || !isFinite(from) || matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(value); return; }
    let raf, t0;
    const step = (t) => { t0 ??= t; const k = Math.min(1, (t - t0) / 400); setShown(from + (value - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, on]);
  return on ? shown : value;
}
export function Amount({ value, cur = 'KRW', sign, size, roll, className = '' }) {
  const v = useRoll(value, roll);
  const s = split(v, cur, { sign });
  const cl = `amount${size ? ' amt-' + size : ''}${className ? ' ' + className : ''}`;
  if (!s.unit) return html`<span className=${cl}>${s.sign}${s.amt}</span>`;
  return s.pre ? html`<span className=${cl}>${s.sign}<span className="unit">${s.unit}</span>${s.amt}</span>`
    : html`<span className=${cl}>${s.sign}${s.amt}<span className="unit">${s.unit}</span></span>`;
}

// 이니셜 아바타. seed로 색을 고른다(--c1…c5)
const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export const holdKey = (h) => (h.market === 'US' ? 'US:' + (h.ticker || '').toUpperCase() : 'KR:' + (h.name || '').replace(/\s/g, ''));
export function initials(h) {
  if (h.market === 'US') return (h.ticker || h.name || '?').slice(0, 2).toUpperCase();
  return (h.name || h.ticker || '?').replace(/\s/g, '').slice(0, 2);
}
export function Avatar({ text, seed, icon }) {
  const c = `var(--c${(hash(seed ?? text) % 5) + 1})`;
  return html`<span className="avatar" aria-hidden="true" style=${{ '--av': c }}>${icon ? html`<${Icon} name=${icon} />` : text}</span>`;
}

// 리스트 행: [아바타] 제목/보조 ··· 오른쪽 금액/손익
export function ListRow({ href, onClick, avatar, title, badge, sub, right, rightSub, rightCls, chev, label }) {
  const inner = html`${avatar}
    <div className="l"><div className="nm">${title}${badge && html` <span className=${'badge ' + (badge.cls || '')}>${badge.text}</span>`}</div>${sub != null && sub !== '' && html`<div className="sub2">${sub}</div>`}</div>
    ${(right != null || rightSub != null) && html`<div className="r">${right != null && html`<div className="rv">${right}</div>`}${rightSub != null && html`<div className=${'rs ' + (rightCls || '')}>${rightSub}</div>`}</div>`}
    ${chev && html`<${Icon} name="right" className="chev" />`}`;
  if (href) return html`<a className="li" href=${href} aria-label=${label}>${inner}</a>`;
  if (onClick) return html`<button type="button" className="li" onClick=${onClick} aria-label=${label}>${inner}</button>`;
  return html`<div className="li static">${inner}</div>`;
}

// 토스트(전역). toast(msg, {type, action}) — 옛 호출 toast(msg, {label, run})도 된다
let pushToast = () => {};
export function toast(msg, opt) {
  const o = opt?.label ? { action: opt } : opt || {};
  if (o.type === 'error') haptic([20, 40, 20]);
  pushToast({ msg, ...o, id: Date.now() });
}
export function ToastHost() {
  const [t, setT] = useState(null);
  useEffect(() => { pushToast = setT; }, []);
  useEffect(() => { if (!t) return; const id = setTimeout(() => setT(null), t.action ? 5000 : 3000); return () => clearTimeout(id); }, [t]);
  if (!t) return null;
  const err = t.type === 'error';
  return html`<div key=${t.id} className=${'toast' + (document.body.classList.contains('has-tab') ? '' : ' low')} role=${err ? 'alert' : 'status'} aria-live=${err ? 'assertive' : 'polite'}>
    <span className=${'t-ic' + (err ? ' err' : '')}><${Icon} name=${err ? 'alert' : 'check'} /></span><span className="t-msg">${t.msg}</span>
    ${t.action && html`<button type="button" onClick=${() => { setT(null); haptic(); t.action.run(); }}>${t.action.label}</button>`}</div>`;
}

// 빈 상태: Empty({icon, title, desc, action:{label, href|onClick}}) 또는 children
export function Empty({ icon = 'box', title, desc, action, children }) {
  return html`<div className="empty">
    <span className="e-ic"><${Icon} name=${icon} /></span>
    ${title && html`<div className="e-t">${title}</div>`}
    ${desc && html`<div className="e-d">${desc}</div>`}
    ${children}
    ${action && (action.href ? html`<a className="btn soft" href=${action.href}>${action.label}</a>` : html`<button type="button" className="btn soft" onClick=${action.onClick}>${action.label}</button>`)}
  </div>`;
}

export function Skeleton() {
  return html`<div className="skel-page" aria-busy="true" aria-label="불러오는 중">
    <div className="sec"><i className="skel" style=${{ width: '30%', height: '14px' }} /><i className="skel" style=${{ width: '60%', height: '32px' }} /><i className="skel" style=${{ width: '40%', height: '16px' }} /></div>
    <div className="sec">${[0, 1, 2, 3].map((i) => html`<div key=${i} className="skel-row"><i className="skel" style=${{ width: '40px', height: '40px', borderRadius: '50%' }} /><i className="skel" style=${{ flex: 1, height: '16px' }} /><i className="skel" style=${{ width: '25%', height: '16px' }} /></div>`)}</div>
  </div>`;
}

// ---------- 바텀시트 (?sheet= 쿼리로 열고, 뒤로가기로 닫는다) ----------
let sheetPushed = false;
// 시트가 쓰는 쿼리 키(화면 쿼리와 섞지 않는다): 시트 이름, 대상 id, 계좌, 통화, 매수/매도
export const SHEET_KEYS = ['sheet', 'sid', 'sa', 'sc', 'side'];
const hashParts = () => { const [p, q] = location.hash.slice(1).split('?'); return [p || '/', new URLSearchParams(q || '')]; };
export function openSheet(name, extra = {}) {
  const [p, q] = hashParts();
  q.set('sheet', name);
  for (const [k, v] of Object.entries(extra)) if (v != null) q.set(k, v);
  sheetPushed = true;
  location.hash = p + '?' + q.toString();
}
export function closeSheet() {
  if (sheetPushed) { sheetPushed = false; history.back(); return; }
  const [p, q] = hashParts();
  SHEET_KEYS.forEach((k) => q.delete(k));
  const s = q.toString();
  location.replace('#' + p + (s ? '?' + s : ''));
}
// 시트에서 다른 시트로 바꿀 때(기록 메뉴 → 입금 등): 기록을 늘리지 않고 바꿔치기
export function swapSheet(name, extra = {}) {
  const [p, q] = hashParts();
  SHEET_KEYS.forEach((k) => q.delete(k));
  q.set('sheet', name);
  for (const [k, v] of Object.entries(extra)) if (v != null) q.set(k, v);
  location.replace('#' + p + '?' + q.toString());
}
// 시트 안에서 다른 화면으로 갈 때: 시트 기록을 바꿔치기해서 뒤로가기가 시트를 다시 열지 않게
export const goFromSheet = (hash) => { sheetPushed = false; location.replace(hash); };
addEventListener('popstate', () => { if (!location.hash.includes('sheet=')) sheetPushed = false; });

export function BottomSheet({ title, desc, onClose = closeSheet, children, footer }) {
  const box = useRef();
  const drag = useRef(null);
  const [dy, setDy] = useState(0);
  useEffect(() => {
    const opener = document.activeElement;
    (box.current?.querySelector('input,select,textarea') || box.current?.querySelector('.sh-title') || box.current)?.focus({ preventScroll: true });
    const esc = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', esc);
    document.body.classList.add('sheet-open');
    return () => { removeEventListener('keydown', esc); document.body.classList.remove('sheet-open'); opener?.focus?.({ preventScroll: true }); };
  }, []);
  const down = (e) => { drag.current = { y: e.clientY, t: performance.now() }; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const move = (e) => { if (drag.current) setDy(Math.max(0, e.clientY - drag.current.y)); };
  const up = (e) => {
    if (!drag.current) return;
    const d = e.clientY - drag.current.y, v = d / (performance.now() - drag.current.t);
    drag.current = null;
    if (d > (box.current?.offsetHeight || 400) * 0.3 || v > 0.5) onClose(); else setDy(0);
  };
  return html`<div className="sheet-wrap">
    <div className="dim" onClick=${onClose} />
    <div className="sheet" ref=${box} role="dialog" aria-modal="true" aria-label=${title} tabIndex="-1" style=${dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : null}>
      <div className="sh-grab" onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up}><i className="handle" /></div>
      ${title && html`<h2 className="sh-title" tabIndex="-1">${title}</h2>`}
      ${desc && html`<p className="sh-desc">${desc}</p>`}
      <div className="sh-body">${children}</div>
      ${footer && html`<div className="sh-foot">${footer}</div>`}
    </div>
  </div>`;
}

// ---------- 확인 다이얼로그 (window.confirm 대체) ----------
// ask({title, desc, ok, cancel, danger, typeToConfirm}) → Promise<boolean>
let pushAsk = null;
export function ask(opts) {
  if (!pushAsk) return Promise.resolve(window.confirm([opts.title, opts.desc].filter(Boolean).join('\n')));
  return new Promise((resolve) => pushAsk({ ...opts, resolve }));
}
export function DialogHost() {
  const [d, setD] = useState(null);
  const [typed, setTyped] = useState('');
  const okRef = useRef();
  useEffect(() => { pushAsk = (o) => { setTyped(''); setD(o); }; return () => { pushAsk = null; }; }, []);
  useEffect(() => {
    if (!d) return;
    const opener = document.activeElement;
    setTimeout(() => (document.getElementById('dlg-in') || okRef.current)?.focus(), 0);
    const esc = (e) => e.key === 'Escape' && done(false);
    addEventListener('keydown', esc);
    return () => { removeEventListener('keydown', esc); opener?.focus?.({ preventScroll: true }); };
  }, [d]);
  if (!d) return null;
  const done = (v) => { setD(null); if (v) haptic(); d.resolve(v); };
  const need = d.typeToConfirm;
  return html`<div className="dlg-wrap">
    <div className="dim" onClick=${() => done(false)} />
    <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby=${d.desc ? 'dlg-d' : undefined}>
      <h2 id="dlg-t">${d.title}</h2>
      ${d.desc && html`<p id="dlg-d">${d.desc}</p>`}
      ${need && html`<input id="dlg-in" className="inp" autoComplete="off" placeholder=${need} value=${typed} onChange=${(e) => setTyped(e.target.value)} aria-label=${`'${need}'를 입력해요`} />`}
      <div className="dlg-btns">
        <button type="button" className="btn sec2" onClick=${() => done(false)}>${d.cancel || '취소'}</button>
        <button type="button" ref=${okRef} className=${'btn' + (d.danger ? ' fill-danger' : '')} disabled=${need && typed.trim() !== need} onClick=${() => done(true)}>${d.ok || '확인'}</button>
      </div>
    </div>
  </div>`;
}

// 햅틱(설정에서 끌 수 있음, 없으면 조용히 무시)
let hapticsOn = true;
export const setHaptics = (v) => { hapticsOn = v !== false; };
export function haptic(p = 10) {
  if (!hapticsOn) return;
  try { navigator.vibrate?.(p); } catch { /* 무시 */ }
}

export const go = (hash) => { location.hash = hash; };
export const hname = (h) => (h.market === 'US' ? (h.ticker || h.name || '?') : (h.name || h.ticker || '?'));
export const BROKERS = ['키움', '메리츠', '토스', '한국투자', '삼성', '미래에셋', 'NH', 'KB', '은행', '직접 입력'];

export function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
