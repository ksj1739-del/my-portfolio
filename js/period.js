// M4 자산 추이·기간 수익률(메리츠식 단순 수익률, 설계서 §3.4). 순수 함수만 둔다.
// 날짜는 모두 'YYYY-MM-DD' 문자열(로컬 날짜). new Date('YYYY-MM-DD')는 UTC라 쓰지 않는다.

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
// 두 날짜 사이 일수(b − a)
export const dayDiff = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);
// '9월 24일'
export const mdLabel = (s) => { const d = parseDay(s); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };

// 외부 순유입 누계(원): 그날까지(date ≤ 기준일) 기록된 입금·출금의 기록 시점 원화값 합
// + v2 이후 '종목 추가'로 들어온 주식(trades.externalKrw, initial)
export function netExternalCum(cashTx = [], date, trades = []) {
  let s = 0;
  for (const r of cashTx) if (r.external && r.date <= date) s += Number(r.krwValue) || 0;
  for (const t of trades) if (t.initial && t.externalKrw != null && (t.tradedAt || '') <= date) s += Number(t.externalKrw) || 0;
  return s;
}

// 달러 누계. 하나라도 달러값이 없으면(환율 없던 날 원화 입금 등) null
export function netExternalCumUsd(cashTx = [], date, trades = []) {
  let s = 0;
  for (const r of cashTx) {
    if (!r.external || r.date > date) continue;
    if (r.usdValue == null || !isFinite(r.usdValue)) return null;
    s += Number(r.usdValue);
  }
  for (const t of trades) {
    if (!t.initial || t.externalKrw == null || (t.tradedAt || '') > date) continue;
    if (t.externalUsd == null) return null;
    s += Number(t.externalUsd);
  }
  return s;
}

// 오늘 스냅샷(v2). 기존 필드 이름은 그대로 두고 v2 필드를 더한다(§3.4.2)
export function buildSnapshot({ date, sum, fxRate, cashTx = [], trades = [] }) {
  return {
    date,
    totalAssetKrw: sum.total,
    totalCostKrw: sum.costKrw,
    cashKrw: sum.cashKrw,
    usdKrw: fxRate || null,
    byCategory: Object.fromEntries(sum.cats.map((c) => [c.id, c.value])),
    v: 2,
    totalUsd: fxRate ? sum.total / fxRate : null,
    netExternalCum: netExternalCum(cashTx, date, trades),
    netExternalCumUsd: netExternalCumUsd(cashTx, date, trades),
    byAccount: Object.fromEntries(sum.byAccount.map((a) => [a.acc.id, a.totalKrw])),
    noPrice: sum.noPrice || 0,
    fxMissing: !!sum.fxMissing,
  };
}

// 저장된 스냅샷 + 지금 값(같은 날짜면 지금 값으로 덮어씀) → 날짜순
export function mergeLive(snaps = [], live) {
  const out = snaps.filter((s) => s && s.date && (!live || s.date !== live.date));
  if (live) out.push(live);
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export const hasV2 = (s) => s != null && s.netExternalCum != null && isFinite(s.netExternalCum);
export const firstV2 = (snaps) => snaps.find(hasV2) || null;

// 기간 목표 날짜. 1d는 '어제 이전' 뜻으로 어제 날짜
export function targetDate(period, today) {
  const d = parseDay(today);
  switch (period) {
    case '1d': d.setDate(d.getDate() - 1); break;
    case '1w': d.setDate(d.getDate() - 7); break;
    case '1m': d.setMonth(d.getMonth() - 1); break;
    case '3m': d.setMonth(d.getMonth() - 3); break;
    case '1y': d.setFullYear(d.getFullYear() - 1); break;
    default: return null;
  }
  return ymd(d);
}

// 기준 스냅샷: 목표 날짜 이전이거나 같은 날 중 가장 가까운 것(보간 없음). 전체 = v2 첫 스냅샷
// v1(netExternalCum 없음)이 걸리면 그대로 돌려주고 periodReturn이 '데이터 없음'으로 판단한다
export function pickBase(snaps, period, today) {
  if (period === 'all') return firstV2(snaps);
  const t = targetDate(period, today);
  let best = null;
  for (const s of snaps) if (s.date <= t && (!best || s.date > best.date)) best = s;
  return best;
}

const valOf = (s, cur) => (s == null ? null : cur === 'USD' ? (s.totalUsd ?? (s.usdKrw ? s.totalAssetKrw / s.usdKrw : null)) : s.totalAssetKrw);
const cumOf = (s, cur) => (s == null ? null : cur === 'USD' ? s.netExternalCumUsd : s.netExternalCum);
export const snapValue = valOf;

// 기간 손익·수익률. 손익 = V_E − V_S − ΔN, 수익률 = 손익 ÷ (V_S + max(ΔN, 0))
// 반환 {ok, pnl, ret, dN, vS, vE, reason}. reason: 'nodata'(기준 없음·v1) | 'nofx'(달러값 없음)
export function periodReturn(S, E, cur = 'KRW') {
  if (!S || !E || !(S.date < E.date) || !hasV2(S) || !hasV2(E)) return { ok: false, reason: 'nodata' };
  const vS = valOf(S, cur), vE = valOf(E, cur), nS = cumOf(S, cur), nE = cumOf(E, cur);
  if ([vS, vE, nS, nE].some((x) => x == null || !isFinite(x))) return { ok: false, reason: cur === 'USD' ? 'nofx' : 'nodata' };
  const dN = nE - nS;
  const pnl = vE - vS - dN;
  const denom = vS + Math.max(dN, 0);
  return { ok: true, pnl, ret: denom > 0 ? (pnl / denom) * 100 : null, dN, vS, vE, denom };
}

// 기간의 차트 점: 기준 스냅샷(v1이어도 값은 그린다. 없으면 목표 날짜)부터 오늘까지
export function seriesFor(snaps, period, today, base) {
  const from = base ? base.date : period === 'all' ? (snaps[0]?.date || today) : targetDate(period, today);
  return snaps.filter((s) => s.date >= from && s.date <= today);
}

// 한 기간의 전체 결과(화면용)
export function periodView(snaps, period, today, cur = 'KRW') {
  const E = snaps.find((s) => s.date === today) || snaps[snaps.length - 1] || null;
  const S = pickBase(snaps, period, today);
  const r = periodReturn(S, E, cur);
  const f = firstV2(snaps);
  return { S, E, r, since: f ? f.date : today, series: seriesFor(snaps, period, today, S) };
}
