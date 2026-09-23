// 숫자·날짜 표기. 금액 가리기(hide)가 켜져 있으면 금액 문자열을 가린다.
let hidden = false;
export const setHidden = (v) => { hidden = !!v; };
const MASK = '•••••';

const fmtInt = (v) => Math.round(v).toLocaleString('ko-KR');
const fmtDec = (v, d) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export function won(v, { sign = false, amount = true } = {}) {
  if (v == null || !isFinite(v)) return '–';
  if (hidden && amount) return MASK;
  const s = sign ? (v > 0 ? '+' : v < 0 ? '−' : '') : v < 0 ? '−' : '';
  return `${s}${fmtInt(Math.abs(v))}원`;
}

export function usd(v, { sign = false, amount = true } = {}) {
  if (v == null || !isFinite(v)) return '–';
  if (hidden && amount) return MASK;
  const s = sign ? (v > 0 ? '+' : v < 0 ? '−' : '') : v < 0 ? '−' : '';
  const a = Math.abs(v);
  return `${s}$${fmtDec(a, a > 0 && a < 1 ? 4 : 2)}`;
}

export function money(v, cur, opts) {
  return cur === 'USD' ? usd(v, opts) : won(v, opts);
}

// ₩1,250만 형태(보조 표기)
export function man(v) {
  if (v == null || !isFinite(v)) return '–';
  if (hidden) return MASK;
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  if (a < 10000) return `${s}₩${fmtInt(a)}`;
  if (a < 1e8) return `${s}₩${fmtInt(a / 10000)}만`;
  const eok = Math.floor(a / 1e8), rest = Math.round((a - eok * 1e8) / 10000);
  return `${s}₩${eok}억${rest ? ' ' + rest.toLocaleString('ko-KR') + '만' : ''}`;
}

export function pct(v, d = 1, { sign = true } = {}) {
  if (v == null || !isFinite(v)) return '–';
  const s = sign ? (v > 0 ? '+' : v < 0 ? '−' : '') : '';
  return `${s}${fmtDec(Math.abs(v), d)}%`;
}

export const arrow = (v) => (v > 0 ? '▲' : v < 0 ? '▼' : '');
export const cls = (v) => (v > 0 ? 'up' : v < 0 ? 'dn' : 'm');

export function qty(v, market) {
  if (v == null) return '–';
  if (hidden) return MASK;
  const d = market === 'KR' ? 4 : 4;
  const s = Number(v.toFixed(d)).toLocaleString('en-US', { maximumFractionDigits: d });
  return `${s}주`;
}

export function fx(v) {
  if (v == null) return '–';
  return fmtDec(v, 2);
}

export function price(v, cur) {
  if (v == null || !isFinite(v)) return '–';
  return cur === 'USD' ? `$${fmtDec(v, v < 1 ? 4 : 2)}` : `${fmtInt(v)}원`;
}

export function when(iso) {
  if (!iso) return '–';
  const d = new Date(iso), now = new Date();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (d.toDateString() === now.toDateString()) return hm;
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export function daysAgo(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// 입력값 파싱: 쉼표·공백·통화기호 허용
export function parseNum(s) {
  if (s == null) return NaN;
  const t = String(s).replace(/[,\s$₩원%]/g, '');
  if (t === '') return NaN;
  return Number(t);
}
