// 차트(SVG 직접 그림, 설계서 §4.5.9). 격자·y축 없음, 빈 날은 선을 끊고 보간하지 않는다.
// 금액 문자열은 반드시 format.js(money)를 거친다(가리기 적용).
import { html, useState, useEffect, useRef } from './react.js';
import { dayDiff, mdLabel } from './period.js';

// points: [{date:'YYYY-MM-DD', value:number|null, dim?:bool}] (날짜순)
// → {segs:[[{x,y,i}]], dots:[{x,y,i,dim}], xs:[x|null]} (좌표는 w×h 안, pad 여백)
export function layout(points, w, h, pad = 8) {
  const vals = points.map((p) => p.value).filter((v) => v != null && isFinite(v));
  if (!points.length || !vals.length) return { segs: [], dots: [], xs: [], y0: null };
  const d0 = points[0].date, span = Math.max(1, dayDiff(d0, points[points.length - 1].date));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const X = (d) => pad + (dayDiff(d0, d) / span) * (w - pad * 2);
  const Y = (v) => pad + (1 - (v - lo) / (hi - lo)) * (h - pad * 2);
  const segs = [], dots = [], xs = [];
  let cur = null, prevDate = null;
  points.forEach((p, i) => {
    const ok = p.value != null && isFinite(p.value);
    xs.push(ok ? X(p.date) : null);
    if (!ok) { cur = null; prevDate = null; return; }
    const pt = { x: X(p.date), y: Y(p.value), i };
    // 하루 넘게 비면 끊는다
    if (!cur || (prevDate && dayDiff(prevDate, p.date) > 1)) { cur = []; segs.push(cur); }
    cur.push(pt); prevDate = p.date;
    if (p.dim) dots.push({ ...pt, dim: true });
  });
  const first = points.find((p) => p.value != null && isFinite(p.value));
  return { segs, dots, xs, y0: Y(first.value) };
}

const pathOf = (seg) => seg.map((p, k) => `${k ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('');

// 선 색: 기간 시작 대비 오르면 up, 내리면 down
export function trend(points) {
  const v = points.filter((p) => p.value != null && isFinite(p.value));
  if (v.length < 2) return 'flat';
  const d = v[v.length - 1].value - v[0].value;
  return d > 0 ? 'up' : d < 0 ? 'dn' : 'flat';
}

function useWidth(ref, fallback) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const f = () => { const cw = el.clientWidth; if (cw > 0) setW(cw); };
    f();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(f); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return w;
}

// 라인 차트. onScrub(인덱스 | null). label = 접근성 문장(금액은 호출 측에서 money()로 만든다)
export function LineChart({ points, height = 160, label, onScrub, showDates = true }) {
  const box = useRef();
  const w = useWidth(box, 360);
  const [idx, setIdx] = useState(null);
  const L = layout(points, w, height, 10);
  const tone = trend(points);
  const valid = L.xs.map((x, i) => (x == null ? null : i)).filter((i) => i != null);

  const pick = (clientX) => {
    const r = box.current.getBoundingClientRect(), x = clientX - r.left;
    let best = null, bd = Infinity;
    for (const i of valid) { const d = Math.abs(L.xs[i] - x); if (d < bd) { bd = d; best = i; } }
    return best;
  };
  const set = (i) => { setIdx(i); onScrub?.(i); };
  const down = (e) => { if (!valid.length) return; e.currentTarget.setPointerCapture?.(e.pointerId); set(pick(e.clientX)); };
  const move = (e) => { if (idx != null) { const i = pick(e.clientX); if (i !== idx) set(i); } };
  const up = () => { if (idx != null) set(null); };
  const key = (e) => {
    if (!valid.length) return;
    const k = idx == null ? valid.length : valid.indexOf(idx);
    if (e.key === 'ArrowLeft') { e.preventDefault(); set(valid[Math.max(0, k - 1)]); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); set(valid[Math.min(valid.length - 1, k + 1)]); }
    else if (e.key === 'Escape') set(null);
  };

  const sp = idx != null ? L.segs.flat().find((p) => p.i === idx) : null;
  const tipLeft = sp ? Math.min(Math.max(sp.x, 40), w - 40) : 0;
  const first = points.find((p) => p.value != null), last = [...points].reverse().find((p) => p.value != null);
  return html`<div className=${'lc ' + tone} ref=${box}>
    <svg className="lc-svg" width=${w} height=${height} viewBox=${`0 0 ${w} ${height}`} role="img" aria-label=${label}
      tabIndex="0" onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up} onKeyDown=${key} onBlur=${up}>
      ${L.y0 != null && html`<line className="lc-base" x1="0" x2=${w} y1=${L.y0} y2=${L.y0} />`}
      ${L.segs.map((s, k) => (s.length > 1
        ? html`<path key=${'s' + k} className="lc-line" d=${pathOf(s)} />`
        : html`<circle key=${'s' + k} className="lc-solo" cx=${s[0].x} cy=${s[0].y} r="2.5" />`))}
      ${L.dots.map((d) => html`<circle key=${'d' + d.i} className="lc-dim" cx=${d.x} cy=${d.y} r="3" />`)}
      ${sp && html`<line className="lc-guide" x1=${sp.x} x2=${sp.x} y1="0" y2=${height} />`}
      ${sp && html`<circle className="lc-dot" cx=${sp.x} cy=${sp.y} r="6" />`}
    </svg>
    ${sp && html`<div className="lc-tip" style=${{ left: tipLeft + 'px' }}>${mdLabel(points[idx].date)}${points[idx].dim ? html`<span className="lc-cap">이날은 시세나 환율이 빠져 있어요</span>` : null}</div>`}
    ${showDates && first && last && first !== last && html`<div className="lc-dates" aria-hidden="true"><span>${mdLabel(first.date)}</span><span>${mdLabel(last.date)}</span></div>`}
  </div>`;
}

// 스파크라인 56×24. 같은 배치 함수(축·스크럽 없음)
export function Spark({ points, width = 56, height = 24, label }) {
  const L = layout(points, width, height, 2);
  const n = points.filter((p) => p.value != null && isFinite(p.value)).length;
  if (n < 2) return html`<span className="spark none" style=${{ width: width + 'px', height: height + 'px' }} aria-hidden="true" />`;
  return html`<svg className=${'spark ' + trend(points)} width=${width} height=${height} viewBox=${`0 0 ${width} ${height}`} role="img" aria-label=${label}>
    ${L.segs.map((s, k) => (s.length > 1 ? html`<path key=${k} d=${pathOf(s)} />` : html`<circle key=${k} cx=${s[0].x} cy=${s[0].y} r="1.5" />`))}
  </svg>`;
}

// ---------- 막대 차트(M5 배당 12개월, M6 연 보기) ----------
// values: [number|null] (null = 미래 달, 흐린 빈 칸). 음수는 기준선 아래.
// 배치: {zero: 기준선 y(px), bars:[{top, h, neg, empty}]}. 0이 아닌 값은 최소 2px로 보이게
export function barLayout(values, height) {
  const nums = values.map((v) => (v == null || !isFinite(v) ? 0 : v));
  const hi = Math.max(0, ...nums), lo = Math.min(0, ...nums);
  const span = hi - lo || 1;
  const zero = hi === 0 && lo === 0 ? height : (hi / span) * height;
  const bars = values.map((v) => {
    if (v == null || !isFinite(v)) return { top: 0, h: 0, neg: false, empty: true };
    let h = (Math.abs(v) / span) * height;
    if (v !== 0 && h < 2) h = 2;
    return v >= 0 ? { top: zero - h, h, neg: false, empty: false } : { top: zero, h, neg: true, empty: false };
  });
  return { zero, bars };
}

// tone 'select': 선택 막대 --accent, 나머지 --bar-idle, 음수 --down / 'pl': 양수 --up, 음수 --down
// barLabel(i) = 접근성 문장(금액은 호출 측에서 money()로 만들어 가리기 적용)
export function BarChart({ values, labels, selected = null, onSelect, height = 120, tone = 'select', label, barLabel }) {
  const L = barLayout(values, height);
  const hasNeg = L.bars.some((b) => b.neg);
  return html`<div className=${'bc ' + tone} role="group" aria-label=${label}>
    <div className="bc-plot" style=${{ height: height + 'px' }}>
      ${(hasNeg || tone === 'pl') && html`<i className="bc-zero" style=${{ top: L.zero + 'px' }} aria-hidden="true" />`}
      ${L.bars.map((b, i) => html`<button key=${i} type="button" className=${'bc-col' + (i === selected ? ' on' : '') + (b.empty ? ' future' : '')}
        disabled=${b.empty} aria-pressed=${onSelect ? i === selected : undefined} aria-label=${barLabel ? barLabel(i) : labels[i]}
        onClick=${() => onSelect?.(i)}>
        ${b.empty ? html`<i className="bc-bar bc-void" style=${{ top: Math.max(0, L.zero - 12) + 'px', height: '12px' }} />`
          : html`<i className=${'bc-bar' + (b.neg ? ' neg' : '')} style=${{ top: b.top + 'px', height: b.h + 'px' }} />`}
      </button>`)}
    </div>
    <div className="bc-x" aria-hidden="true">${labels.map((t, i) => html`<span key=${i} className=${i === selected ? 'on' : ''}>${t}</span>`)}</div>
  </div>`;
}
