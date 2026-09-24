import { html, useState, useEffect } from '../react.js';
import { TopBar, Icon, Seg, Banner, Banners, Empty, Amount, Avatar, ListRow, PeriodChips, PERIODS, BottomSheet, openSheet } from '../components.js';
import { money, pct, cls, plLine, fx as fxf, when, daysAgo, today } from '../format.js';
import { saveSettings } from '../store.js';
import { buildSnapshot, mergeLive, periodView, periodReturn, snapValue, mdLabel, dayDiff } from '../period.js';
import { LineChart, Spark } from '../charts.js';
import { NegCash } from './account.js';

// 기간 칩 선택은 화면을 오가도 유지(앱을 다시 열면 1달)
let lastPeriod = '1m';
const PNAME = Object.fromEntries(PERIODS);
const dimOf = (s) => s.noPrice > 0 || !!s.fxMissing;

// 기간 손익 한 줄(가리기는 money()가 처리)
function plText(r, S, cur, since) {
  if (r.ok) return `${money(r.pnl, cur, { sign: true })}${r.ret != null ? ` (${pct(r.ret, 2)})` : ''} · ${mdLabel(S.date)} 대비`;
  if (r.reason === 'nofx') return '계산 불가 · 환율이 없던 날이 있어요';
  return `데이터 없음 · ${mdLabel(since)}부터 기록하고 있어요`;
}

export function Home({ ctx, refresh, refreshing }) {
  const { sum, settings, fxRate } = ctx;
  const cur = settings.totalCurrency === 'USD' && fxRate ? 'USD' : 'KRW';
  const conv = (v) => (v == null ? null : cur === 'USD' ? v / fxRate : v);
  const [period, setPeriodS] = useState(lastPeriod);
  const [scrub, setScrub] = useState(null);
  const [why, setWhy] = useState(false);
  const setPeriod = (p) => { lastPeriod = p; setPeriodS(p); setScrub(null); };

  // (?) 설명 시트: 뒤로가기로 닫히게 기록을 하나 쌓는다
  useEffect(() => {
    if (!why) return;
    const f = () => setWhy(false);
    addEventListener('popstate', f);
    return () => removeEventListener('popstate', f);
  }, [why]);
  const openWhy = () => { history.pushState({ why: 1 }, ''); setWhy(true); };
  const closeWhy = () => history.back();

  if (!ctx.accounts.length) {
    return html`<${TopBar} title="내 자산" large /><${Empty} title="아직 계좌가 없어요" desc="계좌부터 만들면 바로 볼 수 있어요." action=${{ label: '처음 시작하기', href: '#/start' }} />`;
  }

  const staleDays = daysAgo(ctx.pricesAt);
  const banners = [];
  if (!settings.onboarded) banners.push(html`<${Banner} key="o" info action="이어서" href="#/start">처음 입력을 이어서 할까요?<//>`);
  if (sum.fxMissing) banners.push(html`<${Banner} key="f" action="환율 입력" onClick=${() => openSheet('prices')}>환율이 없어 달러 자산을 합계에서 뺐어요.<//>`);
  if (!ctx.connected && (staleDays == null || staleDays >= settings.staleDays) && ctx.holdings.length) banners.push(html`<${Banner} key="s" action="시세 입력" onClick=${() => openSheet('prices')}>${staleDays == null ? '현재가를 아직 입력하지 않았어요.' : `시세를 입력한 지 ${staleDays}일 지났어요.`}<//>`);
  const lastBk = [settings.lastGoogleBackupAt, settings.lastBackupAt].filter(Boolean).sort().pop();
  if (!lastBk || daysAgo(lastBk) >= 30) banners.push(html`<${Banner} key="b" action="백업" href="#/backup">${lastBk ? `마지막 백업이 ${daysAgo(lastBk)}일 전이에요.` : '백업해 두면 폰을 바꿔도 그대로예요.'}<//>`);
  if (!ctx.connected) banners.push(html`<${Banner} key="c" action="연결" href="#/connect">시세 자동 연결 전이라 입력한 현재가로 평가해요.<//>`);

  const toggleCur = (v) => { setScrub(null); saveSettings({ totalCurrency: v }); };
  const toggleHide = () => saveSettings({ hideAmounts: !settings.hideAmounts });
  const hidden = !!settings.hideAmounts;
  const cats = sum.cats.filter((c) => c.value > 0);
  const negKRW = ctx.negCash.some((c) => c.currency === 'KRW'), negUSD = ctx.negCash.some((c) => c.currency === 'USD');

  // ---- 자산 추이(M4): 저장된 스냅샷 + 지금 값(오늘, main.js가 저장하는 것과 같은 함수) ----
  const t0 = today();
  const snaps = mergeLive(ctx.snapshots, buildSnapshot({ date: t0, sum, fxRate, cashTx: ctx.cashTx, trades: ctx.trades }));
  const view = periodView(snaps, period, t0, cur);
  const off = PERIODS.map(([p]) => p).filter((p) => !periodView(snaps, p, t0, cur).r.ok);
  const pts = view.series.map((s) => ({ date: s.date, value: snapValue(s, cur), dim: dimOf(s) }));
  const drawable = pts.filter((p) => p.value != null).length >= 2;
  const sp = scrub != null ? view.series[scrub] : null;
  const shownR = sp ? periodReturn(view.S, sp, cur) : view.r;
  const heroValue = sp ? snapValue(sp, cur) : conv(sum.total);
  let plLineText = plText(shownR, view.S, cur, view.since);
  if (sp && view.S && sp.date === view.S.date) plLineText = `${mdLabel(sp.date)} · 이 기간의 기준일이에요`;
  const plCls = shownR.ok ? cls(shownR.pnl) : 'm';
  const chartLabel = (() => {
    const nm = PNAME[period];
    if (!drawable) return `${nm} 자산 추이`;
    const a = pts.find((p) => p.value != null), b = [...pts].reverse().find((p) => p.value != null);
    const r = view.r.ok && view.r.ret != null ? view.r.ret : null;
    const dir = r == null ? '' : r > 0 ? `${pct(r, 2, { sign: false })} 올랐어요` : r < 0 ? `${pct(-r, 2, { sign: false })} 내렸어요` : '그대로예요';
    if (hidden) return `${nm} 동안 ${dir || '자산 추이'}`;
    return `${nm} 동안 ${money(a.value, cur)}에서 ${money(b.value, cur)}으로 바뀌었어요${dir ? ', 수익률로는 ' + dir : ''}`;
  })();
  const emptyMsg = snaps.length < 2 ? '내일부터 자산 추이가 그려져요' : '이 기간에는 기록이 하루뿐이에요';

  // 계좌 스파크라인: 최근 30일 byAccount(v2 스냅샷에만 있음)
  const recent = snaps.filter((s) => dayDiff(s.date, t0) <= 30);
  const sparkOf = (id) => recent.map((s) => ({ date: s.date, value: s.byAccount ? s.byAccount[id] ?? null : null }));

  return html`
    <${TopBar} title="내 자산" large>
      <button className="icon-btn" type="button" aria-label=${settings.hideAmounts ? '금액 보이기' : '금액 가리기'} aria-pressed=${!!settings.hideAmounts} onClick=${toggleHide}><${Icon} name=${settings.hideAmounts ? 'eyeoff' : 'eye'} /></button>
      ${ctx.connected ? html`<button className="icon-btn" type="button" aria-label="시세 새로고침" onClick=${refresh} disabled=${refreshing}><${Icon} name="refresh" /></button>`
        : html`<button className="icon-btn" type="button" aria-label="현재가 입력" onClick=${() => openSheet('prices')}><${Icon} name="pen" /></button>`}
      <button className="icon-btn" type="button" aria-label="기록하기" onClick=${() => openSheet('record')}><${Icon} name="plus" /></button>
    <//>
    <div className="body">
      <${Banners} items=${banners} />
      <section className="sec hero m4-hero" aria-label="총자산">
        <div className="row m4-top"><span className="lbl">${sp ? `${mdLabel(sp.date)} 총자산` : '총자산'}</span>
          ${fxRate ? html`<${Seg} label="표시 통화" value=${cur} onChange=${toggleCur} options=${[['KRW', '원'], ['USD', '$']]} />` : null}</div>
        <${Amount} key=${cur} value=${heroValue} cur=${cur} size="t1" roll=${!sp} />
        <div className="m4-pl">
          <span className=${'pl ' + plCls}>${plLineText}</span>
          <button type="button" className="m4-q" aria-label="기간 수익률 계산 방법" onClick=${openWhy}>?</button>
        </div>
        ${sp && dimOf(sp) ? html`<div className="sm m4-dimcap">이날은 시세나 환율이 빠져 있어요</div>` : null}
        <div className="m4-chart">
          ${drawable ? html`<${LineChart} key=${period + cur} points=${pts} height=${160} label=${chartLabel} onScrub=${setScrub} showDates=${!hidden} />`
            : html`<div className="m4-empty" role="img" aria-label=${emptyMsg}><span>${emptyMsg}</span></div>`}
        </div>
        <div className="m4-ctl">
          <${PeriodChips} value=${period} onChange=${setPeriod} disabled=${off} />
        </div>
      </section>

      <section className="sec" aria-label="현금">
        <a className="row" style=${{ minHeight: '44px', alignItems: 'center' }} href="#/account/history?f=cash"><span className="m">원화 현금${negKRW ? html` <span className="badge up">마이너스</span>` : ''}</span><span className="v"><${Amount} value=${sum.cashKRW} cur="KRW" /> ›</span></a>
        <a className="row" style=${{ minHeight: '44px', alignItems: 'center' }} href="#/account/history?f=cash"><span className="m">달러 현금${negUSD ? html` <span className="badge up">마이너스</span>` : ''}</span><span className="v"><${Amount} value=${sum.cashUSD} cur="USD" /> ›</span></a>
        <button type="button" className="row sm" style=${{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--t3)', textAlign: 'left', minHeight: '32px', alignItems: 'center' }} onClick=${() => openSheet('prices')}>
          <span>환율 ${fxRate ? fxf(fxRate) + '원' : '없음'}${ctx.fx?.asOf ? ` · ${when(ctx.fx.asOf)} ${ctx.fx.source === 'google' ? '자동' : '입력'}` : ''}</span><span>›</span></button>
      </section>
      ${ctx.negCash.map((c) => html`<${NegCash} key=${c.id} ctx=${ctx} c=${c} />`)}

      <section className="sec" aria-label="계좌별">
        <h2>계좌</h2>
        <div className="list-in">
        ${sum.byAccount.map((a) => html`<${ListRow} key=${a.acc.id} href=${'#/holdings?acc=' + a.acc.id}
          avatar=${html`<${Avatar} text=${a.acc.name.replace(/\s/g, '').slice(0, 2)} seed=${a.acc.id} />`}
          title=${a.acc.name} badge=${ctx.negCash.some((c) => c.accountId === a.acc.id) ? { text: '현금 마이너스', cls: 'up' } : null} sub=${`종목 ${a.count}개 · 비중 ${pct(a.pct, 1, { sign: false })}`}
          right=${html`<span className="m4-accr"><${Spark} points=${sparkOf(a.acc.id)} label=${`${a.acc.name} 최근 30일 추이`} /><${Amount} value=${a.totalBase} cur=${a.acc.baseCurrency} /></span>`}
          rightSub=${a.count ? `평가 수익률 ${pct(a.ret, 1)}` : null} rightCls=${cls(a.pnlKrw)} />`)}
        </div>
      </section>

      <section className="sec" aria-label="종목 요약">
        <div className="row"><span className="m">종목 평가</span><span className="v">${money(conv(sum.holdingsKrw), cur)}</span></div>
        <div className="row"><span className="m">종목 원금</span><span className="v">${money(conv(sum.costKrw), cur)}</span></div>
        <div className="row"><span className="m">종목 평가손익${sum.noPrice ? html` <span className="sm">시세 없는 ${sum.noPrice}개는 매입가로</span>` : ''}</span><span className=${'v ' + cls(sum.pnlKrw)}>${plLine(conv(sum.pnlKrw), cur, sum.ret)}</span></div>
        <a className="row" href="#/account/profit?v=year"><span className="m">올해 실현손익 <span className="sm">세금 전</span></span><span className=${'v ' + cls(ctx.realizedYear)}>${money(conv(ctx.realizedYear), cur, { sign: true })} ›</span></a>
      </section>

      <a className="sec link" href="#/account" aria-label="자산 구성">
        <h2>자산 구성 <${Icon} name="right" className="chev" /></h2>
        <div className="stack" aria-hidden="true">${cats.map((c) => html`<span key=${c.id} style=${{ width: c.pct + '%', background: c.color }} />`)}</div>
        ${cats.map((c) => html`<div key=${c.id} className="row"><span><i className="sw" style=${{ background: c.color }} />${c.label}</span><span className="v">${pct(c.pct, 1, { sign: false })}</span></div>`)}
        ${fxRate && html`<div className="sm">원화 자산 ${pct(sum.byCurrency[0].pct, 1, { sign: false })} · 달러 자산 ${pct(sum.byCurrency[1].pct, 1, { sign: false })}</div>`}
      </a>
    </div>
    ${why && html`<${ReturnWhy} r=${view.r} S=${view.S} E=${view.E} cur=${cur} since=${view.since} period=${period} onClose=${closeWhy} />`}`;
}

// (?) 기간 수익률 설명 시트. 금액은 모두 money()로(가리기 적용)
function ReturnWhy({ r, S, E, cur, since, period, onClose }) {
  const m = (v) => money(v, cur);
  let lines;
  if (r.ok) {
    const flow = r.dN > 0 ? `기간 중 넣은 돈 ${m(r.dN)}은 수익에서 뺐어요.`
      : r.dN < 0 ? `기간 중 뺀 돈 ${m(-r.dN)}은 손실이 아니라서 다시 더했어요.` : '기간 중 넣거나 뺀 돈은 없어요.';
    const calc = r.ret == null ? '시작 자산이 0 이하라서 수익률은 계산하지 않아요.'
      : r.dN > 0 ? `수익 ${m(r.pnl)} ÷ (시작 자산 ${m(r.vS)} + 넣은 돈 ${m(r.dN)}) = ${pct(r.ret, 2)}`
        : `수익 ${m(r.pnl)} ÷ 시작 자산 ${m(r.vS)} = ${pct(r.ret, 2)}`;
    lines = [`${mdLabel(S.date)} ${m(r.vS)}에서 ${mdLabel(E.date)} ${m(r.vE)}이 됐어요.`, flow, calc];
  } else if (r.reason === 'nofx') {
    lines = ['기준일이나 오늘의 환율이 없어서 달러 기준으로는 계산할 수 없어요.', '원화로 바꾸면 볼 수 있어요.'];
  } else {
    lines = [
      `${PNAME[period]} 전 기록이 없어서 아직 계산할 수 없어요. ${mdLabel(since)}부터 앱을 열 때마다 그날 자산을 기록하고 있어요.`,
      '기록이 없는 기간의 입금·출금을 0원으로 치지 않으려고 비워 뒀어요.',
    ];
  }
  return html`<${BottomSheet} title="기간 수익률은 이렇게 계산해요" onClose=${onClose}
    footer=${html`<button className="btn" type="button" onClick=${onClose}>확인</button>`}>
    ${lines.map((l, i) => html`<p key=${i} className="m4-why">${l}</p>`)}
    <div className="sm">손익 = 오늘 자산 − 시작 자산 − (기간 중 넣은 돈 − 뺀 돈)</div>
    <div className="sm">수익률 = 손익 ÷ (시작 자산 + 기간 중 넣은 돈)</div>
    <div className="sm">잔액 맞추기나 수량 수정은 입금이 아니라서 손익으로 잡혀요. 지난 날짜로 넣은 입금은 기록한 날 이후 구간에 반영돼요.</div>
    ${cur === 'USD' ? html`<div className="sm">달러 기준은 환율 변동을 뺀 수익률이에요.</div>` : null}
  <//>`;
}
