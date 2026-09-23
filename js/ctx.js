// 화면에서 쓰는 파생 데이터(시세 결정, 요약, 올해 실현손익)
import { summarize, realizedSum } from './calc.js';
import { quoteKey } from './google.js';

export function makeCtx(st) {
  const fxRate = st.fx?.rate || null;
  const priceOf = (h) => {
    const k = quoteKey(h);
    const q = k && st.quotes[k];
    if (q && (!h.manualPriceAsOf || (q.fetchedAt || q.asOf) >= h.manualPriceAsOf)) return q.price;
    return h.manualPrice ?? null;
  };
  const priceAsOf = (h) => {
    const k = quoteKey(h);
    const q = k && st.quotes[k];
    if (q && (!h.manualPriceAsOf || (q.fetchedAt || q.asOf) >= h.manualPriceAsOf)) return { at: q.asOf || q.fetchedAt, auto: true };
    return h.manualPriceAsOf ? { at: h.manualPriceAsOf, auto: false } : null;
  };
  const accById = Object.fromEntries(st.accounts.map((a) => [a.id, a]));
  const sum = summarize({ accounts: st.accounts, holdings: st.holdings, cash: st.cash, priceOf, fx: fxRate });
  const year = new Date().getFullYear();
  return {
    ...st, fxRate, priceOf, priceAsOf, accById, sum, year,
    realizedYear: realizedSum(st.trades, { year }),
    connected: !!(st.settings.quote?.url && st.settings.quote?.token),
  };
}
