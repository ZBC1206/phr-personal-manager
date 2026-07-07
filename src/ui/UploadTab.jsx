import React, { useState, useRef } from "react";
import { Upload, ArrowRight, Check, Plus, X } from "lucide-react";
import { C, SERIF, MONO } from "../theme.js";
import { uuid4, nowIso, normDateTime, splitList } from "../core/utils.js";
import { RECORD_TYPES, tplOf } from "../core/templates.js";
import { MODEL, compressImage, parseMedicalImage } from "../core/parser.js";
import { storSetJson } from "../adapters/storage.js";
import { Btn, Field, Spinner, SectionLabel, confLevel, inputCls, inputStyle } from "./primitives.jsx";

/* ---------- M1 · 上传解析 ---------- */
function Steps({ current }) {
  const steps = ["选择图片", "AI 解析", "核对入档"];
  return (
    <div className="flex items-center justify-center gap-0 mb-5" aria-label={`第 ${current + 1} 步，共 3 步`}>
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          {i > 0 && <span className="w-10 sm:w-16 mx-1" style={{ borderTop: `1.5px solid ${i <= current ? C.ink : C.line}` }} />}
          <span className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full inline-flex items-center justify-center text-xs"
              style={i < current
                ? { background: C.ink, color: "#fff" }
                : i === current
                  ? { border: `1.5px solid ${C.ink}`, color: C.ink, fontWeight: 600 }
                  : { border: `1.5px solid ${C.line}`, color: C.inkSoft }}>
              {i < current ? <Check size={13} /> : i + 1}
            </span>
            <span className="text-xs hidden sm:inline" style={{ color: i === current ? C.ink : C.inkSoft, fontWeight: i === current ? 600 : 400 }}>{s}</span>
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

function DetailSection({ sec, draft, upd, updLab }) {
  if (sec === "labs") {
    return (
      <div className="mb-3">
        <div className="text-xs mb-1" style={{ color: C.inkSoft }}>检验指标（可修正/增删）</div>
        {draft.labs.length === 0 && <div className="text-xs mb-2" style={{ color: C.inkSoft }}>没有识别到检验指标；如原件上有，可手动添加。</div>}
        {draft.labs.map((l, i) => (
          <div key={i} className="flex gap-1 mb-1 items-center">
            <input className="flex-1 px-2 py-1.5 text-xs rounded-sm" style={inputStyle} value={l.n} placeholder="项目" onChange={(e) => updLab(i, "n", e.target.value)} />
            <input className="w-16 px-2 py-1.5 text-xs rounded-sm" style={{ ...inputStyle, fontFamily: MONO }} value={l.v} placeholder="结果" onChange={(e) => updLab(i, "v", e.target.value)} />
            <input className="w-14 px-2 py-1.5 text-xs rounded-sm" style={inputStyle} value={l.u} placeholder="单位" onChange={(e) => updLab(i, "u", e.target.value)} />
            <input className="w-20 px-2 py-1.5 text-xs rounded-sm" style={{ ...inputStyle, fontFamily: MONO }} value={l.r} placeholder="参考" onChange={(e) => updLab(i, "r", e.target.value)} />
            <select className="w-12 px-1 py-1.5 text-xs rounded-sm" style={inputStyle} value={l.ab} onChange={(e) => updLab(i, "ab", e.target.value)} aria-label="异常方向">
              <option value=""> </option><option value="↑">↑</option><option value="↓">↓</option>
            </select>
            <button className="p-1" style={{ color: C.seal }} aria-label="删除这一行" onClick={() => upd("labs", draft.labs.filter((_, j) => j !== i))}><X size={13} /></button>
          </div>
        ))}
        <button className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-sm mb-2"
          style={{ border: `1px solid ${C.line}`, color: C.inkSoft }}
          onClick={() => upd("labs", [...draft.labs, { n: "", v: "", u: "", r: "", ab: "" }])}>
          <Plus size={12} />添加指标
        </button>
      </div>
    );
  }
  if (sec === "rx") {
    return (
      <Field label="用药（每行一条：药名 | 用法用量）">
        <textarea className={inputCls} style={{ ...inputStyle, fontFamily: MONO }} rows={2} value={draft.rxText} onChange={(e) => upd("rxText", e.target.value)} />
      </Field>
    );
  }
  const label = { dx: "诊断（逗号分隔）", sx: "症状（逗号分隔）", ex: "检查项目（逗号分隔）" }[sec];
  return (
    <Field label={label}>
      <input className={inputCls} style={inputStyle} value={draft[sec].join(",")} onChange={(e) => upd(sec, splitList(e.target.value))} />
    </Field>
  );
}

function UploadTab({ onSaved }) {
  const [stage, setStage] = useState("idle"); // idle | ready | parsing | review
  const [img, setImg] = useState(null);
  const [draft, setDraft] = useState(null);
  const [err, setErr] = useState("");
  const [dateErr, setDateErr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const pick = async (file) => {
    if (!file) return;
    setErr("");
    try { setImg(await compressImage(file)); setStage("ready"); }
    catch (e) { setErr(e.message); }
  };
  const parse = async () => {
    setStage("parsing"); setErr("");
    try {
      const d = await parseMedicalImage(img);
      setDraft({ ...d, rxText: d.rx.map((m) => `${m.n}${m.d ? " | " + m.d : ""}`).join("\n") });
      setStage("review");
    } catch (e) { setErr("解析没有成功：" + e.message + "。可以点「重新解析」再试一次，或换一张更清晰的照片。"); setStage("ready"); }
  };
  const reset = () => { setStage("idle"); setImg(null); setDraft(null); setErr(""); setDateErr(false); if (fileRef.current) fileRef.current.value = ""; };
  const upd = (k, v) => setDraft((p) => ({ ...p, [k]: v }));
  const updLab = (i, k, v) => setDraft((p) => { const labs = [...p.labs]; labs[i] = { ...labs[i], [k]: v }; return { ...p, labs }; });
  const save = async () => {
    if (!normDateTime(draft.date)) { setDateErr(true); setErr("请填写业务发生时间，格式如 2026-03-01（这是记录排进时间轴的依据）"); return; }
    setSaving(true); setErr(""); setDateErr(false);
    const tpl = tplOf(draft.type);
    const rec = {
      recordId: uuid4(),
      recordTitle: draft.title || "未命名记录",
      recordType: draft.type,
      eventStart: normDateTime(draft.date),
      provider: draft.provider.trim(),
      summary: draft.summary.trim(),
      tags: draft.tags.filter(Boolean),
      recordCreateTime: nowIso(),
      labs: draft.labs.filter((l) => l.n.trim()),
      dx: draft.dx.filter(Boolean),
      rx: draft.rxText.split("\n").map((s) => s.trim()).filter(Boolean)
        .map((s) => { const [n, d] = s.split("|").map((x) => x.trim()); return { n, d: d || "" }; }),
      sx: draft.sx.filter(Boolean),
      ex: draft.ex.filter(Boolean),
      processing: { algorithm: MODEL, algorithmVersion: "messages-api", processedTime: nowIso(), confidence: draft.conf },
      template: { code: tpl.code, name: tpl.name, version: tpl.version },
      image: img,
    };
    const ok = await storSetJson(`rec:${rec.recordId}`, rec);
    setSaving(false);
    if (!ok) { setErr("保存失败：本地存储不可用或已满。可以删除几条旧记录后重试。"); return; }
    reset();
    onSaved(rec);
  };
  const stepIndex = stage === "idle" ? 0 : stage === "review" ? 2 : 1;
  const lv = draft ? confLevel(draft.conf) : null;
  const tplR = draft ? tplOf(draft.type) : null;

  return (
    <div>
      <Steps current={stepIndex} />
      {err && <div className="mb-3 text-sm px-3 py-2.5 rounded-sm" style={{ color: C.seal, background: "#F7ECEA" }}>{err}</div>}

      {stage === "idle" && (
        <div className="rounded-sm p-10 text-center cursor-pointer transition-colors"
          style={{ border: `1.5px dashed ${dragOver ? C.ink : C.line}`, background: dragOver ? "#EFF3EE" : C.card }}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files?.[0]); }}>
          <Upload size={28} color={C.inkSoft} className="mx-auto mb-3" />
          <div style={{ fontFamily: SERIF, color: C.ink }} className="text-lg mb-1">上传一张病历或报告</div>
          <div className="text-sm mb-5" style={{ color: C.inkSoft }}>拍照或截图都可以：门诊病历、检验/检查报告、处方单、体检报告</div>
          <Btn onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>选择图片</Btn>
          <div className="text-xs mt-3" style={{ color: C.inkSoft }}>也可以把图片拖到这里</div>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />

      {(stage === "ready" || stage === "parsing") && img && (
        <div className="rounded-sm p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <div className="relative">
            <img src={img} alt="待解析的记录照片" className="max-h-80 mx-auto rounded-sm"
              style={{ border: `1px solid ${C.line}`, opacity: stage === "parsing" ? 0.35 : 1 }} />
            {stage === "parsing" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <Spinner />
                <div className="text-sm" style={{ color: C.ink, fontWeight: 600 }}>正在识读单据上的文字与指标…</div>
                <div className="text-xs" style={{ color: C.inkSoft }}>通常需要 10–20 秒，请留在本页</div>
              </div>
            )}
          </div>
          {stage === "ready" && (
            <div className="flex gap-2 justify-center mt-4">
              <Btn variant="ghost" onClick={reset}>重新选择</Btn>
              <Btn onClick={parse}>开始 AI 解析<ArrowRight size={14} /></Btn>
            </div>
          )}
        </div>
      )}

      {stage === "review" && draft && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
          <div className="lg:col-span-2 lg:sticky lg:top-4 rounded-sm p-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <div className="text-xs mb-2" style={{ color: C.inkSoft }}>原件对照 · 请对着它核对右侧内容</div>
            <img src={img} alt="原始记录" className="w-full rounded-sm" style={{ border: `1px solid ${C.line}` }} />
          </div>

          <div className="lg:col-span-3 rounded-sm p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
              <div style={{ fontFamily: SERIF, color: C.ink }} className="text-lg">核对解析结果</div>
              <span className="text-xs px-2 py-1 rounded-full" style={{ color: lv.color, border: `1px solid ${lv.color}` }}>
                {lv.t}
              </span>
              <span className="text-xs px-2 py-1 rounded-full" style={{ color: C.inkSoft, border: `1px solid ${C.line}`, fontFamily: SERIF }}>
                {tplR.name} v{tplR.version}
              </span>
            </div>
            <div className="text-xs mb-3" style={{ color: C.inkSoft }}>
              AI 只产出草稿，由你确认后才会入档。{lv.tip}；识别不清的字段已留空。
            </div>

            <SectionLabel>基本信息</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              <Field label="记录标题"><input className={inputCls} style={inputStyle} value={draft.title} onChange={(e) => upd("title", e.target.value)} /></Field>
              <Field label="记录类型">
                <select className={inputCls} style={inputStyle} value={draft.type} onChange={(e) => upd("type", e.target.value)}>
                  {RECORD_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="业务发生时间" required>
                <input className={inputCls} style={{ ...inputStyle, fontFamily: MONO, borderColor: dateErr ? C.seal : C.line }}
                  value={draft.date} placeholder="2026-03-01" onChange={(e) => { upd("date", e.target.value); setDateErr(false); }} />
              </Field>
              <Field label="医疗机构"><input className={inputCls} style={inputStyle} value={draft.provider} onChange={(e) => upd("provider", e.target.value)} /></Field>
            </div>
            <Field label="摘要"><textarea className={inputCls} style={inputStyle} rows={2} value={draft.summary} onChange={(e) => upd("summary", e.target.value)} /></Field>

            <SectionLabel>记录明细</SectionLabel>
            <div className="text-xs mb-3" style={{ color: C.inkSoft }}>字段重点与排列由「{tplR.name}」决定；切换上方记录类型，会自动换用对应模板。</div>
            <Field label="标签（逗号分隔）"><input className={inputCls} style={inputStyle} value={draft.tags.join(",")} onChange={(e) => upd("tags", splitList(e.target.value))} /></Field>
            {tplR.sections.map((sec) => (
              <DetailSection key={sec} sec={sec} draft={draft} upd={upd} updLab={updLab} />
            ))}

            <div className="flex gap-2 justify-end mt-4 pt-3" style={{ borderTop: `1px solid ${C.lineSoft}` }}>
              <Btn variant="ghost" onClick={() => setStage("ready")}>返回重新解析</Btn>
              <Btn disabled={saving} onClick={save}><Check size={14} />{saving ? "保存中…" : "确认无误，存入档案"}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { UploadTab };
