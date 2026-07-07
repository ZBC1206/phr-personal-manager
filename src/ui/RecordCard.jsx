import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { C, SERIF, MONO } from "../theme.js";
import { fmtDate } from "../core/utils.js";
import { tplOf } from "../core/templates.js";
import { TypeBadge, Tag, LabsTable, DeleteButton } from "./primitives.jsx";

/* ---------- 记录卡片 ---------- */
function RecordCard({ rec, onDelete, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const abn = (rec.labs || []).filter((l) => l.ab).length;
  return (
    <div className="mb-3 rounded-sm transition-colors" style={{ background: C.card, border: `1px solid ${open ? C.ink : C.line}` }}>
      <div role="button" tabIndex={0} className="w-full text-left px-4 py-3 cursor-pointer"
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(!open); } }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs" style={{ fontFamily: MONO, color: C.inkSoft }}>{fmtDate(rec.eventStart)}</span>
          <TypeBadge t={rec.recordType} />
          <span className="font-medium flex-1" style={{ color: C.ink, fontFamily: SERIF, fontSize: 15 }}>{rec.recordTitle}</span>
          {abn > 0 && (
            <span className="text-xs px-1.5 py-0.5 border rounded-full shrink-0" style={{ color: C.seal, borderColor: C.seal }}>
              {abn} 项异常
            </span>
          )}
          <span style={{ color: C.inkSoft }}>{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
        </div>
        {rec.provider && <div className="text-xs mt-1" style={{ color: C.inkSoft }}>{rec.provider}</div>}
        {rec.summary && <div className="text-sm mt-1" style={{ color: C.inkSoft }}>{rec.summary}</div>}
        {(rec.tags || []).length > 0 && <div className="mt-1.5">{rec.tags.map((t) => <Tag key={t}>{t}</Tag>)}</div>}
      </div>
      {open && (
        <div className="px-4 pb-4" style={{ borderTop: `1px dashed ${C.line}` }}>
          {rec.dx?.length > 0 && <div className="text-sm mt-3" style={{ color: C.ink }}><span style={{ color: C.inkSoft }}>诊断：</span>{rec.dx.join("、")}</div>}
          {rec.rx?.length > 0 && (
            <div className="text-sm mt-1" style={{ color: C.ink }}>
              <span style={{ color: C.inkSoft }}>用药：</span>
              {rec.rx.map((m) => m.n + (m.d ? `（${m.d}）` : "")).join("；")}
            </div>
          )}
          {rec.sx?.length > 0 && <div className="text-sm mt-1" style={{ color: C.ink }}><span style={{ color: C.inkSoft }}>症状：</span>{rec.sx.join("、")}</div>}
          {rec.ex?.length > 0 && <div className="text-sm mt-1" style={{ color: C.ink }}><span style={{ color: C.inkSoft }}>检查：</span>{rec.ex.join("、")}</div>}
          <LabsTable labs={rec.labs} />
          {rec.image && <img src={rec.image} alt="原始记录" className="mt-3 rounded-sm max-h-72" style={{ border: `1px solid ${C.line}` }} />}
          <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
            <span className="text-xs" style={{ color: C.inkSoft, fontFamily: MONO }}>
              AI 解析 · 置信度 {(rec.processing?.confidence ?? 0.5).toFixed(2)} · {(rec.template || tplOf(rec.recordType)).name} · {rec.recordId.slice(0, 8)}
            </span>
            <DeleteButton onConfirm={() => onDelete(rec.recordId)} />
          </div>
        </div>
      )}
    </div>
  );
}

export { RecordCard };
