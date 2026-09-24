// 처음 시작하기 4단계: 계좌 → 종목 → 현금 → 시세 연결·현재가
import { html, useEffect, useState } from '../react.js';
import { TopBar, Icon, toast, go } from '../components.js';
import { saveSettings } from '../store.js';
import { refreshQuotes, explain } from '../google.js';
import { AccountForm, ConnectForm } from './settings.js';
import { HoldingForm } from './holdings.js';
import { useCashForm, PriceForm } from './money.js';

export function Welcome({ ctx }) {
  const resume = ctx.accounts.length && !ctx.settings.onboarded;
  const last = ctx.settings.onboardAccountId && ctx.accById[ctx.settings.onboardAccountId];
  return html`<div className="welcome">
    <div className="logo"><${Icon} name="chart" /></div>
    <h1>내 포트폴리오</h1>
    <p className="hint">증권사 앱의 잔고 화면을 옆에 띄워 두고, 보이는 숫자를 그대로 옮겨 적으면 돼요. 계좌 하나에 5분쯤 걸려요.</p>
    <ol className="hint" style=${{ margin: 0, paddingLeft: '20px', display: 'grid', gap: '4px' }}>
      <li>계좌 만들기 (증권사·수수료)</li><li>보유 종목 넣기 (수량·평균 매수가)</li><li>현금 넣기</li><li>구글 자동 시세 연결 또는 현재가 입력</li>
    </ol>
    ${resume && last ? html`<a className="btn" href=${'#/start/holdings/' + last.id}>이어서 입력하기 (${last.name})</a>` : null}
    <a className=${'btn' + (resume ? ' sec2' : '')} href="#/start/account">${ctx.accounts.length ? '계좌 더 추가하기' : '계좌부터 시작하기'}</a>
    <a className="link2" href="#/backup">백업으로 복원하기</a>
    ${resume ? html`<button className="link2" type="button" onClick=${async () => { await saveSettings({ onboarded: true }); go('#/'); }}>나중에 하고 홈으로</button>` : ctx.accounts.length ? html`<a className="link2" href="#/">홈으로</a>` : null}
    <p className="sm">데이터는 이 폰에만 저장돼요. 구글 연결 시 내 구글 계정에 자동 백업돼요.</p>
  </div>`;
}

export function StartAccount({ ctx }) {
  return html`<${TopBar} title="계좌 만들기" back="#/start" step="1/4" />
    <${AccountForm} ctx=${ctx} onboarding=${true} onSaved=${async (acc) => {
      await saveSettings({ onboardAccountId: acc.id });
      go(acc.type === 'BANK' ? '#/start/cash/' + acc.id : '#/start/holdings/' + acc.id);
    }} />`;
}

export function StartHoldings({ ctx, params }) {
  const acc = ctx.accById[params.acc];
  if (!acc) return html`<${TopBar} title="종목 넣기" back="#/start" /><p className="hint pad">계좌를 찾을 수 없어요.</p>`;
  return html`<${TopBar} title="종목 넣기" back="#/start" step="2/4" />
    <${HoldingForm} ctx=${ctx} onboarding=${{ accId: acc.id, finish: () => go('#/start/cash/' + acc.id) }} />`;
}

export function StartCash({ ctx, params }) {
  const acc = ctx.accById[params.acc];
  const { saveAll, ui } = useCashForm({ ctx, accountIds: [params.acc] });
  if (!acc) return html`<${TopBar} title="현금 넣기" back="#/start" />`;
  const next = async (to) => { if (await saveAll()) go(to); };
  return html`<${TopBar} title="현금 넣기" back=${acc.type === 'BANK' ? '#/start/account' : '#/start/holdings/' + acc.id} step="3/4" />
    <div className="body">
      ${ui}
      <div className="actions">
        <button className="btn" type="button" onClick=${() => next(ctx.connected ? '#/start/prices' : '#/start/connect')}>다음: ${ctx.connected ? '현재가·환율' : '시세 연결'}</button>
        <button className="link2" type="button" onClick=${() => next('#/start/account')}>다른 계좌 추가하기</button>
      </div>
    </div>`;
}

export function StartConnect({ ctx }) {
  return html`<${TopBar} title="구글 자동 시세" back="#/start" step="4/4" />
    <${ConnectForm} ctx=${ctx} onboarding=${true} onDone=${() => go('#/start/prices')} />`;
}

export function StartPrices({ ctx }) {
  const [done, setDone] = useState(!ctx.connected);
  useEffect(() => {
    if (!ctx.connected) return;
    refreshQuotes().catch((e) => toast(explain(e), { type: 'error' })).finally(() => setDone(true));
  }, []);
  const finish = async () => { await saveSettings({ onboarded: true }); go('#/'); };
  return html`<${TopBar} title="현재가 · 환율" back="#/start" step="4/4" />
    ${!done ? html`<p className="hint pad">구글에서 시세를 받는 중이에요…</p>`
      : html`<${PriceForm} key=${'pf' + ctx.pricesAt} ctx=${ctx} onboarding=${true} onDone=${finish} />`}`;
}
