import { useState, useEffect } from "react";
import { Check, Download } from "lucide-react";
import { C, SERIF, MONO } from "../theme.js";
import { nowIso } from "../core/utils.js";
import { GENDERS } from "../core/templates.js";
import { storSetJson } from "../adapters/storage.js";
import { exportPhr } from "../core/phr-export.js";
import { seedDemoData, clearDemoData } from "../core/demo-data.js";
import { isProxied, getAiConfig, setAiConfig } from "../adapters/ai.js";
import { Btn, Field, inputCls, inputStyle } from "./primitives.jsx";

/* ---------- 设置与导出 ---------- */
function SettingsTab({ subject, setSubject, records, showToast, onDemoChange }) {
  const [form, setForm] = useState(subject || { name: "", genderCode: "", birthTime: "" });
  const [msg, setMsg] = useState("");
  const [exporting, setExporting] = useState(false);
  const [dl, setDl] = useState(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [ai, setAi] = useState({ apiKey: "", baseUrl: "" });
  useEffect(() => { getAiConfig().then((c) => setAi({ apiKey: c.apiKey || "", baseUrl: c.baseUrl || "" })); }, []);
  useEffect(() => { setForm(subject || { name: "", genderCode: "", birthTime: "" }); }, [subject]);

  const save = async () => {
    if (!form.name.trim()) { setMsg("姓名为必填项（档案主体的最低要求）"); return; }
    const s = { name: form.name.trim(), genderCode: form.genderCode, birthTime: form.birthTime };
    const ok = await storSetJson("subject", s);
    setSubject(s);
    setMsg("");
    if (ok) showToast("已保存主体信息"); else setMsg("保存失败，本地存储不可用");
  };
  const doExport = async () => {
    setExporting(true); setMsg(""); setDl(null);
    try {
      const blob = await exportPhr(subject, records);
      const url = URL.createObjectURL(blob);
      setDl({ url, size: (blob.size / 1024).toFixed(0), name: `${subject.name}-健康档案-${nowIso().slice(0, 10)}.phr` });
      showToast("档案包已生成，点击链接下载");
    } catch (e) { setMsg("导出失败：" + e.message); }
    setExporting(false);
  };

  return (
    <div>
      <div className="rounded-sm p-4 mb-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <div style={{ fontFamily: SERIF, color: C.ink }} className="text-lg mb-1">档案主体</div>
        <div className="text-xs mb-4" style={{ color: C.inkSoft }}>遵循数据最小化：只需要姓名，性别与出生日期可选，不收集证件号等敏感信息。</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4">
          <Field label="姓名" required><input className={inputCls} style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="性别">
            <select className={inputCls} style={inputStyle} value={form.genderCode} onChange={(e) => setForm({ ...form, genderCode: e.target.value })}>
              <option value="">未填写</option>
              {GENDERS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </Field>
          <Field label="出生日期"><input type="date" className={inputCls} style={inputStyle} value={form.birthTime} onChange={(e) => setForm({ ...form, birthTime: e.target.value })} /></Field>
        </div>
        <Btn onClick={save}><Check size={14} />保存主体信息</Btn>
      </div>

      {!isProxied() && (
        <div className="rounded-sm p-4 mb-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <div style={{ fontFamily: SERIF, color: C.ink }} className="text-lg mb-1">模型服务</div>
          <div className="text-xs mb-4" style={{ color: C.inkSoft }}>
            独立部署需要配置模型 API。Key 只保存在本机浏览器中；上传的病历图片会发送到所配置的服务用于解析。生产环境建议改用自建代理，避免在浏览器中保存 Key。
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <Field label="API Key"><input type="password" className={inputCls} style={inputStyle} value={ai.apiKey} onChange={(e) => setAi({ ...ai, apiKey: e.target.value })} /></Field>
            <Field label="Base URL（可选）"><input className={inputCls} style={inputStyle} value={ai.baseUrl} placeholder="https://api.anthropic.com" onChange={(e) => setAi({ ...ai, baseUrl: e.target.value })} /></Field>
          </div>
          <Btn onClick={async () => { await setAiConfig(ai); showToast("模型配置已保存"); }}><Check size={14} />保存模型配置</Btn>
        </div>
      )}
      <div className="rounded-sm p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <div style={{ fontFamily: SERIF, color: C.ink }} className="text-lg mb-1">导出 .phr 档案包</div>
        <div className="text-xs mb-3" style={{ color: C.inkSoft }}>
          基于 OMAHA《"当归"个人健康档案文件格式规范》v1.0 生成 .phr 容器文件（含本工具定义的内容模板等实现层扩展），包含全部记录、结构化内容与原始图片，AI 解析过程按规范写入溯源信息。这个文件属于你，可长期保存，也可交给任何符合规范的软件打开。数字签名与包级加密不在本工具范围内。
        </div>
        <Btn disabled={!subject?.name || !records.length || exporting} onClick={doExport}>
          <Download size={14} />{exporting ? "打包中…" : `导出 ${records.length} 条记录`}
        </Btn>
        {!subject?.name && <div className="text-xs mt-2" style={{ color: C.seal }}>请先在上方保存主体姓名</div>}
        {subject?.name && !records.length && <div className="text-xs mt-2" style={{ color: C.inkSoft }}>档案里还没有记录</div>}
        {dl && (
          <div className="mt-3 text-sm px-3 py-2.5 rounded-sm inline-flex items-center gap-2" style={{ background: "#EDF3EE" }}>
            <Download size={14} color={C.ok} />
            <a href={dl.url} download={dl.name} className="underline" style={{ color: C.ink }}>下载 {dl.name}</a>
            <span className="text-xs" style={{ color: C.inkSoft, fontFamily: MONO }}>{dl.size} KB</span>
          </div>
        )}
      </div>
      <div className="rounded-sm p-4 mt-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <div style={{ fontFamily: SERIF, color: C.ink }} className="text-lg mb-1">演示数据</div>
        <div className="text-xs mb-3" style={{ color: C.inkSoft }}>
          载入一位虚构患者两年的病程样本：2型糖尿病与高血压的长期管理、一次胆囊结石手术，覆盖全部七类记录与六条病友分享示例，用于体验时间轴、指标趋势、知识图谱与分享区。演示记录按固定编号存取，可随时一键清除，不影响你自己的真实记录。
        </div>
        <div className="flex gap-2 flex-wrap">
          <Btn disabled={demoBusy} onClick={async () => {
            setDemoBusy(true);
            try {
              const res = await seedDemoData();
              if (!res.recOk) { showToast("载入失败：本地存储不可用（原因见页面顶部提示）"); return; }
              showToast(res.kbOk
                ? `已载入 ${res.recOk} 条演示记录与 ${res.kbOk} 条分享示例`
                : `已载入 ${res.recOk} 条演示记录（共享存储暂不可用，分享示例未写入）`);
              onDemoChange("timeline");
            } catch (e) { showToast("载入失败：" + (e?.message || "未知错误")); }
            finally { setDemoBusy(false); }
          }}>{demoBusy ? "处理中…" : "载入演示数据"}</Btn>
          <Btn variant="danger" disabled={demoBusy} onClick={async () => {
            setDemoBusy(true);
            try { await clearDemoData(); showToast("演示数据已清除"); onDemoChange(); }
            catch (e) { showToast("清除失败：" + (e?.message || "未知错误")); }
            finally { setDemoBusy(false); }
          }}>清除演示数据</Btn>
        </div>
      </div>
      {msg && <div className="mt-3 text-sm" style={{ color: C.seal }}>{msg}</div>}
    </div>
  );
}

export { SettingsTab };
