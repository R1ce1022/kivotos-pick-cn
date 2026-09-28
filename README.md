# 基辅托斯选择器（国内镜像复刻版）

[blue-archive-pick.vercel.app/favorite-students](https://blue-archive-pick.vercel.app/favorite-students) 的简体中文复刻：
从 15 个学院里各挑一名最喜欢的《蔚蓝档案》学生，填满选择板后一键保存成图片。

纯静态站点，无需后端、无需数据库、无需登录。

**在线地址：<https://r1ce1022.github.io/kivotos-pick-cn/>**
最爱学生页：<https://r1ce1022.github.io/kivotos-pick-cn/favorite-students/>

选择板（未选择 / 已选择）：

![选择板空状态](docs/docs-board-empty.png)

![选择板已填充](docs/docs-board-filled.png)

导出的图片（版式照原站的「选择表」，手机与电脑出图完全一致）：

![导出结果](docs/docs-export.png)

---

## 一、这个复刻做了什么

| 功能 | 实现情况 |
| --- | --- |
| 15 个学院槽位（每学院选 1 人） | ✅ |
| 拖拽学生卡到学院格（桌面端） | ✅ |
| 移动端点选：先点学生，再点学院格 | ✅ |
| 每格「选择学生」弹窗 + 跨学院搜索 | ✅ |
| 学生总列表：学院标签筛选 + 搜索 | ✅ |
| 老师名字输入 + 已选进度（0/15） | ✅ |
| 一键重置 | ✅ |
| 导出 PNG（含标题、进度、学生头像） | ✅ 2 倍像素密度，**手机与电脑出图完全一致** |
| 响应式（桌面 / 平板 / 手机） | ✅ 320px 起无横向溢出 |
| 首页（原站有 `/top-nine`、`/bingo`） | ⚠️ 本期只做 `/favorite-students` |

原站是韩文界面，本复刻为**简体中文**，学生名使用 SchaleDB 官方简中译名。
整站配色与导出模板对齐原站（浅色青蓝），但界面文案为中文、版式按中文阅读习惯微调，
不追求逐像素还原。

### 导出模板

导出版式照原站的「选择表」做法，而不是屏幕版选择板的截图：

```
标题区    KIVOTOS PICK → 「X 老师的 / 学院最爱学生」 → 副标题 → 青色下边框
网格      5 列 × 3 行，每格 = 校徽 → 头像(1:1) → 学生名 → 学院名
          头像顶部有一条该学院的强调色横条
页脚      左「KIVOTOS PICK」/ 右「我的基辅托斯选择表」
```

画幅 1000px 宽（导出 2 倍 = 2000px），配色取自原站：
底色 `#f7fbfd`、主色 `#1ba9e4`、正文 `#17283e`、次要 `#536c7e`。

15 个学院的强调色从原站提取，定义在 `scripts/academies.mjs` 的 `accent` 字段。

> 校徽素材是白色透明底，浅色背景上不可见，导出模板里用
> `filter: brightness(0) saturate(100%)` 压成深色。

### 导出一致性（重要设计约定）

**同一份选择，无论在手机还是电脑上点「保存图片」，生成的 PNG 逐像素完全相同**（实测差异 0 像素）。

实现方式：`CaptureBoard` 组件渲染两份——

- 屏幕上一份跟随设备断点（手机上选择板 2 列，观看更舒适）；
- 离屏一份（`.exportStage`，固定 1000px 宽）专供截图，尺寸被 CSS 锁死。

截图目标是离屏那份，因此出图不随设备变化。需要注意的坑：

1. 响应式断点依据**视口**宽度而非元素宽度，所以所有断点规则都要带
   `:not(.xxxExport)`，且后代元素需用 `.exportStage .xxx` 提高权重覆盖，
   详见 CSS 里的「导出几何锁定」块。
2. 不要用 `vw` 单位——它跟的是视口，手机上会算出更小字号并改变行高；
   导出节点内必须用固定值。
3. `1fr` 的解析依赖可用宽度，而桌面有滚动条、手机没有，会差一个滚动条宽度；
   导出节点用 `scrollbar-gutter: stable` 恒定预留，出图因此确定。

---

## 二、技术栈与结构

- **Next.js 16**（App Router + Turbopack）+ **React 19** + **TypeScript**
- **CSS Modules**，无 UI 框架依赖
- `html-to-image` 负责导出图片
- `next.config.ts` 里 `output: 'export'`，构建产物是纯静态的 `out/`

```
app/
  layout.tsx                          根布局
  page.tsx                            首页（三个模式入口）
  favorite-students/
    page.tsx                          主页面（全部交互逻辑）
    CaptureBoard.tsx                  选择板（live / export 双形态）
    favorite-students.module.css       页面样式（含导出几何锁定）
data/
  students.json                       构建时内联进页面的学生数据
types/students.ts                     类型定义
lib/students-data.ts                  数据加载
scripts/                              抓取与验证脚本（见下）
public/
  assets/students/*.webp              学生头像（333 张）
  assets/schools/*.png                学院校徽（15 个）
  favicon.svg / favicon.ico
```

**页面数据是构建时内联的**，这一点和原站一致（原站 244 KB HTML 里直接带数据，没有任何 `/api` 调用），所以运行时不发数据请求。

---

## 三、本地运行

```bash
npm install

# 首次需要先准备数据与素材（约 4 MB 下载）
npm run prepare:all

npm run build
npm run preview          # http://127.0.0.1:4173
```

开发模式：`npm run dev`

### 数据管线

`npm run prepare:all` 依次执行四步：

| 命令 | 作用 |
| --- | --- |
| `npm run fetch:data` | 下载 SchaleDB 简中学生数据到 `scripts/.cache/` |
| `npm run align` | 抓原站页面，用韩文数据反查，得出原站收录的学生 id 集合 |
| `npm run fetch:assets` | 下载学生头像 / NPC 头像 / 学院校徽到 `public/` |
| `npm run build:data` | 生成 `data/students.json` |

> `.cache/` 与 `.shots/` 已在 `.gitignore` 中，不会入库。

### 验证

```bash
npm run build
npm run preview &        # 另开一个终端
npm run verify           # 截图 + 交互测试 + 导出测试
```

`npm run verify` 会用本机 Chrome 跑一遍真实交互，并把截图写到 `scripts/.shots/`。
它验证：拖拽投放、同一学生换学院时自动从原格移除、标签页下的跨学院搜索、韩文别名搜索、导出图片。

另外三个针对部署与移动端的验证：

```bash
npm run verify:mobile   # 320–768px 无溢出、弹窗不裁切、触屏交互、移动端导出
npm run verify:parity   # 桌面与移动各导出一次并逐像素比对（必须 0 差异）
npm run verify:pages    # 子路径产物校验，用法：npm run verify:pages /kivotos-pick-cn 4180
node scripts/verify-live.mjs   # 线上验收：资源 + 渲染 + 交互 + 导出
```

### 其他脚本

| 脚本 | 用途 |
| --- | --- |
| `scripts/make-favicon.mjs` | 手写 PNG/ICO 编码生成 `favicon.ico`（无图像库依赖） |
| `scripts/serve-out.mjs` | 预览 `out/` 的极简静态服务器（根路径） |
| `scripts/serve-basepath.mjs` | 模拟子路径部署的预览服务器，如 `/kivotos-pick-cn/` |
| `scripts/verify-basepath.mjs` | 校验子路径产物里所有引用是否可命中 |
| `scripts/verify-mobile.mjs` | 移动端适配验收 |
| `scripts/verify-export-parity.mjs` | 跨设备导出一致性（像素级） |
| `scripts/verify-live.mjs` | 线上验收（资源 + 渲染 + 交互 + 导出） |
| `scripts/resize-image.mjs` | 缩放/裁剪截图，便于查看超长页面 |

---

## 四、学生数据是怎么对齐的

原站选择列表共 **204 张卡片**。复刻的集合是完全对齐推导出来的：

| 组成 | 数量 | 中文名来源 | 头像来源 |
| --- | --- | --- | --- |
| 基础学生 | 144 | SchaleDB 简中，**官方译名** | SchaleDB CDN |
| 剧情 NPC | 56 | **人工整理**（见下） | 镜像源 |
| 联动角色 | 4 | — | 镜像源，仅补素材、不进选择列表 |
| **合计** | **204** | | |

推导过程：

1. SchaleDB 简中全表 277 人；
2. 排除 **129 个换装变体**（名字含 `（…）`，如「白子（骑行）」）；
3. 排除 **4 个联动角色**（御坂美琴、食蜂操祈、初音未来、佐天泪子）；
4. 剩下 144 人，与原站名单的 id **完全一致**；
5. 原站另有 56 个剧情 NPC（`npc-arona`、`npc-rin`…），SchaleDB 的 students 表**不收录**这些人，头像也不在其 CDN 上，因此中文名写在 `scripts/academies.mjs` 的 `NPC_STUDENTS` 表里。

### 关于 NPC 中文名（需要留意）

56 个 NPC 的中文名是**按社区通行译名人工填写的**，不是官方数据源，可能与国服最终译名存在差异。
如需修正，只改 `scripts/academies.mjs` 里的 `NPC_STUDENTS` 一处，然后重新执行 `npm run build:data && npm run build` 即可。

举例：`npc-false-president` → 「冒牌学生会长」，`npc-smiling-professor` → 「笑眯眯教授」。

### 搜索

搜索支持**中文名 + 韩文名 + 英文名**（别名来自 SchaleDB 的韩文名与 `DevName`），例如搜「白子」或「시로코」都能命中。

有关键词时搜索会**跨全部学院**，不受当前标签页限制——否则用户在「三一」标签下搜「白子」会得到空结果。

---

## 五、部署

`npm run build` 产出的 `out/` 是纯静态文件，扔到任何静态托管即可（Nginx、对象存储、Vercel、GitHub Pages…）。

### 当前部署（GitHub Pages）

已通过 `.github/workflows/deploy.yml` 自动部署：推送到 `main` 即触发构建与发布。

```
https://r1ce1022.github.io/kivotos-pick-cn/
```

仓库的 **Settings → Pages → Source** 必须设为 **GitHub Actions**，否则工作流会在
`actions/configure-pages` 这一步失败。这是新仓库的默认关闭项，需要手动开启一次。

### 子路径部署的注意事项（踩过的坑）

Pages 项目页部署在 `/<仓库名>/` 子路径下，而 Next 只会给它自己生成的 `/_next/...`
自动加 `basePath`。以下三类路径必须自己处理，否则部署后 404：

| 位置 | 处理方式 |
| --- | --- |
| `students.json` 里的 `/assets/...` | `lib/students-data.ts` 按 `NEXT_PUBLIC_PAGES_BASE_PATH` 加前缀 |
| `public/` 下的 favicon | `app/layout.tsx` 手动加前缀 |
| 返回首页的原生 `<a href="/">` | 改用 `BASE_PATH` 拼接（`next/link` 会自动处理，原生标签不会） |

构建时通过两个环境变量控制（见工作流）：

- `PAGES_BASE_PATH` → 供 `next.config.ts` 设置 `basePath`（构建期路径重写）
- `NEXT_PUBLIC_PAGES_BASE_PATH` → 供运行时数据使用

> ⚠️ 必须带 `NEXT_PUBLIC_` 前缀。非该前缀的 `process.env.*` 不会被打包器内联进
> 客户端代码，会导致「服务端渲染的 HTML 路径正确、客户端水合后变回无前缀」的
> 不一致：首屏看起来正常，一旦发生状态更新（选人、拖拽、搜索）图片就 404，
> 导出功能随之卡死。

本地预览不受影响：这两个变量不设置时路径保持根路径，`npm run preview` 照常工作。

### 通用注意点

- **素材已全部本地化**：头像与校徽都在 `public/` 下随产物发布，运行时不依赖 SchaleDB 或原站，国内访问无跨境依赖。`out/` 约 4.5 MB，共 382 个文件。
- **其它子路径托管**：若换到别的子路径，改工作流里的两个环境变量值即可，源码无需改动。

---

## 六、版权与来源声明

- 本页是**非官方同人作品**，与 Nexon /《蔚蓝档案》官方无关。
- 学生资料与头像取自 [SchaleDB](https://schaledb.com)，角色与美术资源版权归 **Nexon** 所有。
- 原本的韩文站点为 [blue-archive-pick.vercel.app](https://blue-archive-pick.vercel.app/favorite-students)。
  其中 12 个学院校徽来自 SchaleDB 官方仓库 `images/schoolicon/`；
  **海兰德 / 狂猎 / 奥德赛 / 学生总会** 这 4 个较新学院的校徽与全部 NPC 头像，SchaleDB 尚无对应资源，取自原站镜像，仅用于非商业的同人复刻。
- 本项目代码为独立实现，未复制原站代码。
- 建议仅作个人学习与交流使用。

---

## 七、已知限制

- 只实现了 `/favorite-students` 一个页面；原站的 `/top-nine` 与 `/bingo` 未做（首页已标注「待开发」）。
- 56 个剧情 NPC 的中文名为人工映射，非官方译名。
- 导出图片用 `html-to-image` 前端合成，超大画布在低端手机上可能较慢（本页 15 格规模实测约 1–2 秒）。
- 拖拽依赖 HTML5 Drag & Drop，触屏设备走「点选」路径而非拖拽（与原站策略一致）。
