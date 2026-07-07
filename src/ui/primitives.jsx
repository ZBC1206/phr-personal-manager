import { useState, useEffect } from "react";
import { ArrowRight, Trash2 } from "lucide-react";
import { C, SERIF, MONO } from "../theme.js";

/* ---------- UI 基元 ---------- */
const inputCls = "w-full px-2.5 py-2 text-sm rounded-sm bg-white";
const inputStyle = { border: `1px solid ${C.line}`, color: C.ink };

function Btn({ variant = "primary", className = "", style = {}, children, ...rest }) {
  const base = "inline-flex items-center gap-1.5 text-sm rounded-sm px-4 py-2 transition-colors disabled:opacity-50";
  const v = variant === "primary"
    ? { background: C.ink, color: "#fff" }
    : variant === "danger"
      ? { border: `1px solid ${C.line}`, color: C.seal, background: C.card }
      : { border: `1px solid ${C.line}`, color: C.inkSoft, background: C.card };
  return <button className={`${base} ${className}`} style={{ ...v, ...style }} {...rest}>{children}</button>;
}
function TypeBadge({ t }) {
  return (
    <span className="inline-block px-2 py-0.5 text-xs border rounded-sm shrink-0"
      style={{ borderColor: C.ink, color: C.ink, fontFamily: SERIF, letterSpacing: "0.08em" }}>
      {t}
    </span>
  );
}
function Tag({ children }) {
  return <span className="inline-block px-2 py-0.5 text-xs rounded-sm mr-1 mb-1" style={{ background: C.tagBg, color: C.inkSoft }}>{children}</span>;
}
function AbMark({ ab }) {
  if (!ab) return null;
  const isUp = ab === "↑";
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 ml-1 text-xs font-bold border rounded-full"
      style={{ color: isUp ? C.seal : C.low, borderColor: isUp ? C.seal : C.low, transform: "rotate(-8deg)" }}
      title={isUp ? "高于参考范围" : "低于参考范围"}>
      {ab}
    </span>
  );
}
function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-2 mt-5 mb-2">
      <span className="text-sm" style={{ fontFamily: SERIF, color: C.ink, letterSpacing: "0.12em" }}>{children}</span>
      <span className="flex-1" style={{ borderTop: `1px solid ${C.lineSoft}` }} />
    </div>
  );
}
function Field({ label, required, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs mb-1" style={{ color: C.inkSoft }}>
        {label}{required && <span style={{ color: C.seal }}> *</span>}
      </span>
      {children}
    </label>
  );
}
function Empty({ text, actionText, onAction }) {
  return (
    <div className="rounded-sm px-6 py-12 text-center" style={{ border: `1.5px dashed ${C.line}`, background: C.card }}>
      <div className="text-sm mb-4" style={{ color: C.inkSoft }}>{text}</div>
      {actionText && <Btn onClick={onAction}>{actionText}<ArrowRight size={14} /></Btn>}
    </div>
  );
}
function Chip({ active, onClick, children }) {
  return (
    <button className="px-3 py-1.5 text-xs rounded-full transition-colors" onClick={onClick}
      style={active ? { background: C.ink, color: "#fff" } : { border: `1px solid ${C.line}`, color: C.inkSoft, background: C.card }}>
      {children}
    </button>
  );
}
function Spinner() {
  return <span className="inline-block w-5 h-5 rounded-full border-2 animate-spin align-middle"
    style={{ borderColor: C.line, borderTopColor: C.ink }} />;
}
function Seal({ name }) {
  return (
    <div className="w-14 h-14 rounded-full flex flex-col items-center justify-center select-none shrink-0"
      style={{ border: `2px solid ${C.seal}`, color: C.seal, transform: "rotate(-8deg)", fontFamily: SERIF, opacity: 0.85 }}
      aria-hidden="true">
      <span className="text-lg leading-none">{name[0]}</span>
      <span style={{ fontSize: 8, letterSpacing: 3, marginTop: 3, marginRight: -3 }}>健康档案</span>
    </div>
  );
}
function DeleteButton({ onConfirm }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return armed ? (
    <button className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-sm text-white"
      style={{ background: C.seal }} onClick={onConfirm}>
      <Trash2 size={12} />确认删除？此操作不可恢复
    </button>
  ) : (
    <button className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-sm"
      style={{ color: C.inkSoft, border: `1px solid ${C.line}` }} onClick={() => setArmed(true)}>
      <Trash2 size={12} />删除记录
    </button>
  );
}
function confLevel(c) {
  if (c >= 0.85) return { t: "识别质量：高", color: C.ok, tip: "仍请快速过目一遍关键数字" };
  if (c >= 0.6) return { t: "识别质量：中", color: "#8A6A2F", tip: "建议逐项核对" };
  return { t: "识别质量：低", color: C.seal, tip: "请对照左侧原件仔细核对每一项" };
}


/* ---------- 检验指标表 ---------- */
function LabsTable({ labs }) {
  if (!labs?.length) return null;
  return (
    <div className="overflow-x-auto mt-2">
      <table className="w-full text-sm" style={{ borderCollapse: "collapse", minWidth: 380 }}>
        <thead>
          <tr style={{ color: C.inkSoft }}>
            {["项目", "结果", "单位", "参考范围", ""].map((h, i) => (
              <th key={i} className="text-left py-1.5 px-2 font-normal text-xs" style={{ borderBottom: `1.5px solid ${C.line}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labs.map((l, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
              <td className="py-1.5 px-2" style={{ color: C.ink }}>{l.n}</td>
              <td className="py-1.5 px-2" style={{ fontFamily: MONO, color: l.ab === "↑" ? C.seal : l.ab === "↓" ? C.low : C.ink, fontWeight: l.ab ? 600 : 400 }}>{l.v}</td>
              <td className="py-1.5 px-2" style={{ color: C.inkSoft }}>{l.u}</td>
              <td className="py-1.5 px-2" style={{ fontFamily: MONO, color: C.inkSoft }}>{l.r}</td>
              <td className="py-1.5 px-2"><AbMark ab={l.ab} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { inputCls, inputStyle, Btn, TypeBadge, Tag, AbMark, SectionLabel, Field, Empty, Chip, Spinner, Seal, DeleteButton, confLevel, LabsTable };
