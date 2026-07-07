import { useState, useEffect, useMemo } from "react";
import { ThumbsUp, Flag, Bookmark, PenLine, X } from "lucide-react";
import { C, SERIF, MONO } from "../theme.js";
import { uuid4, nowIso, fmtDate, splitList } from "../core/utils.js";
import { storGetJson, storSetJson, storSetJsonShared, storSetRaw, getAnonId, loadKb, storageCapabilities } from "../adapters/storage.js";
import { screenKb } from "../core/moderation.js";
import { Btn, Field, Chip, Empty, Spinner, Tag, inputCls, inputStyle } from "./primitives.jsx";

/* ---------- M4 · 病友知识分享 ---------- */
const KB_CATS = ["就医经验", "康复经验", "治疗护理", "指南要点"];
function KbSourceBadge({ sourceType }) {
  const isGuide = sourceType === "指南/权威资料";
  return (
    <span className="inline-block px-2 py-0.5 text-xs border rounded-sm shrink-0"
      style={{ borderColor: isGuide ? C.ok : C.ink, color: isGuide ? C.ok : C.ink, fontFamily: SERIF, letterSpacing: "0.06em" }}>
      {isGuide ? "指南·权威资料" : "患者经验"}
    </span>
  );
}
function FlagButton({ onConfirm }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return armed ? (
    <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-sm text-white" style={{ background: C.seal }}
      onClick={() => { onConfirm(); setArmed(false); }}>
      <Flag size={11} />确认举报？
    </button>
  ) : (
    <button className="inline-flex items-center gap-1 text-xs px-2 py-1" style={{ color: C.inkSoft }} onClick={() => setArmed(true)}>
      <Flag size={11} />举报
    </button>
  );
}
function KbCard({ item, voted, adopted, onVote, onAdopt, onFlag }) {
  const [expand, setExpand] = useState(false);
  const long = (item.content || "").length > 130;
  const body = expand || !long ? item.content : item.content.slice(0, 130) + "…";
  return (
    <div className="mb-3 rounded-sm px-4 py-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div className="flex items-center gap-2 flex-wrap">
        <KbSourceBadge sourceType={item.sourceType} />
        <span className="text-xs px-2 py-0.5 rounded-sm" style={{ background: C.tagBg, color: C.inkSoft }}>{item.category}</span>
        {(item.diseases || []).map((d) => <Tag key={d}>{d}</Tag>)}
      </div>
      <div className="mt-2 font-medium" style={{ fontFamily: SERIF, color: C.ink, fontSize: 15 }}>{item.title}</div>
      {item.sourceRef && <div className="text-xs mt-0.5" style={{ color: C.ok }}>出处：{item.sourceRef}</div>}
      <div className="text-sm mt-1.5 whitespace-pre-wrap" style={{ color: C.inkSoft, lineHeight: 1.7 }}>{body}</div>
      {long && (
        <button className="text-xs mt-1 underline" style={{ color: C.inkSoft }} onClick={() => setExpand(!expand)}>
          {expand ? "收起" : "展开全文"}
        </button>
      )}
      {item.review?.level === "warn" && (
        <div className="text-xs mt-2 px-2.5 py-1.5 rounded-sm" style={{ background: "#FBF3E4", color: "#8A6A2F" }}>
          内容涉及个人治疗细节，仅代表分享者自身经历，请勿自行照做，重要决策请与主治医生确认。
        </div>
      )}
      {item.sourceType === "患者经验" && item.review?.level !== "warn" && (
        <div className="text-xs mt-2" style={{ color: C.inkSoft }}>个人经验分享，不构成医疗建议。</div>
      )}
      <div className="flex items-center gap-3 mt-2.5 pt-2 flex-wrap" style={{ borderTop: `1px solid ${C.lineSoft}` }}>
        <span className="text-xs" style={{ color: C.inkSoft, fontFamily: MONO }}>{item.authorAlias || "匿名病友"} · {fmtDate(item.createdAt)}</span>
        <span className="flex-1" />
        <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-sm"
          style={voted ? { color: C.ok } : { color: C.inkSoft, border: `1px solid ${C.line}` }}
          disabled={voted} onClick={onVote}>
          <ThumbsUp size={11} />{voted ? "已觉得有用" : "有用"} {item.helpful > 0 ? item.helpful : ""}
        </button>
        <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-sm"
          style={adopted ? { background: C.ink, color: "#fff" } : { color: C.inkSoft, border: `1px solid ${C.line}` }}
          onClick={onAdopt}>
          <Bookmark size={11} />{adopted ? "已采纳" : "采纳"}
        </button>
        <FlagButton onConfirm={onFlag} />
      </div>
    </div>
  );
}
function KbPublish({ myDx, uid, onPublished, onCancel, showToast }) {
  const [form, setForm] = useState({
    category: KB_CATS[0], diseases: [], title: "", content: "",
    sourceType: "患者经验", sourceRef: "", alias: "",
  });
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [blockInfo, setBlockInfo] = useState(null);
  const upd = (k, v) => { setForm((p) => ({ ...p, [k]: v })); setErr(""); setBlockInfo(null); };

  const submit = async () => {
    if (!form.title.trim()) { setErr("请填写标题"); return; }
    if (form.content.trim().length < 20) { setErr("正文太短了，写清楚一点更能帮到病友（至少 20 字）"); return; }
    if (form.content.length > 1000) { setErr("正文请控制在 1000 字以内"); return; }
    if (form.sourceType === "指南/权威资料" && !form.sourceRef.trim()) { setErr("引用指南或权威资料时，必须注明出处"); return; }
    if (!agree) { setErr("请先勾选发布确认"); return; }
    setSubmitting(true); setErr(""); setBlockInfo(null);
    let review;
    try { review = await screenKb(form); }
    catch (e) { setErr("内容审核暂不可用：" + e.message + "。稍后再试。"); setSubmitting(false); return; }
    if (review.level === "block") { setBlockInfo(review); setSubmitting(false); return; }
    const item = {
      id: uuid4(), category: form.category, diseases: form.diseases,
      title: form.title.trim(), content: form.content.trim(),
      sourceType: form.sourceType, sourceRef: form.sourceRef.trim(),
      authorAlias: form.alias.trim() || "匿名病友", createdAt: nowIso(),
      publisher: uid, review: { level: review.level, reasons: review.reasons },
      helpful: 0, flagCount: 0,
    };
    const ok = await storSetJsonShared(`kb:${item.id}`, item);
    setSubmitting(false);
    if (!ok) { setErr("发布失败：共享存储暂不可用，请稍后重试"); return; }
    showToast(review.level === "warn" ? "已发布（带谨慎参考提示）" : "已发布，谢谢你的分享");
    onPublished(item);
  };

  return (
    <div className="rounded-sm p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div style={{ fontFamily: SERIF, color: C.ink }} className="text-lg mb-1">分享一条经验</div>
      <div className="text-xs mb-4" style={{ color: C.inkSoft }}>
        你的经验可能正是另一位病友需要的。发布前会经过 AI 安全审核；请不要写入自己或他人的真实姓名、电话等隐私信息。
      </div>
      {err && <div className="mb-3 text-sm px-3 py-2.5 rounded-sm" style={{ color: C.seal, background: "#F7ECEA" }}>{err}</div>}
      {blockInfo && (
        <div className="mb-3 text-sm px-3 py-2.5 rounded-sm" style={{ background: "#F7ECEA" }}>
          <div style={{ color: C.seal, fontWeight: 600 }}>这条内容未通过安全审核，暂不能发布</div>
          {blockInfo.reasons.map((r, i) => <div key={i} className="text-xs mt-1" style={{ color: C.seal }}>· {r}</div>)}
          {blockInfo.suggest && <div className="text-xs mt-2" style={{ color: C.inkSoft }}>修改建议:{blockInfo.suggest}</div>}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        <Field label="分类">
          <select className={inputCls} style={inputStyle} value={form.category} onChange={(e) => upd("category", e.target.value)}>
            {KB_CATS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="相关疾病（逗号分隔）">
          <input className={inputCls} style={inputStyle} value={form.diseases.join(",")}
            placeholder={myDx.length ? `如：${myDx[0]}` : "如：高血压"}
            onChange={(e) => upd("diseases", splitList(e.target.value))} />
        </Field>
        <Field label="内容来源">
          <select className={inputCls} style={inputStyle} value={form.sourceType} onChange={(e) => upd("sourceType", e.target.value)}>
            <option>患者经验</option>
            <option>指南/权威资料</option>
          </select>
        </Field>
        {form.sourceType === "指南/权威资料" ? (
          <Field label="出处" required>
            <input className={inputCls} style={inputStyle} value={form.sourceRef} placeholder="如：中国高血压防治指南(2024)" onChange={(e) => upd("sourceRef", e.target.value)} />
          </Field>
        ) : (
          <Field label="署名（可留空，默认匿名病友）">
            <input className={inputCls} style={inputStyle} value={form.alias} placeholder="昵称即可，请勿用真名" onChange={(e) => upd("alias", e.target.value)} />
          </Field>
        )}
      </div>
      <Field label="标题" required>
        <input className={inputCls} style={inputStyle} value={form.title} placeholder="一句话说清这条经验是关于什么的" onChange={(e) => upd("title", e.target.value)} />
      </Field>
      <Field label={`正文（${form.content.length}/1000）`} required>
        <textarea className={inputCls} style={inputStyle} rows={6} value={form.content}
          placeholder="写下具体的经过和你的做法。例如：就诊科室与流程、康复训练的安排、放化疗期间的饮食与护理注意点…"
          onChange={(e) => upd("content", e.target.value)} />
      </Field>
      <label className="flex items-start gap-2 text-xs mb-4 cursor-pointer" style={{ color: C.inkSoft }}>
        <input type="checkbox" className="mt-0.5" checked={agree} onChange={(e) => { setAgree(e.target.checked); setErr(""); }} />
        <span>我确认内容不含真实姓名、电话、证件号等隐私信息；我了解发布后本工具的所有使用者都能看到这条内容，且它仅是经验分享、不构成医疗建议。</span>
      </label>
      <div className="flex gap-2 justify-end">
        <Btn variant="ghost" onClick={onCancel}>取消</Btn>
        <Btn disabled={submitting} onClick={submit}>
          {submitting ? <>审核中…</> : <><PenLine size={14} />发布</>}
        </Btn>
      </div>
    </div>
  );
}
function ShareTab({ records, showToast, initialDz }) {
  const [items, setItems] = useState(null);
  const [view, setView] = useState("browse");
  const [cat, setCat] = useState("");
  const [dz, setDz] = useState(initialDz || "");
  const [mineOnly, setMineOnly] = useState(false);
  const [adopted, setAdopted] = useState({});
  const [voted, setVoted] = useState({});
  const [uid, setUid] = useState("");

  useEffect(() => {
    (async () => {
      setUid(await getAnonId());
      setAdopted((await storGetJson("kb-adopted")) || {});
      setVoted((await storGetJson("kb-voted")) || {});
      setItems(await loadKb());
    })();
  }, []);

  const myDx = useMemo(() => {
    const s = new Set();
    records.forEach((r) => (r.dx || []).forEach((d) => s.add(d)));
    return [...s];
  }, [records]);
  const diseases = useMemo(() => {
    const s = new Set();
    (items || []).forEach((i) => (i.diseases || []).forEach((d) => s.add(d)));
    return [...s];
  }, [items]);
  const shown = useMemo(() => {
    let r = items || [];
    if (mineOnly) r = r.filter((i) => adopted[i.id]);
    if (cat) r = r.filter((i) => i.category === cat);
    if (dz === "__mine") r = r.filter((i) => (i.diseases || []).some((d) => myDx.includes(d)));
    else if (dz) r = r.filter((i) => (i.diseases || []).includes(dz));
    return r;
  }, [items, cat, dz, mineOnly, adopted, myDx]);

  const vote = async (id) => {
    if (voted[id] || !uid) return;
    if (!(await storSetRaw(`kbv:${id}:${uid}`, "1", true))) { showToast("网络或共享存储暂不可用"); return; }
    const nv = { ...voted, [id]: true };
    setVoted(nv); storSetJson("kb-voted", nv);
    setItems((p) => p.map((i) => (i.id === id ? { ...i, helpful: (i.helpful || 0) + 1 } : i)));
  };
  const adopt = async (item) => {
    const na = { ...adopted };
    if (na[item.id]) delete na[item.id]; else na[item.id] = { title: item.title, category: item.category, diseases: item.diseases };
    setAdopted(na); await storSetJson("kb-adopted", na);
    showToast(na[item.id] ? "已采纳到我的参考" : "已取消采纳");
  };
  const flag = async (id) => {
    if (!uid) return;
    if (await storSetRaw(`kbf:${id}:${uid}`, "1", true)) showToast("已收到反馈，多人举报后将自动隐藏");
    else showToast("操作失败，请稍后再试");
  };

  return (
    <div>
      <div className="text-xs mb-4 px-3 py-2.5 rounded-sm" style={{ background: "#EFF3EE", color: C.inkSoft, lineHeight: 1.7 }}>
        这里是病友间的经验互助区：就医经验、康复方法、治疗期护理、指南要点。所有内容仅供参考，<span style={{ color: C.seal }}>不能替代医生的判断</span>；重大治疗决策请与主治医生确认。你的病历数据不会随分享外泄。
      </div>
      {!storageCapabilities.sharedIsGlobal && (
        <div className="text-xs mb-4 px-3 py-2.5 rounded-sm" style={{ background: "#FBF3E4", color: "#8A6A2F" }}>
          当前为独立部署：分享内容仅保存在本机浏览器，未接入多人同步后端；接入方式见 README。
        </div>
      )}
      {view === "publish" ? (
        <KbPublish myDx={myDx} uid={uid} showToast={showToast}
          onCancel={() => setView("browse")}
          onPublished={(item) => { setItems((p) => [item, ...(p || [])]); setView("browse"); }} />
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 items-center mb-4">
            <Chip active={!cat} onClick={() => setCat("")}>全部</Chip>
            {KB_CATS.map((c) => <Chip key={c} active={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}
            <select className="px-2.5 py-1.5 text-xs rounded-full bg-white" style={{ border: `1px solid ${C.line}`, color: C.inkSoft }}
              value={dz} onChange={(e) => setDz(e.target.value)}>
              <option value="">全部疾病</option>
              {myDx.length > 0 && <option value="__mine">与我相关</option>}
              {diseases.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <Chip active={mineOnly} onClick={() => setMineOnly(!mineOnly)}>我采纳的</Chip>
            <span className="flex-1" />
            <Btn className="!px-3.5 !py-1.5" onClick={() => setView("publish")}><PenLine size={13} />分享经验</Btn>
          </div>
          {items === null ? (
            <div className="text-sm py-10 text-center" style={{ color: C.inkSoft }}><Spinner /> <span className="ml-2">正在加载病友分享…</span></div>
          ) : shown.length ? (
            shown.map((i) => (
              <KbCard key={i.id} item={i} voted={!!voted[i.id]} adopted={!!adopted[i.id]}
                onVote={() => vote(i.id)} onAdopt={() => adopt(i)} onFlag={() => flag(i.id)} />
            ))
          ) : (
            <Empty text={mineOnly ? "你还没有采纳过任何经验。浏览时点「采纳」，就会收进这里。"
              : "这个筛选条件下还没有分享。做第一个分享经验的人，可能正好帮到下一位病友。"}
              actionText={mineOnly ? undefined : "分享经验"} onAction={() => setView("publish")} />
          )}
        </>
      )}
    </div>
  );
}

export { ShareTab, KbSourceBadge, KB_CATS };
