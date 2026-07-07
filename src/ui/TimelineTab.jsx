import { useState, useEffect, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea, ResponsiveContainer } from "recharts";
import { C, SERIF, MONO } from "../theme.js";
import { numOf, rangeOf, fmtDate } from "../core/utils.js";
import { Empty, inputStyle } from "./primitives.jsx";
import { RecordCard } from "./RecordCard.jsx";

/* ---------- M2 · 病程时间轴 ---------- */
function TrendChart({ records }) {
  const indicators = useMemo(() => {
    const m = new Map();
    for (const r of records) for (const l of r.labs || []) {
      if (numOf(l.v) === null || !r.eventStart) continue;
      m.set(l.n, (m.get(l.n) || 0) + 1);
    }
    return [...m.entries()].filter(([, c]) => c >= 2).map(([n]) => n).sort();
  }, [records]);
  const [sel, setSel] = useState("");
  useEffect(() => { if (indicators.length && !indicators.includes(sel)) setSel(indicators[0]); }, [indicators, sel]);

  const { data, band, unit } = useMemo(() => {
    const pts = []; let band = null; let unit = "";
    for (const r of [...records].sort((a, b) => (a.eventStart || "").localeCompare(b.eventStart || ""))) {
      for (const l of r.labs || []) if (l.n === sel) {
        const v = numOf(l.v);
        if (v === null) continue;
        pts.push({ d: fmtDate(r.eventStart), v, ab: l.ab });
        const rg = rangeOf(l.r); if (rg) band = rg;
        if (l.u) unit = l.u;
      }
    }
    return { data: pts, band, unit };
  }, [records, sel]);

  if (!indicators.length) {
    return (
      <div className="text-sm px-3 py-5 text-center rounded-sm mt-4" style={{ color: C.inkSoft, border: `1.5px dashed ${C.line}`, background: C.card }}>
        同一项检验指标出现两次以上后，这里会自动生成趋势图，帮你看清变化方向。
      </div>
    );
  }
  return (
    <div className="rounded-sm p-4 mt-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span style={{ fontFamily: SERIF, color: C.ink }}>指标趋势</span>
        <select className="px-2.5 py-1.5 text-sm rounded-sm bg-white" style={inputStyle} value={sel} onChange={(e) => setSel(e.target.value)}>
          {indicators.map((n) => <option key={n}>{n}</option>)}
        </select>
        {unit && <span className="text-xs" style={{ color: C.inkSoft, fontFamily: MONO }}>{unit}</span>}
        {band && <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: C.ok, background: "#EDF3EE" }}>参考 {band[0]}–{band[1]}（绿色区间）</span>}
      </div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke={C.lineSoft} />
            <XAxis dataKey="d" tick={{ fontSize: 11, fill: C.inkSoft }} />
            <YAxis tick={{ fontSize: 11, fill: C.inkSoft, fontFamily: MONO }} domain={["auto", "auto"]} />
            <Tooltip contentStyle={{ fontSize: 12, border: `1px solid ${C.line}` }} formatter={(v) => [v + (unit ? " " + unit : ""), sel]} />
            {band && <ReferenceArea y1={band[0]} y2={band[1]} fill={C.ok} fillOpacity={0.08} />}
            <Line dataKey="v" stroke={C.ink} strokeWidth={1.6}
              dot={({ cx, cy, payload, index }) => (
                <circle key={index} cx={cx} cy={cy} r={3.5}
                  fill={payload.ab === "↑" ? C.seal : payload.ab === "↓" ? C.low : C.ink} />
              )} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="text-xs mt-1" style={{ color: C.inkSoft }}>红点为偏高、蓝点为偏低的记录值；数值以你入档时核对的为准。</div>
    </div>
  );
}

function monthsBetween(a, b) { return (b - a) / (1000 * 60 * 60 * 24 * 30.44); }
function TimelineTab({ records, onDelete, goUpload }) {
  const [selId, setSelId] = useState(null);
  const dated = useMemo(
    () => records.filter((r) => r.eventStart).sort((a, b) => a.eventStart.localeCompare(b.eventStart)),
    [records]);
  const lanes = useMemo(() => {
    const m = new Map(); const other = [];
    for (const r of dated) {
      if ((r.dx || []).length) for (const d of r.dx) { if (!m.has(d)) m.set(d, []); m.get(d).push(r); }
      else other.push(r);
    }
    const arr = [...m.entries()];
    if (other.length) arr.push(["未归入病程", other]);
    return arr;
  }, [dated]);

  if (!records.length) return <Empty text="档案里还没有记录。添加第一份病历后，病程会在这里按时间铺开。" actionText="去上传病历" onAction={goUpload} />;
  if (!dated.length) return <Empty text="现有记录缺少业务发生时间，补充时间后才能排进时间轴。" />;

  const t0 = new Date(dated[0].eventStart).getTime();
  const t1 = new Date(dated[dated.length - 1].eventStart).getTime();
  const PXM = 56, PAD = 44;
  const plotW = Math.max(360, Math.round(monthsBetween(t0, t1) * PXM) + PAD * 2);
  const x = (iso) => PAD + monthsBetween(t0, new Date(iso).getTime()) * PXM;
  const ticks = [];
  for (let y = new Date(t0).getFullYear(); y <= new Date(t1).getFullYear() + 1; y++) {
    const px = PAD + monthsBetween(t0, new Date(y, 0, 1).getTime()) * PXM;
    if (px > 8 && px < plotW - 8) ticks.push({ y, px });
  }
  const sel = records.find((r) => r.recordId === selId);
  const undated = records.length - dated.length;
  const dotBase = { border: "2px solid #fff", boxShadow: `0 0 0 1px ${C.line}` };

  return (
    <div>
      <div className="flex rounded-sm" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <div className="shrink-0 w-24 sm:w-28" style={{ borderRight: `1px solid ${C.lineSoft}` }}>
          <div className="h-8 flex items-end px-2 pb-1 text-xs" style={{ color: C.inkSoft }}>病程</div>
          {lanes.map(([d, recs]) => (
            <div key={d} className="h-14 flex flex-col justify-center px-2">
              <span className="text-xs truncate" style={{ fontFamily: SERIF, color: C.ink }}>{d}</span>
              <span className="text-xs" style={{ color: C.inkSoft, fontFamily: MONO }}>{recs.length} 条</span>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto flex-1">
          <div className="relative" style={{ width: plotW }}>
            <div className="h-8 relative" style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
              {ticks.map((tk) => (
                <span key={tk.y} className="absolute text-xs" style={{ left: tk.px + 4, top: 9, color: C.inkSoft, fontFamily: MONO }}>{tk.y}</span>
              ))}
            </div>
            {lanes.map(([d, recs]) => {
              let lastX = -999, flip = false;
              return (
                <div key={d} className="h-14 relative">
                  <div className="absolute left-0 right-0" style={{ top: "50%", borderTop: `1.5px solid ${C.lineSoft}` }} />
                  {ticks.map((tk) => (
                    <span key={tk.y} className="absolute top-0 bottom-0" style={{ left: tk.px, borderLeft: `1px dashed ${C.lineSoft}` }} />
                  ))}
                  {recs.map((r) => {
                    const px = x(r.eventStart);
                    const near = px - lastX < 16;
                    flip = near ? !flip : false;
                    lastX = px;
                    const abn = (r.labs || []).some((l) => l.ab);
                    const hosp = r.recordType === "住院记录";
                    const isSel = selId === r.recordId;
                    return (
                      <button key={r.recordId}
                        title={`${fmtDate(r.eventStart)} · ${r.recordTitle}`}
                        aria-label={`${fmtDate(r.eventStart)} ${r.recordTitle}`}
                        onClick={() => setSelId(isSel ? null : r.recordId)}
                        className={hosp ? "absolute rounded-sm" : "absolute rounded-full"}
                        style={{
                          width: 13, height: 13, left: px - 6.5,
                          top: near && flip ? "28%" : "50%", transform: "translateY(-50%)",
                          background: abn ? C.seal : C.ink,
                          ...dotBase,
                          ...(isSel ? { boxShadow: `0 0 0 2.5px ${C.seal}` } : {}),
                        }} />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs items-center" style={{ color: C.inkSoft }}>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full inline-block" style={{ background: C.ink, ...dotBase }} />常规记录</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full inline-block" style={{ background: C.seal, ...dotBase }} />含异常指标</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: C.ink, ...dotBase }} />住院/手术</span>
        <span>点击标记查看该次记录{undated > 0 ? `（另有 ${undated} 条无时间记录未列入）` : ""}</span>
      </div>
      {sel && <div className="mt-3"><RecordCard key={sel.recordId} rec={sel} onDelete={onDelete} defaultOpen /></div>}
      <TrendChart records={records} />
    </div>
  );
}

export { TimelineTab };
