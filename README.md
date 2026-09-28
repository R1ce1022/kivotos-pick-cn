# 基辅托斯选择器（国内镜像复刻版）

[blue-archive-pick.vercel.app/favorite-students](https://blue-archive-pick.vercel.app/favorite-students) 的简体中文复刻：
从 15 个学院里各挑一名最喜欢的《蔚蓝档案》学生，填满选择板后一键保存成图片。

纯静态站点，无需后端、无需数据库、无需登录。

选择板（未选择 / 已选择）：

![选择板空状态](docs/docs-board-empty.png)

![选择板已填充](docs/docs-board-filled.png)

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
| 导出 PNG（含标题、进度、学生头像） | ✅ 2 倍像素密度 |
| 响应式（桌面 / 平板 / 手机） | ✅ |
| 首页（原站有 `/top-nine`、`/bingo`） | ⚠️ 本期只做 `/favorite-students` |

原站是韩文界面，本复刻为**简体中文**，学生名使用 SchaleDB 官方简中译名。

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
    favorite-students.module.css       页面样式
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

### 其他脚本

| 脚本 | 用途 |
| --- | --- |
| `scripts/make-favicon.mjs` | 手写 PNG/ICO 编码生成 `favicon.ico`（无图像库依赖） |
| `scripts/serve-out.mjs` | 预览 `out/` 的极简静态服务器 |
| `scripts/resize-image.mjs` | 缩放/裁剪截图，便于查看超长页面 |
| `scripts/inspect-schaledb.mjs` | 勘察 SchaleDB 数据结构（一次性） |
| `scripts/derive-selection.mjs` | 反推原站收录规则（一次性） |
| `scripts/probe-npc-icons.mjs` | 探测头像可取性（一次性） |
| `scripts/debug-drag.mjs` | 拖拽行为的定点测试 |

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

两个注意点：

1. **子路径部署**：如果站点不在域名根目录（例如 `https://example.com/ba/`），需要在 `next.config.ts` 里设置 `basePath: '/ba'`，否则资源路径会 404。
2. **素材已全部本地化**：头像与校徽都在 `public/` 下随产物发布，运行时不依赖 SchaleDB 或原站，国内访问无跨境依赖。
   `out/` 约 4.5 MB，共 382 个文件。

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
