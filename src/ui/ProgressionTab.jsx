import React, { useState, useEffect, useMemo } from "react";
import { ArrowRight, Bookmark } from "lucide-react";
import { C, SERIF, MONO } from "../theme.js";
import { numOf, fmtDate } from "../core/utils.js";
import { tplOf } from "../core/templates.js";
import { storGetJson, storSetJson, loadKb } from "../adapters/storage.js";
import { Chip, Empty, SectionLabel, Spinner } from "./primitives.jsx";
import { RecordCard } from "./RecordCard.jsx";
import { KbSourceBadge } from "./ShareTab.jsx";

/* ---------- M3 · 疾病演进路径 ---------- */
const STAGE_COLORS = { "首次诊断": "#B3372B", "门诊诊疗": "#21374D", "住院/手术": "#6B5B8E", "随访监测": "#2E6E8E", "检查评估": "#7A8B6F", "治疗用药": "#3E5C76", "健康筛查": "#8A8578", "记录": "#8A8578" };
function monthsSince(iso) { return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (86400000 * 30.44))); }
function KbMini({ item, adopted, onAdopt }) {
  return (
    <div className="rounded-sm px-3 py-2.5 mb-2 flex items-start gap-2" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <KbSourceBadge sourceType={item.sourceType} />
          <span className="text-sm font-medium" style={{ fontFamily: SERIF, color: C.ink }}>{item.title}</span>
        </div>
        <div className="text-xs mt-1" style={{ color: C.inkSoft }}>{(item.content || "").slice(0, 90)}{(item.content || "").length > 90 ? "…" : ""}</div>
        {item.sourceRef && <div className="text-xs mt-0.5" style={{ color: C.ok }}>出处：{item.sourceRef}</div>}
      </div>
      <button className="shrink-0 inline-flex items-center gap-1 text-xs px-2 py-1 rounded-sm"
        style={adopted ? { background: C.ink, color: "#fff" } : { color: C.inkSoft, border: `1px solid ${C.line}` }}
        onClick={onAdopt}>
        <Bookmark size={11} />{adopted ? "已采纳" : "采纳"}
      </button>
    </div>
  );
}
function ProgressionTab({ records, onDelete, showToast, goShare, goUpload, shareEnabled }) {
  const diseases = useMemo(() => {
    const first = new Map();
    for (const r of records) for (const d of r.dx || []) {
      const t = r.eventStart || "9999";
      if (!first.has(d) || t < first.get(d)) first.set(d, t);
    }
    return [...first.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([d]) => d);
  }, [records]);
  const [sel, setSel] = useState("");
  useEffect(() => { if (diseases.length && !diseases.includes(sel)) setSel(diseases[0]); }, [diseases, sel]);
  const [openId, setOpenId] = useState(null);
  const [kb, setKb] = useState(null);
  const [adopted, setAdopted] = useState({});
  useEffect(() => {
    if (!shareEnabled) { setKb([]); return; }
    (async () => {
      setAdopted((await storGetJson("kb-adopted")) || {});
      setKb(await loadKb());
    })();
  }, [shareEnabled]);

  const events = useMemo(() => {
    const evs = records
      .filter((r) => (r.dx || []).includes(sel) || (r.tags || []).includes(sel))
      .filter((r) => r.eventStart)
      .sort((a, b) => a.eventStart.localeCompare(b.eventStart));
    return evs.map((r, i) => ({
      r,
      stage: i === 0 && (r.recordType === "门诊记录" || r.recordType === "住院记录")
        ? "首次诊断" : (tplOf(r.recordType).stage || "记录"),
    }));
  }, [records, sel]);

  const summary = useMemo(() => {
    if (!events.length) return null;
    const lastRxEv = [...events].reverse().find((e) => (e.r.rx || []).length);
    const series = new Map();
    for (const e of events) for (const l of e.r.labs || []) {
      const v = numOf(l.v); if (v === null) continue;
      if (!series.has(l.n)) series.set(l.n, []);
      series.get(l.n).push({ v: l.v, num: v, ab: l.ab, u: l.u });
    }
    const inds = [...series.entries()]
      .filter(([, s]) => s.length >= 2 || s.some((p) => p.ab))
      .map(([n, s]) => ({ n, first: s[0], prev: s.length > 1 ? s[s.length - 2] : null, last: s[s.length - 1] }));
    const lastEvent = events[events.length - 1].r;
    return { lastRxEv, inds, lastEvent, gapMonths: monthsSince(lastEvent.eventStart) };
  }, [events]);

  const related = useMemo(() => {
    if (!kb) return null;
    return kb.filter((i) => (i.diseases || []).includes(sel))
      .sort((a, b) => (a.sourceType === b.sourceType
        ? (b.helpful || 0) - (a.helpful || 0)
        : a.sourceType === "指南/权威资料" ? -1 : 1))
      .slice(0, 4);
  }, [kb, sel]);

  const adoptToggle = async (item) => {
    const na = { ...adopted };
    if (na[item.id]) delete na[item.id];
    else na[item.id] = { title: item.title, category: item.category, diseases: item.diseases };
    setAdopted(na); await storSetJson("kb-adopted", na);
    showToast(na[item.id] ? "已采纳到我的参考" : "已取消采纳");
  };

  if (!diseases.length) return <Empty text="记录里出现诊断后，这里会按疾病梳理出发现、诊疗、随访的演进路径。" actionText="去上传病历" onAction={goUpload} />;
  const arrowDir = (last, prev) => !prev ? "" : last.num > prev.num ? " ↑较上次" : last.num < prev.num ? " ↓较上次" : " 与上次持平";

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {diseases.map((d) => <Chip key={d} active={sel === d} onClick={() => { setSel(d); setOpenId(null); }}>{d}</Chip>)}
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex items-stretch" style={{ minWidth: "min-content" }}>
          {events.map((e, i) => {
            const abn = (e.r.labs || []).filter((l) => l.ab).length;
            const active = openId === e.r.recordId;
            return (
              <React.Fragment key={e.r.recordId}>
                {i > 0 && <div className="flex items-center px-0.5 shrink-0"><ArrowRight size={14} color={C.inkSoft} /></div>}
                <button onClick={() => setOpenId(active ? null : e.r.recordId)}
                  className="text-left rounded-sm px-3 py-2.5 w-40 shrink-0 transition-colors"
                  style={{ background: C.card, border: `1.5px solid ${active ? (STAGE_COLORS[e.stage] || C.ink) : C.line}` }}>
                  <span className="inline-block text-xs px-1.5 py-0.5 rounded-sm mb-1 text-white" style={{ background: STAGE_COLORS[e.stage] || C.ink }}>{e.stage}</span>
                  <div className="text-xs" style={{ fontFamily: MONO, color: C.inkSoft }}>{fmtDate(e.r.eventStart)}</div>
                  <div className="text-xs mt-0.5 leading-snug" style={{ color: C.ink }}>{e.r.recordTitle}</div>
                  {abn > 0 && <div className="text-xs mt-0.5" style={{ color: C.seal }}>{abn} 项指标异常</div>}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
      {openId && (() => {
        const r = records.find((x) => x.recordId === openId);
        return r ? <div className="mt-2"><RecordCard key={r.recordId} rec={r} onDelete={onDelete} defaultOpen /></div> : null;
      })()}

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <div className="rounded-sm px-3 py-2.5" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <div className="text-xs mb-1" style={{ color: C.inkSoft }}>在用方案（档案最近一次）</div>
            {summary.lastRxEv ? (
              <>
                {summary.lastRxEv.r.rx.map((m, i) => <div key={i} className="text-sm" style={{ color: C.ink }}>{m.n}{m.d ? <span className="text-xs" style={{ color: C.inkSoft }}>（{m.d}）</span> : null}</div>)}
                <div className="text-xs mt-1" style={{ fontFamily: MONO, color: C.inkSoft }}>{fmtDate(summary.lastRxEv.r.eventStart)}</div>
              </>
            ) : <div className="text-sm" style={{ color: C.inkSoft }}>档案中暂无用药记录</div>}
          </div>
          <div className="rounded-sm px-3 py-2.5" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <div className="text-xs mb-1" style={{ color: C.inkSoft }}>关键指标（最近值）</div>
            {summary.inds.length ? summary.inds.slice(0, 3).map((it) => (
              <div key={it.n} className="text-sm" style={{ color: C.ink }}>
                {it.n} <span style={{ fontFamily: MONO, fontWeight: 600, color: it.last.ab === "↑" ? C.seal : it.last.ab === "↓" ? C.low : C.ok }}>{it.last.v}{it.last.u}</span>
                <span className="text-xs" style={{ color: C.inkSoft }}>{arrowDir(it.last, it.prev)}</span>
              </div>
            )) : <div className="text-sm" style={{ color: C.inkSoft }}>暂无可比对的指标</div>}
          </div>
          <div className="rounded-sm px-3 py-2.5" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <div className="text-xs mb-1" style={{ color: C.inkSoft }}>随访节奏</div>
            <div className="text-sm" style={{ color: C.ink }}>最近记录 {fmtDate(summary.lastEvent.eventStart)}</div>
            <div className="text-sm" style={{ color: summary.gapMonths >= 6 ? C.seal : C.ink }}>距今约 {summary.gapMonths} 个月</div>
          </div>
        </div>
      )}

      {summary && (
        <div className="rounded-sm px-4 py-3 mt-3" style={{ background: "#EFF3EE" }}>
          <div className="text-xs font-medium mb-1.5" style={{ color: C.ink }}>把档案变成可沟通的信息（就诊时可参考，非医疗建议）</div>
          {summary.inds.slice(0, 3).map((it) => (
            <div key={it.n} className="text-xs mb-0.5" style={{ color: C.inkSoft }}>
              {it.n}：首次 {it.first.v}{it.first.u} → 最近 {it.last.v}{it.last.u}{it.last.ab ? `（仍${it.last.ab === "↑" ? "偏高" : "偏低"}）` : "（在参考范围内）"}
            </div>
          ))}
          {summary.gapMonths >= 6 && <div className="text-xs mb-0.5" style={{ color: C.inkSoft }}>距最近一条相关记录已超过半年，可核对与医生约定的随访安排。</div>}
          <div className="text-xs" style={{ color: C.inkSoft }}>复诊时可携带上面的在用方案与指标变化，帮助医生快速了解病程。</div>
        </div>
      )}

      {shareEnabled && (<>
      <SectionLabel>病友与指南参考</SectionLabel>
      {related === null ? (
        <div className="text-sm py-4 text-center" style={{ color: C.inkSoft }}><Spinner /> <span className="ml-2">正在匹配相关分享…</span></div>
      ) : related.length ? (
        <>
          {related.map((i) => <KbMini key={i.id} item={i} adopted={!!adopted[i.id]} onAdopt={() => adoptToggle(i)} />)}
          <button className="text-xs underline mt-1" style={{ color: C.inkSoft }} onClick={() => goShare(sel)}>查看更多「{sel}」相关分享 →</button>
        </>
      ) : (
        <div className="text-xs py-3" style={{ color: C.inkSoft }}>
          还没有与「{sel}」相关的分享。<button className="underline" onClick={() => goShare(sel)}>去分享区看看，或发第一条</button>
        </div>
      )}
      </>)}
    </div>
  );
}

export { ProgressionTab };
