// 공통 UI 컴포넌트
import { html, useState, useEffect } from './react.js';

const P = {
  home: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8|M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  list: 'M3 6h.01M3 12h.01M3 18h.01M8 6h13M8 12h13M8 18h13',
  wallet: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1|M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4',
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
};

export function Icon({ name, className = 'i' }) {
  const parts = (P[name] || '').split('|');
  return html`<svg className=${className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    ${parts.map((d, i) => (d.startsWith('c') ? (() => { const [cx, cy, r] = d.slice(1).split(','); return html`<circle key=${i} cx=${cx} cy=${cy} r=${r} />`; })() : html`<path key=${i} d=${d} />`))}
  </svg>`;
}

export function TopBar({ title, back, step, children }) {
  return html`<header className="top">
    <div className="left">${back && html`<a className="icon-btn" href=${back} aria-label="뒤로"><${Icon} name="left" /></a>`}<h1>${title}</h1></div>
    <div className="acts">${step && html`<span className="step-tag">${step}</span>`}${children}</div>
  </header>`;
}

export function TabBar({ active }) {
  const T = (id, href, ic, label) => html`<a href=${href} className=${active === id ? 'on' : ''} aria-current=${active === id ? 'page' : undefined}><${Icon} name=${ic} />${label}</a>`;
  return html`<div className="tabbar"><nav aria-label="주요 메뉴">${T('home', '#/', 'home', '홈')}${T('holdings', '#/holdings', 'list', '종목')}${T('cash', '#/cash', 'wallet', '현금')}${T('settings', '#/settings', 'set', '설정')}</nav></div>`;
}

// 세그먼트(라디오 역할)
export function Seg({ value, options, onChange, label }) {
  return html`<div className="seg" role="radiogroup" aria-label=${label}>
    ${options.map(([v, t]) => html`<button key=${v} type="button" role="radio" aria-checked=${value === v} className=${value === v ? 'on' : ''} onClick=${() => onChange(v)}>${t}</button>`)}
  </div>`;
}

export function Chips({ value, options, onChange, label }) {
  return html`<div className="chips" role="radiogroup" aria-label=${label}>
    ${options.map(([v, t]) => html`<button key=${v} type="button" role="radio" aria-checked=${value === v} className=${'chip' + (value === v ? ' on' : '')} onClick=${() => onChange(v)}>${t}</button>`)}
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

export function Banner({ children, action, href, info }) {
  return html`<div className=${'banner' + (info ? ' info' : '')} role="status"><span>${children}</span>${action && (href ? html`<a href=${href}>${action}</a>` : null)}</div>`;
}

// 토스트(전역)
let pushToast = () => {};
export function toast(msg, action) { pushToast({ msg, action, id: Date.now() }); }
export function ToastHost() {
  const [t, setT] = useState(null);
  useEffect(() => { pushToast = setT; }, []);
  useEffect(() => { if (!t) return; const id = setTimeout(() => setT(null), t.action ? 6000 : 3000); return () => clearTimeout(id); }, [t]);
  if (!t) return null;
  return html`<div className="toast" role="status"><span>${t.msg}</span>${t.action && html`<button type="button" onClick=${() => { setT(null); t.action.run(); }}>${t.action.label}</button>`}</div>`;
}

export function Empty({ children }) {
  return html`<div className="empty">${children}</div>`;
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
