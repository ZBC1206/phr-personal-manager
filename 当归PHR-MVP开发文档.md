# 个人病历自主管理工具（MVP）开发文档

版本 v0.4 · 2026-07 · 基于 OMAHA「当归」个人健康档案文件格式规范 v1.0（https://github.com/ChinaOMAHA/Angelica-PHR）

---

## 1. 项目概述

面向个人的病历自主化管理工具，让用户把散落的纸质/图片病历汇聚为一份属于自己的、可携带、可溯源的个人健康档案（PHR）。MVP 包含三个业务模块，并以 `.phr` 文件格式规范作为数据收口：

| 模块 | 职责 | 产出 |
|---|---|---|
| M1 智能解析 | 上传病历/检验检查报告图片，AI 结构化抽取，人工确认后入档 | 符合 content.xsd 语义的结构化健康记录 |
| M2 病程时间轴 | 以患者病程为轴聚合健康事件，检验指标跨记录趋势 | 时间轴视图 + 指标趋势图 |
| M3 个人知识图谱 | 疾病—症状—药物—指标—检查—机构六类实体及关系，每条关系可溯源到原始记录 | 交互式图谱视图 |
| 导出 | 将档案打包为符合规范的 `.phr` 容器文件 | `.phr` 文件（ZIP 容器） |

### 1.1 能力边界（明确不做）

不做数字签名（signatures.xml，依赖 CA 体系）与包级加密（encryption.xml）；不做 ICD-10/LOINC 术语编码映射（自由文本 + 标签）；不提供任何诊断建议、风险预测或治疗推荐——工具只做整理、呈现、溯源；不做多人档案、机构数据同步、可穿戴设备接入。

### 1.2 形态说明

MVP 交互原型为**纯前端单页应用**（浏览器内运行，数据本地持久化，AI 解析走模型 API），用于业务验证。本档同时给出**生产形态的前后端分离架构**（第 4 章），两者共用同一份数据模型（第 2 章），前端可平滑迁移。

---

## 2. 统一数据模型（内核）

内部记录对象严格映射 content.xsd 的 `record` 元素，并扩展 MVP 业务明细字段。三个模块共用这一份模型，不做二次转换。

```json
{
  "recordId": "小写 UUID v4",
  "recordTitle": "血常规检验报告",
  "recordType": "检验报告",
  "eventStart": "2026-03-01T09:30:00",
  "provider": "XX市人民医院",
  "summary": "≤60字摘要",
  "tags": ["血常规", "贫血"],
  "recordCreateTime": "ISO dateTime",

  "labs": [{ "n": "血红蛋白", "v": "96", "u": "g/L", "r": "115-150", "ab": "↓" }],
  "dx": ["缺铁性贫血"],
  "rx": [{ "n": "琥珀酸亚铁片", "d": "0.1g tid po" }],
  "sx": ["乏力", "头晕"],
  "ex": ["胸部CT"],

  "processing": {
    "algorithm": "claude-sonnet-4-6",
    "algorithmVersion": "messages-api",
    "processedTime": "ISO dateTime",
    "confidence": 0.92
  },
  "image": "data:image/jpeg;base64,...（压缩后原件，可为空）"
}
```

规范对齐要点：`recordType` 严格取七类枚举（门诊记录/住院记录/检验报告/检查报告/处方单/体检报告/其他）；AI 产物在导出时落为 `generationMode=算法推导` 的 component，并完整写入 `processingInfo`（算法、版本、处理时间、置信度），实现规范要求的算法溯源；原始图片作为 `attachment`，`submitterType=个人及监护人`、`submissionMethod=手动录入`，并通过 `sourceRef` 建立"结构化内容 ← 原始文件"的引用链。

### 2.1 知识图谱模型（由记录确定性推导，不额外调用模型）

| 节点类型 | 来源字段 | 关系（边） |
|---|---|---|
| 疾病 | dx | — |
| 症状 | sx | 症状 —提示→ 疾病 |
| 药物 | rx | 药物 —治疗→ 疾病 |
| 检验指标（异常） | labs 中 ab≠"" | 指标 —检出异常→ 疾病 |
| 检查项目 | ex | 检查 —评估→ 疾病 |
| 医疗机构 | provider | 疾病 —就诊于→ 机构 |

每个节点与每条边均携带 `recordIds` 集合，任意图谱元素可点击回溯到原始记录——把规范的可溯源精神落到图谱层。图谱由结构化记录确定性推导，保证幂等与可解释，避免二次模型调用引入的不一致。

---

## 3. 前端设计

### 3.1 技术栈

React 18（单文件组件，Hooks 状态管理，不引入 Redux）；recharts 绘制指标趋势；SVG + 自研轻量力导向布局绘制知识图谱（约 60 行，避免引入重型依赖）；浏览器 `crypto.subtle` 计算 SHA-256；纯 JS store-only ZIP 写入器（约 90 行，含 CRC-32）生成 `.phr`；本地持久化存储（MVP 用宿主提供的 key-value storage，生产形态替换为后端 API）。

### 3.2 页面与信息架构

```
顶栏（档案主体姓名 · 记录数）
├── Tab1 档案     记录列表（按时间倒序，可删除、查看原图）
├── Tab2 上传解析  上传 → 压缩预览 → AI解析(loading) → 人工确认表单(可编辑) → 入档
├── Tab3 病程时间轴 疾病筛选chips + 垂直时间轴(按年分组) + 指标趋势图(下拉选指标)
├── Tab4 知识图谱  力导向图 + 图例 + 节点详情侧栏(关联关系与来源记录)
└── Tab5 档案设置  主体信息(仅姓名/性别/出生日期) + 导出 .phr
页脚：免责声明（仅整理呈现，不提供诊疗建议）
```

### 3.3 关键流程：上传解析（M1）

```
选择图片 → canvas 压缩(最长边≤1400px, JPEG q0.8)
        → 调用模型 API（视觉输入 + 强约束 JSON 抽取 prompt，枚举内嵌）
        → 解析响应（剥离 markdown 围栏，JSON.parse，枚举校验回落"其他"）
        → 人工确认页：全字段可编辑，检验指标表格可增删行，显示置信度
        → 确认入档（生成 UUID，写入持久化存储）
```

设计原则：模型输出**永不直接入档**，人工确认是强制环节；抽取 prompt 明确要求"识别不清留空、不得编造"；置信度与算法元数据随记录保存，供导出时写入 processingInfo。

### 3.4 状态与存储

| 存储键 | 内容 |
|---|---|
| `subject` | 主体信息 JSON（姓名、性别码、出生日期） |
| `rec:{recordId}` | 单条记录 JSON（含压缩图片，控制在存储单键上限内） |

记录采用一键一记录，启动时按前缀 `rec:` 枚举加载；所有存储操作 try/catch 并给出界面级错误提示。

### 3.5 视觉方向

以"病历本/化验单"的纸面语言为母题：档案纸白底、墨蓝正文、灰绿表格线；异常指标用印章红的 ↑/↓ 标记（偏低用青蓝 ↓），是页面唯一的强调色；标题用衬线宋体、检验数值用等宽字体。克制动效，移动端可用。

---

## 4. 后端设计（生产形态）

MVP 原型不含后端；以下为业务验证通过后的落地架构，接口与数据模型与前端原型一一对应。

### 4.1 技术栈与部署

FastAPI（Python 3.12）+ PostgreSQL 16（JSONB 存业务明细）+ 对象存储（MinIO/OSS，存原始影像原件）+ Redis（任务队列 broker）+ Celery（异步解析流水线）。单机 docker-compose 起步，无状态服务水平扩展。鉴权用短信/邮箱验证码登录 + JWT；全链路 TLS；对象存储桶私有化，影像访问走后端签发的短时效 URL。

### 4.2 数据库模型

```sql
users(id uuid pk, phone, created_at)
subjects(id uuid pk, user_id fk, name, gender_code, birth_date)          -- 一用户一主体(MVP)
records(
  id uuid pk, subject_id fk,
  record_title text, record_type text CHECK (七类枚举),
  event_start timestamptz, event_end timestamptz,
  provider text, summary text, tags text[],
  detail jsonb,                -- labs/dx/rx/sx/ex 结构化明细
  processing jsonb,            -- algorithm/version/processedTime/confidence
  created_at, updated_at
)
attachments(id uuid pk, record_id fk, object_key text, mime text, sha256 text, size bigint)
parse_jobs(id uuid pk, subject_id fk, object_key text,
           status text CHECK(pending|running|awaiting_review|confirmed|failed),
           draft jsonb, error text, created_at)
```

`parse_jobs.status=awaiting_review` 对应前端人工确认环节：草稿在确认前只存在于 job，确认后才写入 `records`，与前端"模型输出永不直接入档"原则一致。

### 4.3 API 接口清单（REST，前缀 /api/v1）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /auth/code · /auth/login | 验证码与登录 |
| GET/PUT | /subject | 主体信息读写 |
| POST | /uploads | 上传影像，返回 object_key |
| POST | /parse-jobs | 提交解析任务 {object_key}，返回 job_id |
| GET | /parse-jobs/{id} | 轮询任务：pending/running/awaiting_review(含 draft)/failed |
| POST | /parse-jobs/{id}/confirm | 提交人工修订后的草稿，落库为正式记录 |
| GET | /records?type=&tag=&from=&to= | 记录列表（分页、过滤） |
| GET/PUT/DELETE | /records/{id} | 记录详情/修订/删除 |
| GET | /records/{id}/image | 原始影像短时效签名 URL |
| GET | /timeline | 时间轴聚合（按病程分组 + 指标序列） |
| GET | /graph | 知识图谱 nodes/edges（服务端推导，同 2.1 规则） |
| POST | /export/phr | 服务端打包 .phr，返回下载 URL |

### 4.4 解析流水线（Celery worker）

```
入队 → 拉取影像 → 预处理(方向校正/压缩) → 调用视觉大模型结构化抽取
     → 枚举与格式校验(pydantic) → 写 draft，status=awaiting_review
     → (用户确认) → 落库 records + attachments，记录 processing 元数据
失败重试 ≤2 次；模型名与版本从配置读取，随结果持久化，保证 processingInfo 可回溯。
```

### 4.5 .phr 导出服务

服务端组包与前端原型逻辑一致（见第 5 章），Python 侧用 `zipfile`（ZIP_STORED 写入 mimetype 为首条目）+ `lxml` 生成并按 XSD 校验四个 XML，SHA-256 写入 manifest。导出前强制 XSD 校验，不合规即失败并报具体元素路径。

---

## 5. .phr 容器组包规范（前后端共用约定）

```
example.phr (ZIP 容器)
├── mimetype                      # 首条目、不压缩，内容 application/phr+zip
├── manifest.xml                  # 除 mimetype、signatures.xml 及自身外全部文件条目
│                                 #   fileType/path(以/开头)/size/checksum/checksumType=SHA-256
├── meta.xml                      # title/creator/createTime/formatVersion=1.0
├── subject.xml                   # personalinfo: name(必填)/genderCode/birthTime
├── content.xml                   # contentVersion=1.0 + records（元素顺序严格按 XSD）
└── record/{recordId}/
    ├── content.json              # component: generationMode=算法推导 + processingInfo + sourceRef
    └── attachment/source.jpg     # attachment: 个人及监护人/手动录入
```

实现注记：规范原文要求 manifest 记录"除 mimetype 和 signatures.xml 外"的条目；manifest 自身哈希存在自引用悖论，本实现参照 ODF 惯例将 manifest.xml 一并排除，此点已在文档显式声明。所有 XML 使用命名空间 `https://www.omaha.org.cn/standard/phr/v1.0`；dateTime 一律 `YYYY-MM-DDThh:mm:ss`；`record` 子元素顺序严格遵循 content.xsd 的 sequence 定义。

---

## 6. 安全与隐私

数据最小化：主体信息仅收姓名/性别/出生日期，不收证件号、电话、地址；MVP 数据仅存本地，导出由用户主动发起；生产形态影像与结构化数据加密存储（存储层 AES-256），传输 TLS，影像 URL 短时效签名；解析调用大模型时仅传影像与抽取指令，不附加身份字段；删除记录同步删除影像对象（软删 30 天后物理清除）。

---

## 7. 测试与验收清单

| 项 | 验收标准 |
|---|---|
| 解析 | 检验单/门诊病历/处方三类样张抽取字段可用；识别不清字段为空而非编造；枚举外类型回落"其他" |
| 确认环节 | 所有字段可编辑；未确认不入档；指标行可增删 |
| 时间轴 | 记录按 eventStart 排序；疾病筛选正确；同名指标≥2 条时趋势图可用，参考范围带渲染 |
| 图谱 | 节点/边与推导规则一致；任一元素可回溯来源记录 |
| .phr 导出 | `unzip -t` 通过；mimetype 为首条目且未压缩；manifest 中 SHA-256 与实际文件一致；四个 XML 通过官方 XSD 校验 |
| 边界 | 全站无诊断/建议类文案；免责声明常驻 |

## 8. 里程碑

M0 前端交互原型（已交付）→ M0.3 双层模板 + M4 病友分享（已交付）→ M0.4 交互重构（本次交付）→ M1 后端 API + 解析流水线（2 周）→ M2 XSD 严格校验 + .phr 导入回读（1 周）→ M3 术语编码映射与多档案（规划中）。


---

## 9. 双层结构：内容模板注册表（v0.3 新增）

借鉴 openEHR 的双层建模思想：**信封层**（record 结构、容器封装、溯源机制，对齐 content.xsd）保持稳定，**内容语义层**由模板注册表以纯数据承载。每个模板包含四要素：`code/name/version`（身份）、`promptHint`（该类单据的抽取重点，动态注入解析 prompt）、`sections`（核对表单的字段渲染顺序）、`graph`（该模板参与图谱推导的实体门控）。七类记录类型各配一个 v1.0 模板；新增或调整单据类型只需修改注册表数据，解析、表单、图谱三处自动跟随，代码不动。

记录在入档时固化模板快照（code+name+version），导出时写入规范预留的 `component/template` 元素（属性 code / codeSystem / codeSystemName）；历史记录无快照时按 recordType 回退到当前模板。**实现注记**：codeSystem 暂用自声明标识 `urn:angelica-phr:mvp-templates`，生产化时应向标准组织申请正式 OID；生产形态增加 `templates(code pk, version, schema jsonb, prompt_hint, sections jsonb, graph_rules jsonb)` 表，记录表以 code+version 关联，模板演进不迁移旧数据。与 openEHR 生态互操作时，在模板层做一张"本模板 ↔ openEHR 原型 / FHIR 资源"映射表即可，无需引入 ADL/AQL 全栈。

## 10. M4 · 病友知识分享（v0.3 新增）

**定位与边界**：病友间的经验互助区（就医经验/康复经验/治疗护理/指南要点四类），所有内容仅供参考、不构成医疗建议；不做评论区；用户病历数据永不随分享外泄；采纳的经验仅存本地、不进入 .phr 导出。

**数据模型**：分享条目 `kb:{id}`（共享存储，全体用户可见），含分类、疾病标签、来源类型（患者经验 / 指南·权威资料——后者强制填出处）、审核结论快照；互动为独立共享键 `kbv:{id}:{uid}`（有用）与 `kbf:{id}:{uid}`（举报），计数由键枚举聚合，规避并发覆盖；`uid` 为本地匿名标识。采纳列表存本地 `kb-adopted`。

**安全机制**：发布前强制经过 AI 三级审核——block（鼓动停药或以偏方替代正规治疗、指令性剂量方案、他人隐私、辱骂、广告导流：拦截并返回原因与修改建议）/ warn（涉及个人治疗细节但仅陈述自身经历、对医院医生的主观评价：放行并附"谨慎参考、勿自行照做"提示）/ ok。发布需勾选隐私与可见性知情确认；≥3 人举报自动隐藏。**生产形态**：`kb_posts / kb_votes / kb_flags` 三表 + 审核流水线（模型初审入库 pending，warn/block 进人工复核队列），举报处置留痕。

**验收追加**：拦截样例（"停掉化疗改吃××"）必须 block 且给出修改建议；指南类未填出处不可提交；未勾选知情确认不可提交；举报 3 次后条目对全体隐藏。


## 11. v0.4 交互重构：从记录陈列到认知生成

**M2 病程时间轴（横向泳道图）**：以疾病为泳道、时间为横轴，记录收敛为可点击标记（异常记录印章红、住院手术方形、常规墨蓝），多诊断记录同时落在多条泳道；同期密集记录自动上下错位；点击标记才展开详情，实现"可视化优先、按需展开"。横轴按月等比布局，年份刻度贯穿泳道，无时间记录单独提示数量。

**M3 由实体图谱重构为疾病演进路径**：按疾病梳理事件链，阶段（健康筛查/首次诊断/门诊诊疗/治疗用药/随访监测/检查评估/住院手术）由模板层新增的 stage 字段驱动——双层结构的再次复用，调整阶段划分只改模板数据。路径下方自动生成三卡现状整理（在用方案 / 关键指标最近值与环比方向 / 随访间隔，超半年标红）与"可沟通信息"段（首末指标对比、随访核对提醒），措辞严格保持"整理事实"口径。原实体共现图谱经评估移除：共现关系信息密度低于演进路径，后者直接服务"产生个人知识、引导行动"。

**M4 与演进视图打通**：每条病程下方自动匹配该疾病的分享（指南要点优先、按有用数排序，取前四条），可就地采纳（与分享区共用本地采纳存储、双向同步），并可携带疾病筛选一键跳转分享区。

**验收追加**：多诊断记录出现在每条相关泳道；首个门诊/住院事件标记"首次诊断"；随访间隔≥6个月提示变红；演进页采纳后分享区同步显示已采纳。
