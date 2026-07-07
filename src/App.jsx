import { useState, useEffect, useRef, useCallback } from "react";
import { FileText, Upload, Activity, Route, Users, Settings, Check, ArrowRight } from "lucide-react";
import { C, SERIF, MONO } from "./theme.js";
import { storGetJson, storSetJson, loadAllRecords, storDelete, probeStorage } from "./adapters/storage.js";
import { FEATURES } from "./config.js";
import { Btn, Empty, Seal, inputStyle } from "./ui/primitives.jsx";
import { RecordsTab } from "./ui/RecordsTab.jsx";
import { UploadTab } from "./ui/UploadTab.jsx";
import { TimelineTab } from "./ui/TimelineTab.jsx";
import { ProgressionTab } from "./ui/ProgressionTab.jsx";
import { ShareTab } from "./ui/ShareTab.jsx";
import { SettingsTab } from "./ui/SettingsTab.jsx";

/* ---------- 首次引导 ---------- */
function Welcome({ setSubject, goUpload, showToast }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const create = async () => {
    if (!name.trim()) { setErr("请先填写姓名"); return; }
    const s = { name: name.trim(), genderCode: "", birthTime: "" };
    await storSetJson("subject", s);
    setSubject(s);
    showToast(`已为${s.name}建立档案`);
  };
  return (
    <div className="rounded-sm p-8 sm:p-10 text-center" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div style={{ fontFamily: SERIF, color: C.ink, letterSpacing: "0.04em" }} className="text-xl mb-2">
        把散落的病历，收进一份属于自己的档案
      </div>
      <div className="text-sm mb-6 max-w-md mx-auto" style={{ color: C.inkSoft }}>
        拍下病历或报告，AI 帮你整理成结构化记录；病程按时间铺开，指标变化一眼可见。数据只存在你自己的设备上。
      </div>
      <div className="flex gap-2 justify-center items-center flex-wrap">
        <input className="px-3 py-2 text-sm rounded-sm bg-white w-44" style={{ ...inputStyle, borderColor: err ? C.seal : C.line }}
          placeholder="你的姓名" value={name}
          onChange={(e) => { setName(e.target.value); setErr(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") create(); }} />
        <Btn onClick={create}>建立我的档案<ArrowRight size={14} /></Btn>
      </div>
      {err && <div className="text-xs mt-2" style={{ color: C.seal }}>{err}</div>}
      <div className="text-xs mt-5" style={{ color: C.inkSoft }}>建档只需要姓名，不收集证件号等敏感信息</div>
    </div>
  );
}


/* ---------- 主应用 ---------- */
const TABS = [
  ["records", "档案", FileText],
  ["upload", "上传解析", Upload],
  ["timeline", "病程时间轴", Activity],
  ["progress", "疾病演进", Route],
  ["share", "病友分享", Users],
  ["settings", "设置与导出", Settings],
];
const VISIBLE_TABS = FEATURES.share ? TABS : TABS.filter(([k]) => k !== "share");

export default function App() {
  const [tab, setTab] = useState("records");
  const [subject, setSubject] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [storageOk, setStorageOk] = useState(true);
  const toastTimer = useRef(null);

  const showToast = useCallback((t) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  useEffect(() => {
    (async () => {
      setStorageOk(await probeStorage());
      setSubject(await storGetJson("subject"));
      setRecords(await loadAllRecords());
      setLoading(false);
    })();
    return () => clearTimeout(toastTimer.current);
  }, []);

  const refreshFromStorage = async (jump) => {
    setSubject(await storGetJson("subject"));
    setRecords(await loadAllRecords());
    if (jump) setTab(jump);
  };
  const onSaved = (rec) => {
    setRecords((p) => [rec, ...p].sort((a, b) => (b.eventStart || "").localeCompare(a.eventStart || "")));
    setTab("records");
    showToast("已存入档案");
  };
  const onDelete = async (id) => {
    await storDelete(`rec:${id}`);
    setRecords((p) => p.filter((r) => r.recordId !== id));
    showToast("已删除记录");
  };
  const goUpload = () => setTab("upload");
  const [sharePreset, setSharePreset] = useState("");
  const goShare = (d) => { setSharePreset(d || ""); setTab("share"); };
  const firstRun = !loading && !subject?.name && records.length === 0;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.paper, color: C.ink }}>
      <header className="px-5 pt-6 pb-0 max-w-3xl mx-auto w-full">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl truncate" style={{ fontFamily: SERIF, letterSpacing: "0.06em" }}>
              {subject?.name ? `${subject.name}的健康档案` : "我的健康档案"}
            </h1>
            <div className="text-xs mt-1.5" style={{ color: C.inkSoft, fontFamily: MONO }}>
              记录 {records.length} 条 · 数据仅存本机
            </div>
          </div>
          {subject?.name && <Seal name={subject.name} />}
        </div>
        <div className="mt-3" style={{ borderTop: `2.5px solid ${C.ink}` }} />
        <div style={{ borderTop: `1px solid ${C.ink}`, marginTop: 2 }} />
        <nav className="flex gap-1.5 mt-3 pb-3 overflow-x-auto" aria-label="主导航">
          {VISIBLE_TABS.map(([k, t, Icon]) => (
            <button key={k} onClick={() => { setSharePreset(""); setTab(k); }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm rounded-full whitespace-nowrap transition-colors shrink-0"
              style={tab === k
                ? { background: C.ink, color: "#fff" }
                : { color: C.inkSoft, border: `1px solid ${C.line}`, background: C.card }}
              aria-current={tab === k ? "page" : undefined}>
              <Icon size={14} strokeWidth={1.9} />{t}
            </button>
          ))}
        </nav>
      </header>

      <main className="px-5 pt-4 pb-6 max-w-3xl mx-auto w-full flex-1">
        {!loading && !storageOk && (
          <div className="mb-4 px-3 py-2.5 text-sm rounded-sm" style={{ background: "#F7ECEA", color: C.seal }}>
            本地存储不可用：当前打开方式不支持保存数据（包括载入演示数据）。请检查浏览器是否处于隐私模式或禁用了本地数据库（IndexedDB），刷新后重试；在 claude.ai Artifact 环境中使用则无需配置。
          </div>
        )}
        {loading ? (
          <div className="text-sm py-10 text-center" style={{ color: C.inkSoft }}>正在读取本地档案…</div>
        ) : firstRun && tab === "records" ? (
          <Welcome setSubject={setSubject} goUpload={goUpload} showToast={showToast} />
        ) : (
          <>
            {!subject?.name && records.length === 0 && tab !== "settings" && tab !== "upload" && null}
            {tab === "records" && (
              subject?.name && records.length === 0
                ? <Empty text={`${subject.name}的档案已建立。上传第一张病历或报告的照片，AI 会帮你把它变成结构化记录。`}
                    actionText="上传第一份病历" onAction={goUpload} />
                : <RecordsTab records={records} onDelete={onDelete} goUpload={goUpload} />
            )}
            {tab === "upload" && <UploadTab onSaved={onSaved} />}
            {tab === "timeline" && <TimelineTab records={records} onDelete={onDelete} goUpload={goUpload} />}
            {tab === "progress" && <ProgressionTab records={records} onDelete={onDelete} showToast={showToast} goShare={goShare} goUpload={goUpload} shareEnabled={FEATURES.share} />}
            {FEATURES.share && tab === "share" && <ShareTab records={records} showToast={showToast} initialDz={sharePreset} />}
            {tab === "settings" && <SettingsTab subject={subject} setSubject={setSubject} records={records} showToast={showToast} onDemoChange={refreshFromStorage} />}
          </>
        )}
      </main>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 text-sm text-white rounded-sm shadow-lg z-50 inline-flex items-center gap-2"
          style={{ background: C.ink }} role="status">
          <Check size={14} />{toast}
        </div>
      )}

      <footer className="px-5 py-4 text-center text-xs max-w-3xl mx-auto w-full" style={{ color: C.inkSoft, borderTop: `1px solid ${C.lineSoft}`, lineHeight: 1.8 }}>
        <div>
          文件格式基于 OMAHA 开放医疗与健康联盟《"当归"个人健康档案文件格式规范》v1.0（浙江数字医疗卫生技术研究院发起 ·{" "}
          <a href="https://github.com/ChinaOMAHA/Angelica-PHR" target="_blank" rel="noopener noreferrer"
            className="underline" style={{ color: C.inkSoft }}>ChinaOMAHA/Angelica-PHR</a>）调整实现
        </div>
        <div className="mt-0.5" style={{ color: C.ink }}>
          本工具仅对个人医疗资料做整理、呈现与溯源，不提供诊断或治疗建议；健康问题请咨询医生。
        </div>
      </footer>
    </div>
  );
}
