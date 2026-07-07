import { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import { C } from "../theme.js";
import { RECORD_TYPES } from "../core/templates.js";
import { Empty, inputStyle } from "./primitives.jsx";
import { RecordCard } from "./RecordCard.jsx";

/* ---------- 档案列表（搜索 + 筛选） ---------- */
function RecordsTab({ records, onDelete, goUpload }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const shown = useMemo(() => {
    let r = records;
    if (type) r = r.filter((x) => x.recordType === type);
    if (q.trim()) {
      const k = q.trim().toLowerCase();
      r = r.filter((x) =>
        [x.recordTitle, x.provider, x.summary, ...(x.tags || []), ...(x.dx || [])]
          .join(" ").toLowerCase().includes(k));
    }
    return r;
  }, [records, q, type]);

  if (!records.length) {
    return <Empty text="档案还是空的。上传第一张病历或报告的照片，AI 会帮你把它变成结构化记录。"
      actionText="上传第一份病历" onAction={goUpload} />;
  }
  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-2 flex-1 px-2.5 rounded-sm bg-white" style={{ border: `1px solid ${C.line}`, minWidth: 200 }}>
          <Search size={14} color={C.inkSoft} />
          <input className="w-full py-2 text-sm bg-transparent" style={{ color: C.ink, border: "none", outline: "inherit" }}
            placeholder="搜索标题、机构、诊断、标签…" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button onClick={() => setQ("")} aria-label="清空搜索"><X size={14} color={C.inkSoft} /></button>}
        </div>
        <select className="px-2.5 py-2 text-sm rounded-sm bg-white" style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">全部类型</option>
          {RECORD_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      {shown.length
        ? shown.map((r) => <RecordCard key={r.recordId} rec={r} onDelete={onDelete} />)
        : <Empty text="没有匹配的记录。换个关键词，或清空筛选条件再试。" />}
    </div>
  );
}

export { RecordsTab };
