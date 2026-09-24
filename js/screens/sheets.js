// 바텀시트 모음(?sheet=이름). 대상은 sid(행 id)·sa(계좌)·sc(통화)·side(매수/매도) 쿼리로 넘긴다
import { html, useEffect, useState } from '../react.js';
import { BottomSheet, Icon, Avatar, Chips, Seg, Field, NumInput, Amount, ListRow, Empty, ask, toast, haptic, hname, initials, holdKey, closeSheet, goFromSheet, swapSheet } from '../components.js';
import { money, won, qty, price as fmtPrice, fx as fxf, today, parseNum } from '../format.js';
import { addCashTx, updateCashTx, deleteCashTx, setCashTo, undoTrade, updateTradeMemo, saveDividend, deleteDividend, byLatest, saveSettings } from '../store.js';
import { SORTS, accountChoices } from '../group.js';
import { usePriceForm } from './money.js';
import { dividendCalc, dividendChoices, qtyAtDate, payDateFx, roundCur } from '../income.js';

export const TX_LABEL = { deposit: '입금', withdraw: '출금', fx: '환전', interest: '이자', transfer: '계좌 간 이체', adjust: '잔액 맞추기' };
export const TX_ICON = { deposit: 'inArr', withdraw: 'outArr', fx: 'swap', interest: 'pct', transfer: 'xfer', adjust: 'eq', BUY: 'buy', SELL: 'sell', div: 'coin' };
const curLabel = (c) => (c === 'USD' ? '달러' : '원화');
const unit = (c) => (c === 'USD' ? '$' : '원');
const fail = (e) => { haptic([20, 40, 20]); toast(e.message || String(e), { type: 'error' }); };

// ---------- 공통 입력 조각 ----------
function pickAcc(ctx, query, filter = () => true) {
  const ok = ctx.accounts.filter(filter);
  const want = [query.sa, ctx.settings.lastAccountId].find((id) => id && ok.some((a) => a.id === id));
  return want || ok[0]?.id || '';
}
function AccChips({ ctx, value, onChange, label = '계좌', filter = () => true }) {
  return html`<div className="fld"><span className="lab">${label}</span>
    <${Chips} label=${label} value=${value} onChange=${onChange} options=${ctx.accounts.filter(filter).map((a) => [a.id, a.name])} /></div>`;
}
function CurSeg({ acc, value, onChange }) {
  const curs = acc?.currencies?.length ? acc.currencies : ['KRW'];
  const opts = ['KRW', 'USD'].filter((c) => curs.includes(c) || c === value).map((c) => [c, curLabel(c)]);
  if (opts.length < 2) return html`<div className="row"><span className="m">통화</span><span className="v">${curLabel(value)}</span></div>`;
  return html`<div className="fld"><span className="lab">통화</span><${Seg} label="통화" block value=${value} onChange=${onChange} options=${opts} /></div>`;
}
const DateField = ({ id, value, onChange, hint }) => html`<${Field} id=${id} label="날짜" hint=${hint}><input id=${id} type="date" className="inp" value=${value} max=${today()} onChange=${(e) => onChange(e.target.value)} /><//>`;
const MemoField = ({ id, value, onChange }) => html`<${Field} id=${id} label="메모 (선택)"><input id=${id} className="inp" maxLength="200" value=${value} placeholder="예: 월급" onChange=${(e) => onChange(e.target.value)} /><//>`;

function Foot({ label, onSave, onDelete, busy }) {
  return html`<div style=${{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
    <button className="btn" type="button" disabled=${busy} onClick=${onSave}>${label}</button>
    ${onDelete && html`<button className="btn danger" type="button" onClick=${onDelete}>이 기록 지우기</button>`}
  </div>`;
}

// 수정 모드면 원장 행(쌍이면 두 행)을 찾는다
const findRow = (ctx, sid) => (sid ? ctx.cashTx.find((r) => r.id === sid) : null);
const pairRows = (ctx, row) => (row?.pairId ? ctx.cashTx.filter((r) => r.pairId === row.pairId) : row ? [row] : []);

async function removeRow(row) {
  if (!(await ask({ title: `${TX_LABEL[row.type]} 기록을 지울까요?`, desc: row.pairId ? '짝을 이루는 기록도 함께 지워져요. 잔액이 그만큼 바뀌어요.' : '잔액이 그만큼 바뀌어요.', ok: '지우기', danger: true }))) return;
  try { await deleteCashTx(row.id); toast('지웠어요'); closeSheet(); } catch (e) { fail(e); }
}

// ---------- 입금·출금·이자 ----------
function CashSheet({ ctx, query, type }) {
  const edit = findRow(ctx, query.sid);
  const [accId, setAcc] = useState(edit?.accountId || pickAcc(ctx, query));
  const acc = ctx.accById[accId];
  const [cur, setCur] = useState(edit?.currency || query.sc || acc?.baseCurrency || 'KRW');
  const [amt, setAmt] = useState(edit ? String(Math.abs(edit.amount)) : '');
  const [date, setDate] = useState(edit?.date || today());
  const [memo, setMemo] = useState(edit?.memo || '');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const pickA = (id) => { setAcc(id); const a = ctx.accById[id]; if (a && !(a.currencies || ['KRW']).includes(cur)) setCur(a.currencies?.[0] || 'KRW'); };
  const save = async () => {
    const v = parseNum(amt);
    if (!(v > 0)) { setErr('0보다 큰 금액을 입력해 주세요'); haptic([20, 40, 20]); return; }
    setBusy(true);
    try {
      const input = { type, accountId: accId, currency: cur, amount: v, date, memo: memo.trim() };
      if (edit) await updateCashTx(edit.id, input); else await addCashTx(input);
      haptic(); toast(edit ? '고쳤어요' : `${TX_LABEL[type]}${type === 'interest' ? '를' : '을'} 기록했어요`); closeSheet();
    } catch (e) { fail(e); setBusy(false); }
  };
  const verb = TX_LABEL[type];
  return html`<${BottomSheet} title=${edit ? `${verb} 고치기` : verb} footer=${html`<${Foot} label=${edit ? '저장하기' : `${verb} 기록하기`} busy=${busy} onSave=${save} onDelete=${edit ? () => removeRow(edit) : null} />`}>
    <${AccChips} ctx=${ctx} value=${accId} onChange=${pickA} />
    <${CurSeg} acc=${acc} value=${cur} onChange=${setCur} />
    <${Field} id="cs-amt" label=${`금액 (${unit(cur)})`} error=${err}><${NumInput} id="cs-amt" value=${amt} onChange=${(v) => { setAmt(v); setErr(null); }} error=${err} placeholder=${cur === 'USD' ? '예: 1,000.00' : '예: 2,000,000'} /><//>
    <${DateField} id="cs-date" value=${date} onChange=${setDate} hint=${type === 'interest' ? '한 달 치를 합쳐서 적어도 돼요.' : '지난 날짜로 적어도 잔액에는 바로 반영돼요.'} />
    <${MemoField} id="cs-memo" value=${memo} onChange=${setMemo} />
    ${(type === 'deposit' || type === 'withdraw') && cur === 'USD' && html`<div className="sm">${ctx.fxRate ? `원화 환산은 지금 환율 ${fxf(ctx.fxRate)}원으로 고정해 둬요.` : '환율이 없어 원화 환산 없이 저장해요.'}</div>`}
  <//>`;
}

// ---------- 환전 (보낸 금액·받은 금액·적용 환율 중 둘을 넣으면 나머지를 계산) ----------
function FxSheet({ ctx, query }) {
  const edit = findRow(ctx, query.sid);
  const legs = pairRows(ctx, edit);
  const out = legs.find((r) => r.amount < 0), inn = legs.find((r) => r.amount > 0);
  const both = (a) => (a.currencies || []).includes('KRW') && (a.currencies || []).includes('USD');
  const filter = ctx.accounts.some(both) ? both : () => true;
  const [accId, setAcc] = useState(edit?.accountId || pickAcc(ctx, query, filter));
  const [from, setFrom] = useState(out?.currency || 'KRW');
  const [vals, setVals] = useState({ sent: out ? String(-out.amount) : '', recv: inn ? String(inn.amount) : '', rate: edit?.fxRate ? String(edit.fxRate) : '' });
  const [last, setLast] = useState(['sent', 'recv']); // 최근에 직접 넣은 두 칸. 나머지 한 칸이 자동 계산
  const [date, setDate] = useState(edit?.date || today());
  const [memo, setMemo] = useState(edit?.memo || '');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const derived = ['sent', 'recv', 'rate'].find((k) => !last.includes(k));
  const krwFirst = from === 'KRW';
  const n = { sent: parseNum(vals.sent), recv: parseNum(vals.recv), rate: parseNum(vals.rate) };
  let calc = null;
  if (derived === 'rate' && n.sent > 0 && n.recv > 0) calc = Math.round((krwFirst ? n.sent / n.recv : n.recv / n.sent) * 10000) / 10000;
  if (derived === 'recv' && n.sent > 0 && n.rate > 0) calc = krwFirst ? Math.round((n.sent / n.rate) * 100) / 100 : Math.round(n.sent * n.rate);
  if (derived === 'sent' && n.recv > 0 && n.rate > 0) calc = krwFirst ? Math.round(n.recv * n.rate) : Math.round((n.recv / n.rate) * 100) / 100;
  const shown = (k) => (k === derived ? (calc != null ? String(calc) : '') : vals[k]);
  const edit1 = (k) => (v) => { setVals({ ...vals, [derived]: shown(derived), [k]: v }); setLast([k, ...last.filter((x) => x !== k)].slice(0, 2)); setErr(null); };
  const save = async () => {
    const sent = parseNum(shown('sent')), recv = parseNum(shown('recv')), rate = parseNum(shown('rate'));
    if (!(sent > 0) || !(recv > 0)) { setErr('0보다 큰 금액을 입력해 주세요'); return; }
    if (!(rate > 0)) { setErr('적용 환율을 넣어 주세요'); return; }
    setBusy(true);
    try {
      const input = { type: 'fx', accountId: accId, from, sent, received: recv, fxRate: rate, date, memo: memo.trim() };
      if (edit) await updateCashTx(edit.id, input); else await addCashTx(input);
      haptic(); toast(edit ? '고쳤어요' : '환전을 기록했어요'); closeSheet();
    } catch (e) { fail(e); setBusy(false); }
  };
  const to = krwFirst ? 'USD' : 'KRW';
  const ph = (k) => (k === derived ? '자동 계산' : '');
  return html`<${BottomSheet} title=${edit ? '환전 고치기' : '환전'} footer=${html`<${Foot} label=${edit ? '저장하기' : '환전 기록하기'} busy=${busy} onSave=${save} onDelete=${edit ? () => removeRow(edit) : null} />`}>
    <${AccChips} ctx=${ctx} value=${accId} onChange=${setAcc} filter=${filter} />
    <div className="fld"><span className="lab">방향</span><${Seg} label="환전 방향" block value=${from} onChange=${setFrom} options=${[['KRW', '원 → 달러'], ['USD', '달러 → 원']]} /></div>
    <${Field} id="fx-sent" label=${`보낸 금액 (${unit(from)})`}><${NumInput} id="fx-sent" value=${shown('sent')} onChange=${edit1('sent')} placeholder=${ph('sent')} /><//>
    <${Field} id="fx-recv" label=${`받은 금액 (${unit(to)})`}><${NumInput} id="fx-recv" value=${shown('recv')} onChange=${edit1('recv')} placeholder=${ph('recv')} /><//>
    <${Field} id="fx-rate" label="적용 환율 (원/$)" error=${err} hint="셋 중 둘을 넣으면 나머지는 자동으로 계산해요. 이 환율은 다음 매수 환율 기본값이 돼요."><${NumInput} id="fx-rate" value=${shown('rate')} onChange=${edit1('rate')} placeholder=${ph('rate')} error=${err} /><//>
    <${DateField} id="fx-date" value=${date} onChange=${setDate} />
    <${MemoField} id="fx-memo" value=${memo} onChange=${setMemo} />
  <//>`;
}

// ---------- 계좌 간 이체 ----------
function TransferSheet({ ctx, query }) {
  const edit = findRow(ctx, query.sid);
  const legs = pairRows(ctx, edit);
  const out = legs.find((r) => r.amount < 0), inn = legs.find((r) => r.amount > 0);
  const [fromId, setFrom] = useState(out?.accountId || pickAcc(ctx, query));
  const [toId, setTo] = useState(inn?.accountId || ctx.accounts.find((a) => a.id !== fromId)?.id || '');
  const [cur, setCur] = useState(edit?.currency || ctx.accById[fromId]?.baseCurrency || 'KRW');
  const [amt, setAmt] = useState(edit ? String(Math.abs(edit.amount)) : '');
  const [date, setDate] = useState(edit?.date || today());
  const [memo, setMemo] = useState(edit?.memo || '');
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const e = {}, v = parseNum(amt);
    if (!toId || toId === fromId) e.to = '보내는 계좌와 받는 계좌를 다르게 골라 주세요';
    else if (!(ctx.accById[toId]?.currencies || ['KRW']).includes(cur)) e.to = '통화가 다르면 환전으로 기록해 주세요';
    if (!(v > 0)) e.amt = '0보다 큰 금액을 입력해 주세요';
    setErr(e);
    if (Object.keys(e).length) { haptic([20, 40, 20]); return; }
    setBusy(true);
    try {
      const input = { type: 'transfer', fromId, toId, currency: cur, amount: v, date, memo: memo.trim() };
      if (edit) await updateCashTx(edit.id, input); else await addCashTx(input);
      haptic(); toast(edit ? '고쳤어요' : '이체를 기록했어요'); closeSheet();
    } catch (x) { fail(x); setBusy(false); }
  };
  return html`<${BottomSheet} title=${edit ? '이체 고치기' : '계좌 간 이체'} footer=${html`<${Foot} label=${edit ? '저장하기' : '이체 기록하기'} busy=${busy} onSave=${save} onDelete=${edit ? () => removeRow(edit) : null} />`}>
    <${AccChips} ctx=${ctx} label="보내는 계좌" value=${fromId} onChange=${setFrom} />
    <${AccChips} ctx=${ctx} label="받는 계좌" value=${toId} onChange=${(v) => { setTo(v); setErr({}); }} filter=${(a) => a.id !== fromId} />
    ${err.to && html`<div className="err">${err.to}</div>`}
    <${CurSeg} acc=${ctx.accById[fromId]} value=${cur} onChange=${setCur} />
    <${Field} id="tr-amt" label=${`금액 (${unit(cur)})`} error=${err.amt}><${NumInput} id="tr-amt" value=${amt} onChange=${setAmt} error=${err.amt} /><//>
    <${DateField} id="tr-date" value=${date} onChange=${setDate} />
    <${MemoField} id="tr-memo" value=${memo} onChange=${setMemo} />
  <//>`;
}

// ---------- 잔액 맞추기 (새로: 증권사 잔액을 넣으면 차이만큼 / 수정: 보정 금액 직접) ----------
function AdjustSheet({ ctx, query }) {
  const edit = findRow(ctx, query.sid);
  const mig = edit?.system === 'migration';
  const [accId, setAcc] = useState(edit?.accountId || pickAcc(ctx, query));
  const acc = ctx.accById[accId];
  const [cur, setCur] = useState(edit?.currency || query.sc || acc?.baseCurrency || 'KRW');
  const [val, setVal] = useState(edit ? String(edit.amount) : '');
  const [date, setDate] = useState(edit?.date || today());
  const [memo, setMemo] = useState(edit?.memo || '');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const bal = ctx.cash.find((c) => c.accountId === accId && c.currency === cur)?.amount || 0;
  const pickA = (id) => { setAcc(id); const a = ctx.accById[id]; if (a && !(a.currencies || ['KRW']).includes(cur)) setCur(a.currencies?.[0] || 'KRW'); };
  const target = parseNum(val);
  const save = async () => {
    setBusy(true);
    try {
      if (edit) {
        if (!target || !isFinite(target)) { setErr(mig ? '0이 아닌 금액을 넣어 주세요' : '0보다 큰 금액을 입력해 주세요'); setBusy(false); return; }
        await updateCashTx(edit.id, { accountId: accId, currency: cur, amount: target, date, memo: memo.trim() });
        toast('고쳤어요');
      } else {
        if (!(target >= 0) || String(val).trim() === '') { setErr('증권사 앱의 잔액을 넣어 주세요'); setBusy(false); return; }
        const r = await setCashTo(accId, cur, target, { date, memo: memo.trim() || undefined });
        toast(r ? `${money(r.amount, cur, { sign: true })}만큼 맞췄어요` : '이미 같은 금액이에요');
      }
      haptic(); closeSheet();
    } catch (e) { fail(e); setBusy(false); }
  };
  if (edit) {
    return html`<${BottomSheet} title=${mig ? '기초 잔액 고치기' : '잔액 맞추기 고치기'} desc=${mig ? '업데이트 때 옮겨 온 잔액이에요. 금액만 고칠 수 있어요.' : null}
      footer=${html`<${Foot} label="저장하기" busy=${busy} onSave=${save} onDelete=${mig ? null : () => removeRow(edit)} />`}>
      <div className="row"><span className="m">계좌</span><span className="v">${acc?.name} · ${curLabel(cur)}</span></div>
      <${Field} id="aj-amt" label=${`보정 금액 (${unit(cur)}, 빼려면 −)`} error=${err}><${NumInput} id="aj-amt" value=${val} onChange=${(v) => { setVal(v.replace('−', '-')); setErr(null); }} error=${err} /><//>
      ${!mig && html`<${DateField} id="aj-date" value=${date} onChange=${setDate} /><${MemoField} id="aj-memo" value=${memo} onChange=${setMemo} />`}
    <//>`;
  }
  const diff = target >= 0 ? target - bal : null;
  return html`<${BottomSheet} title="잔액 맞추기" desc="증권사 잔고와 다를 때 차이만큼 기록해요." footer=${html`<${Foot} label="잔액 맞추기" busy=${busy} onSave=${save} />`}>
    <${AccChips} ctx=${ctx} value=${accId} onChange=${pickA} />
    <${CurSeg} acc=${acc} value=${cur} onChange=${setCur} />
    <div className="pv"><div className="row"><span className="m">앱 잔액</span><${Amount} value=${bal} cur=${cur} className="v" /></div>
      ${diff != null && String(val).trim() !== '' && html`<div className="row"><span className="m">차이</span><span className="v">${money(diff, cur, { sign: true })}</span></div>`}</div>
    <${Field} id="aj-target" label=${`증권사 잔액 (${unit(cur)})`} error=${err} hint="증권사 앱의 '예수금(D+2)'을 그대로 적어 주세요."><${NumInput} id="aj-target" value=${val} onChange=${(v) => { setVal(v); setErr(null); }} error=${err} /><//>
    <${DateField} id="aj-date" value=${date} onChange=${setDate} />
    <${MemoField} id="aj-memo" value=${memo} onChange=${setMemo} />
  <//>`;
}

// ---------- 거래 행(매매): 되돌리기(종목별 가장 최근 거래만) + 메모 ----------
function TradeSheet({ ctx, query }) {
  const t = ctx.trades.find((x) => x.id === query.sid);
  const [memo, setMemo] = useState(t?.memo || '');
  useEffect(() => { if (!t) closeSheet(); }, [t]);
  if (!t) return null;
  const latest = ctx.trades.filter((x) => x.holdingId === t.holdingId).sort(byLatest)[0];
  const canUndo = latest?.id === t.id && !t.initial && !t.closed;
  const acc = ctx.accById[t.accountId];
  const nm = hname(t);
  const undo = async () => {
    if (!(await ask({ title: '이 거래를 되돌릴까요?', desc: '수량·평균 매수가가 이전으로 돌아가고, 현금 반영분도 함께 돌아가요.', ok: '되돌리기' }))) return;
    if (await undoTrade(t.id)) { toast('되돌렸어요'); closeSheet(); } else toast('가장 최근 거래만 되돌릴 수 있어요', { type: 'error' });
  };
  const saveMemo = async () => { await updateTradeMemo(t.id, memo.trim()); toast('메모를 저장했어요'); closeSheet(); };
  const kind = t.initial ? '처음 보유' : t.side === 'BUY' ? '매수' : '매도';
  return html`<${BottomSheet} title=${`${nm} ${kind}`} footer=${html`<div style=${{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
      <button className="btn sec2" type="button" onClick=${saveMemo}>메모 저장</button>
      ${canUndo && html`<button className="btn danger" type="button" onClick=${undo}>이 거래 되돌리기</button>`}</div>`}>
    <div className="pv">
      <div className="row"><span className="m">계좌</span><span className="v">${acc?.name || '삭제된 계좌'}</span></div>
      <div className="row"><span className="m">거래일</span><span className="v">${t.tradedAt}</span></div>
      <div className="row"><span className="m">수량 × 가격</span><span className="v">${qty(t.quantity)} × ${fmtPrice(t.price, t.priceCurrency)}</span></div>
      ${t.fxRate && html`<div className="row"><span className="m">환율</span><span className="v">${fxf(t.fxRate)}원</span></div>`}
      <div className="row"><span className="m">현금</span><span className="v">${t.cashApplied ? money(t.cashApplied.amount, t.cashApplied.currency, { sign: true }) : '반영 안 함'}</span></div>
      ${t.side === 'SELL' && html`<div className="row"><span className="m">실현손익 <span className="sm">세금 전</span></span><span className="v">${won(t.realizedKrw, { sign: true })}</span></div>`}
    </div>
    <${MemoField} id="ts-memo" value=${memo} onChange=${setMemo} />
    ${!canUndo && !t.initial && html`<div className="sm">지난 거래 수정은 아직 안 돼요. 종목별 가장 최근 거래만 되돌릴 수 있어요.</div>`}
    ${ctx.holdings.some((h) => h.id === t.holdingId) && html`<button className="link2" type="button" onClick=${() => goFromSheet('#/holding/' + t.holdingId)}>종목 보기</button>`}
  <//>`;
}

// ---------- 배당 기록·수정(M5 §3.5.4). sid가 있으면 수정 ----------
const cname = (c) => (c.market === 'US' ? c.ticker || c.name : c.name || c.ticker);
function DivSheet({ ctx, query }) {
  const edit = query.sid ? ctx.dividends.find((x) => x.id === query.sid) : null;
  const gone = !!query.sid && !edit;
  useEffect(() => { if (gone) closeSheet(); }, [gone]);
  const choices = dividendChoices(ctx.holdings, ctx.trades);
  const [key, setKey] = useState(edit?.holdingKey || choices[0]?.key || '');
  const choice = choices.find((c) => c.key === key) || (edit ? { key, market: edit.market, ticker: edit.ticker, name: edit.name, accountIds: [edit.accountId], past: true } : null);
  const accIds = (choice?.accountIds || []).filter((id) => ctx.accById[id]);
  const firstAcc = (ids) => (ids.includes(query.sa) ? query.sa : ids.includes(ctx.settings.lastAccountId) ? ctx.settings.lastAccountId : ids[0] || '');
  const [accId, setAcc] = useState(edit?.accountId || firstAcc(accIds));
  const native = choice?.market === 'US' ? 'USD' : 'KRW';
  const taxOf = (c) => { const r = ctx.settings.divTaxRate?.[c?.key]; return String(r != null ? r : (ctx.settings.divTaxDefault || { US: 15, KR: 15.4 })[c?.market === 'US' ? 'US' : 'KR']); };
  const perMatch = !!edit && edit.perShare > 0 && Math.abs(roundCur(edit.perShare * edit.quantity, edit.currency) - edit.gross) < 0.005;
  const [mode, setMode] = useState(edit && !perMatch ? 'total' : 'per');
  const [ps, setPs] = useState(perMatch ? String(edit.perShare) : '');
  const [gross, setGross] = useState(edit ? String(edit.gross) : '');
  const [date, setDate] = useState(edit?.payDate || today());
  const [qtyStr, setQty] = useState(edit ? String(edit.quantity) : null); // null = 지급일 기준 자동
  const [rate, setRate] = useState(edit ? String(edit.taxRate) : taxOf(choice));
  const [cur, setCur] = useState(edit?.currency || native);
  const [fxStr, setFx] = useState(edit?.fxRate ? String(edit.fxRate) : null); // null = 그날 스냅샷·지금 환율
  const autoTax = edit ? roundCur((edit.gross * edit.taxRate) / 100, edit.currency) : null;
  const [netStr, setNet] = useState(edit && Math.abs(autoTax - edit.tax) > 0.005 ? String(edit.net) : '');
  const [apply, setApply] = useState(edit ? !!edit.cashApplied : true);
  const [memo, setMemo] = useState(edit?.memo || '');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  if (gone) return null;
  if (!choice) {
    return html`<${BottomSheet} title="배당 기록"><${Empty} icon="coin" title="배당을 기록할 종목이 없어요" desc="종목을 먼저 추가해 주세요."
      action=${{ label: '종목 추가하기', onClick: () => goFromSheet('#/holding/new') }} /><//>`;
  }
  const auto = qtyAtDate({ trades: ctx.trades, holdings: ctx.holdings, key, accountId: accId, date });
  const qShown = qtyStr != null ? qtyStr : auto.quantity > 0 ? String(auto.quantity) : '';
  const fxShown = fxStr != null ? fxStr : String(payDateFx(ctx.snapshots, date, ctx.fxRate) || '');
  const pickKey = (k) => {
    const c = choices.find((x) => x.key === k);
    setKey(k); setAcc(firstAcc((c?.accountIds || []).filter((id) => ctx.accById[id])));
    setRate(taxOf(c)); setCur(c?.market === 'US' ? 'USD' : 'KRW'); setQty(null); setNet(''); setErr(null);
  };
  const input = {
    holding: choice, accountId: accId, payDate: date, mode, perShare: parseNum(ps), gross: parseNum(gross), quantity: parseNum(qShown) || 0,
    taxRate: parseNum(rate), netOverride: netStr.trim() === '' ? null : parseNum(netStr), currency: cur,
    fxRate: parseNum(fxShown) > 0 ? parseNum(fxShown) : undefined, applyCash: apply, memo: memo.trim(),
  };
  const calc = dividendCalc(input);
  const plain = dividendCalc({ ...input, netOverride: null });
  const save = async () => {
    if (date > today()) { setErr('지급일이 아직 안 왔어요. 예상 배당은 2차에서 보여 드릴게요'); haptic([20, 40, 20]); return; }
    if (calc.error) { setErr(calc.error); haptic([20, 40, 20]); return; }
    setBusy(true);
    try {
      await saveDividend(input, edit?.id);
      haptic(); toast(edit ? '고쳤어요' : '배당을 기록했어요'); closeSheet();
    } catch (e) { fail(e); setBusy(false); }
  };
  const del = async () => {
    if (!(await ask({ title: '이 배당 기록을 지울까요?', desc: edit.cashApplied ? '현금에 더한 금액도 함께 빠져요.' : '배당 합계에서 빠져요.', ok: '지우기', danger: true }))) return;
    await deleteDividend(edit.id); toast('지웠어요'); closeSheet();
  };
  const live = choices.filter((c) => !c.past), past = choices.filter((c) => c.past);
  const u = unit(cur);
  return html`<${BottomSheet} title=${edit ? `${hname(edit)} 배당 고치기` : '배당 기록'}
    footer=${html`<${Foot} label=${edit ? '저장하기' : '배당 기록하기'} busy=${busy} onSave=${save} onDelete=${edit ? del : null} />`}>
    ${edit ? html`<div className="row"><span className="m">종목</span><span className="v">${cname(choice)}</span></div>`
      : html`<${Field} id="dv-key" label="종목"><select id="dv-key" className="inp" value=${key} onChange=${(e) => pickKey(e.target.value)}>
          ${live.length > 0 && html`<optgroup label="보유 중">${live.map((c) => html`<option key=${c.key} value=${c.key}>${cname(c)}</option>`)}</optgroup>`}
          ${past.length > 0 && html`<optgroup label="예전 보유">${past.map((c) => html`<option key=${c.key} value=${c.key}>${cname(c)} (예전 보유)</option>`)}</optgroup>`}
        </select><//>`}
    ${accIds.length > 1 && !edit ? html`<div className="fld"><span className="lab">계좌</span>
        <${Chips} label="계좌" value=${accId} onChange=${(v) => { setAcc(v); setQty(null); }} options=${accIds.map((id) => [id, ctx.accById[id].name])} /></div>`
      : html`<div className="row"><span className="m">계좌</span><span className="v">${ctx.accById[accId]?.name || '삭제된 계좌'}</span></div>`}
    <${Field} id="dv-date" label="지급일"><input id="dv-date" type="date" className="inp" value=${date} max=${today()} onChange=${(e) => { setDate(e.target.value); setErr(null); }} /><//>
    ${choice.market === 'US' && html`<div className="fld"><span className="lab">받은 통화</span>
      <${Seg} label="받은 통화" block value=${cur} onChange=${(v) => { setCur(v); setNet(''); }} options=${[['USD', '달러'], ['KRW', '원화 (환전 입금)']]} /></div>`}
    <div className="fld"><span className="lab">입력</span><${Seg} label="입력 방식" block value=${mode} onChange=${(v) => { setMode(v); setErr(null); }} options=${[['per', '주당 배당'], ['total', '총액']]} /></div>
    ${mode === 'per'
      ? html`<${Field} id="dv-ps" label=${`주당 배당 (세전, ${u})`}><${NumInput} id="dv-ps" value=${ps} onChange=${(v) => { setPs(v); setErr(null); }} placeholder=${cur === 'USD' ? '예: 0.45' : '예: 2,000'} /><//>`
      : html`<${Field} id="dv-gross" label=${`세전 총액 (${u})`}><${NumInput} id="dv-gross" value=${gross} onChange=${(v) => { setGross(v); setErr(null); }} placeholder=${cur === 'USD' ? '예: 45.00' : '예: 20,000'} /><//>`}
    <div className="two">
      <${Field} id="dv-q" label="수량 (주)" hint=${qtyStr != null ? (edit && qtyStr === String(edit.quantity) ? '기록한 수량' : '직접 넣었어요') : auto.check ? '확인해 주세요' : '지급일 기준 자동'}>
        <${NumInput} id="dv-q" value=${qShown} onChange=${(v) => { setQty(v); setErr(null); }} placeholder="0" /><//>
      <${Field} id="dv-rate" label="세율 (%)" hint=${edit ? null : '지난번 값'}><${NumInput} id="dv-rate" value=${rate} onChange=${(v) => { setRate(v); setNet(''); setErr(null); }} /><//>
    </div>
    ${(cur === 'USD' || choice.market === 'US') && html`<${Field} id="dv-fx" label="환율 (원/$, 참고용)" hint="원화 환산에만 써요. 그날 기록된 환율이나 지금 환율이 기본값이에요.">
      <${NumInput} id="dv-fx" value=${fxShown} onChange=${setFx} placeholder="예: 1,380.00" /><//>`}
    <div className="m56-sum" aria-live="polite">
      ${calc.error ? html`<div className="sm">${calc.error}</div>` : html`
        <div className="m56-sub">세전 ${money(calc.gross, cur)} · 세금 ${money(calc.tax, cur)}</div>
        <div className="row"><span className="m">받은 금액</span><span className="big">${money(calc.net, cur)}</span></div>`}
    </div>
    <${Field} id="dv-net" label=${`받은 금액 직접 고치기 (${u}, 선택)`} hint="증권사 입금액과 다르면 넣어 주세요. 세금은 거꾸로 계산해요.">
      <${NumInput} id="dv-net" value=${netStr} onChange=${(v) => { setNet(v); setErr(null); }} placeholder=${plain.error ? '' : String(plain.net)} /><//>
    <label className="chk"><input type="checkbox" checked=${apply} onChange=${(e) => setApply(e.target.checked)} />${cur === 'USD' ? '달러' : '원화'} 현금에 반영</label>
    ${!apply && html`<div className="sm">배당을 바로 재투자(DRIP)했다면 꺼 주세요. 재투자 매수를 따로 기록하면 두 번 더해지지 않아요.</div>`}
    <${MemoField} id="dv-memo" value=${memo} onChange=${setMemo} />
    ${err && html`<div className="err" role="alert">${err}</div>`}
  <//>`;
}

// ---------- 매수·매도 종목 고르기: 최근 종목 칩 + 검색 ----------
function PickHolding({ ctx, query }) {
  const side = query.side === 'SELL' ? 'SELL' : 'BUY';
  const [q, setQ] = useState('');
  const pool = ctx.holdings.filter((h) => side === 'BUY' || h.quantity > 0);
  const lastAt = {};
  for (const t of ctx.trades) if (!lastAt[t.holdingId] || t.createdAt > lastAt[t.holdingId]) lastAt[t.holdingId] = t.createdAt;
  const recent = pool.filter((h) => lastAt[h.id]).sort((a, b) => lastAt[b.id].localeCompare(lastAt[a.id])).slice(0, 5);
  const s = q.trim().toLowerCase();
  const list = pool.filter((h) => !s || [h.ticker, h.name].some((x) => (x || '').toLowerCase().includes(s)));
  const go = (h) => goFromSheet(`#/holding/${h.id}/trade/${side}`);
  return html`<${BottomSheet} title=${side === 'BUY' ? '어떤 종목을 샀나요?' : '어떤 종목을 팔았나요?'}>
    ${recent.length > 0 && html`<div className="fld"><span className="lab">최근 거래한 종목</span><div className="chips">
      ${recent.map((h) => html`<button key=${h.id} type="button" className="chip" onClick=${() => go(h)}>${hname(h)} · ${ctx.accById[h.accountId]?.name.split(' ')[0] || ''}</button>`)}</div></div>`}
    <input className="inp" type="search" aria-label="종목 검색" placeholder="티커나 종목명으로 찾기" value=${q} onChange=${(e) => setQ(e.target.value)} />
    <div>${list.map((h) => html`<${ListRow} key=${h.id} onClick=${() => go(h)} avatar=${html`<${Avatar} text=${initials(h)} seed=${holdKey(h)} />`}
      title=${hname(h)} sub=${`${ctx.accById[h.accountId]?.name || ''} · ${qty(h.quantity)}`} chev />`)}
      ${!list.length && html`<div className="sm" style=${{ padding: '12px 0' }}>찾는 종목이 없어요.</div>`}</div>
    ${side === 'BUY' && html`<button className="link2" type="button" onClick=${() => goFromSheet('#/holding/new')}>새 종목 추가하기</button>`}
  <//>`;
}

// ---------- 기록 메뉴(+) ----------
function RecordMenu({ ctx, query }) {
  const sa = query.acc || undefined;
  const hasHold = ctx.holdings.length > 0;
  const items = [
    ['buy', '매수', () => (hasHold ? swapSheet('pick', { side: 'BUY' }) : goFromSheet('#/holding/new' + (sa ? '?acc=' + sa : '')))],
    ['sell', '매도', () => (ctx.holdings.some((h) => h.quantity > 0) ? swapSheet('pick', { side: 'SELL' }) : toast('팔 수 있는 종목이 없어요', { type: 'error' }))],
    ['inArr', '입금', () => swapSheet('deposit', { sa })],
    ['outArr', '출금', () => swapSheet('withdraw', { sa })],
    ['swap', '환전', () => swapSheet('fx', { sa })],
    ['xfer', '계좌 간 이체', () => (ctx.accounts.length > 1 ? swapSheet('transfer', { sa }) : toast('계좌가 2개 이상일 때 쓸 수 있어요', { type: 'error' }))],
    ['coin', '배당', () => swapSheet('div', { sa })],
    ['pct', '이자', () => swapSheet('interest', { sa })],
  ];
  return html`<${BottomSheet} title="무엇을 기록할까요?">
    <div className="menu-grid">
      ${items.map(([ic, t, fn], i) => html`<button key=${t} type="button" className="mi" onClick=${fn}><${Avatar} icon=${ic} seed=${String(i)} />${t}</button>`)}
    </div>
    <div style=${{ borderTop: '1px solid var(--line)' }}>
      <${ListRow} onClick=${() => swapSheet('adjust', { sa })} avatar=${html`<${Avatar} icon="eq" seed="8" />`} title="잔액 맞추기" sub="증권사 잔고와 다를 때" chev />
      <${ListRow} onClick=${() => goFromSheet('#/holding/new' + (sa ? '?acc=' + sa : ''))} avatar=${html`<${Avatar} icon="plus" seed="9" />`} title="종목 추가" sub="처음 보유한 종목을 옮겨 적어요" chev />
      <${ListRow} onClick=${() => swapSheet('prices')} avatar=${html`<${Avatar} icon="pen" seed="10" />`} title="시세 · 환율 입력" chev />
    </div>
  <//>`;
}

// ---------- 시세·환율 입력 ----------
function PricesSheet({ ctx }) {
  const { ui, save } = usePriceForm({ ctx, onDone: closeSheet });
  return html`<${BottomSheet} title="시세 · 환율 입력" footer=${html`<button className="btn" type="button" onClick=${save}>저장하기</button>`}>${ui}<//>`;
}

// ---------- 종목 목록 정렬 + 시장 필터(M3). 선택은 설정에 기억 ----------
function SortSheet({ ctx }) {
  const sort = ctx.settings.holdingSort || 'mv';
  const market = ctx.settings.holdingMarket || 'all';
  const pick = async (patch) => { haptic(); await saveSettings(patch); closeSheet(); };
  return html`<${BottomSheet} title="정렬">
    <div role="radiogroup" aria-label="정렬">
      ${SORTS.map(([v, t]) => html`<button key=${v} type="button" role="radio" aria-checked=${sort === v} className=${'m3-opt' + (sort === v ? ' on' : '')} onClick=${() => pick({ holdingSort: v })}>
        <span>${t}</span>${sort === v && html`<${Icon} name="check" />`}</button>`)}
    </div>
    <div className="fld"><span className="lab">시장</span>
      <${Seg} label="시장" block value=${market} onChange=${(v) => pick({ holdingMarket: v })} options=${[['all', '전체'], ['US', '해외'], ['KR', '국내']]} /></div>
  <//>`;
}

// ---------- 합산 종목에서 매수·매도: 계좌 먼저 고르기(M3-4). 마지막 사용 계좌가 맨 위 ----------
function PickAccountSheet({ ctx, query }) {
  const side = query.side === 'SELL' ? 'SELL' : 'BUY';
  const list = accountChoices(ctx.holdings, query.sid || '', side, ctx.settings.lastAccountId);
  const nm = list[0] ? hname(list[0]) : '';
  return html`<${BottomSheet} title=${`어느 계좌에서 ${side === 'BUY' ? '샀나요' : '팔았나요'}?`} desc=${nm ? `${nm} · 계좌를 고르면 ${side === 'BUY' ? '매수' : '매도'} 기록으로 넘어가요.` : null}>
    <div>${list.map((h) => html`<${ListRow} key=${h.id} onClick=${() => goFromSheet(`#/holding/${h.id}/trade/${side}`)}
      avatar=${html`<${Avatar} text=${(ctx.accById[h.accountId]?.name || '?').replace(/\s/g, '').slice(0, 2)} seed=${h.accountId} />`}
      title=${ctx.accById[h.accountId]?.name || '계좌'} sub=${`보유 ${qty(h.quantity)} · 평단 ${fmtPrice(h.avgPrice, h.costCurrency || (h.market === 'US' ? 'USD' : 'KRW'))}`} chev />`)}
      ${!list.length && html`<div className="sm" style=${{ padding: '12px 0' }}>${side === 'SELL' ? '팔 수 있는 계좌가 없어요.' : '이 종목을 가진 계좌가 없어요.'}</div>`}</div>
    ${side === 'BUY' && html`<button className="link2" type="button" onClick=${() => goFromSheet('#/holding/new')}>다른 계좌에 새로 추가하기</button>`}
  <//>`;
}

function Unknown() {
  useEffect(() => { closeSheet(); }, []);
  return null;
}

export function SheetHost({ name, ctx, query }) {
  const p = { ctx, query };
  // 이름이 같아도 대상(sid 등)이 바뀌면 새로 그린다
  const key = name + (query.sid || '') + (query.side || '');
  switch (name) {
    case 'record': return html`<${RecordMenu} key=${key} ...${p} />`;
    case 'pick': return html`<${PickHolding} key=${key} ...${p} />`;
    case 'deposit': case 'withdraw': case 'interest': return html`<${CashSheet} key=${key} ...${p} type=${name} />`;
    case 'fx': return html`<${FxSheet} key=${key} ...${p} />`;
    case 'transfer': return html`<${TransferSheet} key=${key} ...${p} />`;
    case 'adjust': return html`<${AdjustSheet} key=${key} ...${p} />`;
    case 'trade': return html`<${TradeSheet} key=${key} ...${p} />`;
    case 'div': return html`<${DivSheet} key=${key} ...${p} />`;
    case 'prices': return html`<${PricesSheet} key=${key} ...${p} />`;
    case 'sort': return html`<${SortSheet} key=${key} ...${p} />`;
    case 'pickacc': return html`<${PickAccountSheet} key=${key} ...${p} />`;
    default: return html`<${Unknown} />`;
  }
}
