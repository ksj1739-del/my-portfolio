import { html, useState } from '../react.js';
import { TopBar, Icon, Seg, Banner, Empty, hname, toast } from '../components.js';
import { won, usd, money, pct, arrow, cls, fx as fxf, when, daysAgo } from '../format.js';
import { saveSettings } from '../store.js';

export function Home({ ctx, refresh, refreshing }) {
  const { sum, settings, fxRate } = ctx;
  const cur = settings.totalCurrency === 'USD' && fxRate ? 'USD' : 'KRW';
  const conv = (v) => (v == null ? null : cur === 'USD' ? v / fxRate : v);
  const m = (v, o) => money(conv(v), cur, o);

  if (!ctx.accounts.length) {
    return html`<${TopBar} title="내 자산" /><${Empty}><p>아직 계좌가 없어요.</p><a className="btn" href="#/start">처음 시작하기</a><//>`;
  }

  const staleDays = daysAgo(ctx.pricesAt);
  const banners = [];
  if (!settings.onboarded) banners.push(html`<${Banner} key="o" info action="이어서" href="#/start">처음 입력을 이어서 할까요?<//>`);
  if (!ctx.connected) banners.push(html`<${Banner} key="c" action="연결" href="#/connect">시세 자동 연결 전이라 입력한 현재가로 평가해요.<//>`);
  if (!ctx.connected && (staleDays == null || staleDays >= settings.staleDays) && ctx.holdings.length) banners.push(html`<${Banner} key="s" action="시세 입력" href="#/prices">${staleDays == null ? '현재가를 아직 입력하지 않았어요.' : `시세를 입력한 지 ${staleDays}일 지났어요.`}<//>`);
  if (sum.fxMissing) banners.push(html`<${Banner} key="f" action="환율 입력" href="#/prices">환율이 없어 달러 자산을 합계에서 뺐어요.<//>`);
  const lastBk = [settings.lastGoogleBackupAt, settings.lastBackupAt].filter(Boolean).sort().pop();
  if (!lastBk || daysAgo(lastBk) >= 30) banners.push(html`<${Banner} key="b" action="백업" href="#/backup">${lastBk ? `마지막 백업이 ${daysAgo(lastBk)}일 전이에요.` : '아직 백업하지 않았어요.'}<//>`);

  const maxBar = Math.max(sum.costKrw, sum.holdingsKrw) || 1;
  const toggleCur = (v) => saveSettings({ totalCurrency: v });
  const toggleHide = () => saveSettings({ hideAmounts: !settings.hideAmounts });

  return html`
    <${TopBar} title="내 자산">
      ${ctx.connected && html`<button className="icon-btn" type="button" aria-label="시세 새로고침" onClick=${refresh} disabled=${refreshing}><${Icon} name="refresh" /></button>`}
      <button className="icon-btn" type="button" aria-label=${settings.hideAmounts ? '금액 보이기' : '금액 가리기'} onClick=${toggleHide}><${Icon} name=${settings.hideAmounts ? 'eyeoff' : 'eye'} /></button>
      <a className="icon-btn" href="#/prices" aria-label="현재가 입력"><${Icon} name="pen" /></a>
    <//>
    <div className="body">
      ${banners}
      <section className="sec" aria-label="총자산">
        <div className="row"><span className="lbl">총자산</span>
          ${fxRate ? html`<${Seg} label="표시 통화" value=${cur} onChange=${toggleCur} options=${[['KRW', '₩'], ['USD', '$']]} />` : null}</div>
        <div className="big">${m(sum.total)}</div>
        <div className="row"><span className="m">평가손익</span><span className=${'v ' + cls(sum.pnlKrw)}>${m(sum.pnlKrw, { sign: true })} (${pct(sum.ret)}) ${arrow(sum.pnlKrw)}</span></div>
        <div className="row"><span className="m">종목 원금</span><span className="v">${m(sum.costKrw)}</span></div>
        <a className="row" href="#/trades"><span className="m">올해 실현손익 <span className="sm">세전</span></span><span className=${'v ' + cls(ctx.realizedYear)}>${m(ctx.realizedYear, { sign: true })} ${arrow(ctx.realizedYear)} ›</span></a>
        <div className="sm">총자산 = 종목 ${m(sum.holdingsKrw)} + 현금 ${m(sum.cashKrw)}. 손익·수익률은 종목 기준${sum.noPrice ? ` · 시세 없는 종목 ${sum.noPrice}개는 매입가로 평가` : ''}</div>
      </section>

      <a className="sec" href="#/cash" aria-label="현금">
        <h2>현금 <${Icon} name="right" className="chev" /></h2>
        <div className="row"><span className="m">원화</span><span className="v">${won(sum.cashKRW)}</span></div>
        <div className="row"><span className="m">달러</span><span className="v">${usd(sum.cashUSD)}</span></div>
        <div className="sm">환율 ${fxRate ? fxf(fxRate) + '원' : '없음'}${ctx.fx?.asOf ? ` · ${when(ctx.fx.asOf)} ${ctx.fx.source === 'google' ? '자동' : '입력'}` : ''}</div>
      </a>

      <a className="sec" href="#/alloc" aria-label="자산 구성">
        <h2>자산 구성 <${Icon} name="right" className="chev" /></h2>
        <div className="stack" aria-hidden="true">${sum.cats.filter((c) => c.value > 0).map((c) => html`<span key=${c.id} style=${{ width: c.pct + '%', background: c.color }} />`)}</div>
        ${sum.cats.filter((c) => c.value > 0).map((c) => html`<div key=${c.id} className="row"><span><i className="sw" style=${{ background: c.color }} />${c.label}</span><span className="v">${pct(c.pct, 1, { sign: false })}</span></div>`)}
        ${fxRate && html`<div className="sm">원화 자산 ${pct(sum.byCurrency[0].pct, 1, { sign: false })} · 달러 자산 ${pct(sum.byCurrency[1].pct, 1, { sign: false })}</div>`}
      </a>

      <section className="sec" aria-label="원금 대비 평가액">
        <h2>원금 vs 평가액 <span className="sm">현금 제외</span></h2>
        <div className="cmpbar"><span className="m">원금</span><div className="b" style=${{ width: (sum.costKrw / maxBar) * 100 + '%' }} /><span className="num">${m(sum.costKrw)}</span></div>
        <div className="cmpbar"><span className="m">평가</span><div className="b v" style=${{ width: (sum.holdingsKrw / maxBar) * 100 + '%' }} /><span className="num">${m(sum.holdingsKrw)}</span></div>
      </section>

      <section className="sec" aria-label="계좌별">
        <h2>계좌별</h2>
        ${sum.byAccount.map((a) => html`<a key=${a.acc.id} className="li" href=${'#/holdings?acc=' + a.acc.id}>
          <div className="l"><div className="nm">${a.acc.name}</div><div className="sm">종목 ${a.count}개 · 비중 ${pct(a.pct, 1, { sign: false })}</div></div>
          <div className="r">${money(a.totalBase, a.acc.baseCurrency)}
            ${a.ret != null && html`<small className=${cls(a.ret)}>${pct(a.ret)} ${arrow(a.ret)}</small>`}</div>
        </a>`)}
      </section>
    </div>`;
}

export function Alloc({ ctx }) {
  const { sum } = ctx;
  const [view, setView] = useState('cat');
  return html`
    <${TopBar} title="자산 구성" back="#/" />
    <div className="body">
      <div style=${{ padding: '0 16px' }}><${Seg} label="보기" value=${view} onChange=${setView} options=${[['cat', '분류'], ['acc', '계좌'], ['cur', '통화']]} /></div>
      <section className="sec">
        <div className="stack" aria-hidden="true">
          ${view === 'cat' && sum.cats.filter((c) => c.value > 0).map((c) => html`<span key=${c.id} style=${{ width: c.pct + '%', background: c.color }} />`)}
          ${view === 'acc' && sum.byAccount.map((a, i) => html`<span key=${a.acc.id} style=${{ width: (a.pct || 0) + '%', background: `var(--c${(i % 5) + 1})` }} />`)}
          ${view === 'cur' && sum.byCurrency.map((c, i) => html`<span key=${c.id} style=${{ width: (c.pct || 0) + '%', background: i ? 'var(--c2)' : 'var(--c1)' }} />`)}
        </div>
        ${view === 'cat' && sum.cats.filter((c) => c.value > 0).map((c) => c.items.length ? html`
          <details key=${c.id} className="cat">
            <summary><span><i className="sw" style=${{ background: c.color }} />${c.label}</span><span className="num">${won(c.value)} · ${pct(c.pct, 1, { sign: false })} <${Icon} name="down" className="chev" /></span></summary>
            <div className="sub">
              ${c.items.map((it) => html`<div key=${it.h.id}>
                <div className="row"><span className="nm" style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${hname(it.h)}</span><span className="v">${pct(it.inCat, 1, { sign: false })} <span className="sm">· 전체 ${pct(it.ofTotal, 1, { sign: false })}</span></span></div>
                <div className="pbar" aria-hidden="true"><i style=${{ width: it.inCat + '%', background: c.color }} /></div>
              </div>`)}
            </div>
          </details>` : html`<div key=${c.id} className="row" style=${{ padding: '12px 0', borderTop: '1px solid var(--line)' }}><span style=${{ fontWeight: 600 }}><i className="sw" style=${{ background: c.color }} />${c.label}</span><span className="v">${won(c.value)} · ${pct(c.pct, 1, { sign: false })}</span></div>`)}
        ${view === 'cat' && html`<div className="sm">분류를 누르면 그 안의 종목별 비중(분류 안 % · 전체 대비 %)이 보여요.</div>`}
        ${view === 'acc' && sum.byAccount.map((a, i) => html`<div key=${a.acc.id} className="row" style=${{ padding: '8px 0' }}><span><i className="sw" style=${{ background: `var(--c${(i % 5) + 1})` }} />${a.acc.name}</span><span className="v">${won(a.totalKrw)} · ${pct(a.pct, 1, { sign: false })}</span></div>`)}
        ${view === 'cur' && sum.byCurrency.map((c, i) => html`<div key=${c.id} className="row" style=${{ padding: '8px 0' }}><span><i className="sw" style=${{ background: i ? 'var(--c2)' : 'var(--c1)' }} />${c.label}</span><span className="v">${won(c.value)} · ${pct(c.pct, 1, { sign: false })}</span></div>`)}
      </section>
    </div>`;
}
