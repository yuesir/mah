# 🀄 Mah 项目摸底报告

`Mah` 是一款开源 HTML5 **麻将接龙（Mahjong Solitaire / 上海麻将）**游戏，作者 ffalt，MIT 许可证，当前版本 **v1.19.3**。这不是中国传统 4 人麻将，而是单人配对消除类游戏。支持 Web、桌面（Tauri）和 Android。

## 一、技术架构

### 技术栈
- **框架**：Angular 22（standalone components，无 NgModules，无 Router，单页应用）
- **语言**：TypeScript 6（`strict: true` 全开），ES2022
- **状态管理**：**可变 Model 对象**（`Game` / `Board` / `Settings`），由 `AppService` 持有；新组件局部用 signals，无 NgRx
- **构建**：自定义 builder `@mah/builders`（位于 `tools/builders`），底层 `@angular/build`；AOT；SCSS；Web Worker 单独 tsconfig
- **测试**：Vitest 4 + Analog.js Angular 插件，jsdom，覆盖率 v8
- **原生壳**：Tauri v2（macOS/Windows/Linux/Android）
- **其他**：`@ngx-translate`（37 语言）、`canvas-confetti`（胜利彩纸）、`zzfx`（音效）、RxJS 7

### 目录结构
```
src/app/
├── app.component.*         # 根组件（无 Router，监听快捷键 / URL 参数 ?mah= / ?board=）
├── components/             # 20+ 组件（board, game, settings, dialog, help, tutorial,
│                           #   choose-layout, editor, icons 等）
├── service/                # AppService（门面）、LocalStorage、Layout、Worker、Pattern、Svgdef
├── model/                  # 核心规则与生成算法
│   ├── board.ts, game.ts, stone.ts, tiles.ts, consts.ts, types.ts
│   ├── builder/            # 可解牌局生成 + 随机生成 + 载入
│   ├── solver/             # Michiel de Bondt mjsolver 移植（可解性判定）
│   └── random-layout/      # 种子化 144 张随机布局生成
├── worker/                 # solve / stats-solve Web Worker
├── modules/editor/         # 棋盘编辑器（按 environment.editor 编译开关懒加载）
└── pipes/ directives/ style/
```

### 启动 & 开发
```bash
npm run start              # 开发服务器 → http://localhost:4200/
npm run build:prod         # 生产构建 → dist/
npm run test               # 单元测试
npm run coverage           # 覆盖率
npm run lint               # ng lint + eslint
docker run -d -p 8080:80 ffalt/mah   # 直接跑 Docker
```

### 部署形态（环境文件替换）
- `production` — 纯 Web
- `apps` — Tauri 桌面/移动
- `development` / `development-apps`

### 约束
- **Node ≥ 26**，TypeScript 全 `strict*`
- ESLint：tab 缩进、必须分号、无尾逗号、`complexity ≤ 20`、`max-len 240`、`max-lines 1000`、`max-classes-per-file 2`
- Qlty CI 聚合：eslint/stylelint/biome/oxc/markdownlint/hadolint/checkov/trufflehog/osv-scanner 等

## 二、玩法、规则与限制

### 玩法
经典上海麻将：144 张牌堆成多层立体牌阵，玩家从叠堆顶部、左右两端找出**可自由取出**的成对牌进行消除，目标是清空整盘。

### 核心规则（代码定位）

| 规则 | 位置 | 说明 |
|---|---|---|
| **牌组** | `model/consts.ts` TILES | 37 组基础牌（万/条/筒各 9 组 + 风牌 4 组 + 箭牌 3 组 + 季节 1 组 + 花卉 1 组），每组 4 张 |
| **匹配** | `game.ts:60`、`board.canRemove` | 两张牌 `groupNr` 相同即可匹配。季节（春夏秋冬）与花卉（梅兰竹菊）虽 4 张面不同但同属一组，任意两张都能配 |
| **可取（free）** | `stone.ts:62 isBlocked` | 被上方（z+1）任意牌挡住 → 阻塞；或**左右两侧同时**被相邻牌（x±2，跨 y±1）挡住 → 阻塞；否则自由 |
| **可移除** | `board.ts:106` | 不在 picked、未阻塞、且同组至少还有一张也是自由的 |
| **胜利** | `game.ts:238` | `board.count < 2`（剩余不足 2 张） |
| **失败** | `game.ts:240` | `board.free.length === 0`（无可移除对） |

### 难度（`consts.ts` GameModes）
- **EASY 简单**：洗牌 + 提示 + 撤销 + 死局救援洗牌（最多 10 次）+ 选中时高亮同组可配牌（SHOW_MATCHING）
- **STANDARD 标准（默认）**：提示 + 撤销
- **EXPERT 专家**：无任何辅助

### 棋盘生成（两个核心引擎）
- **SolvableBoardBuilder**（`builder/solvable.ts`）：保证可解。算法 `assignTilePairs` 是"正向打牌"——只在两张牌都自由时才赋予一对，因此该放置顺序本身就是一组解。失败重试最多 2000 次，再用反向组序兜底 10 次，最后退回随机。
- **RandomBoardBuilder**（`builder/random.ts`）：纯随机分配，仅保证开局至少存在一对可移除牌。

### 随机布局生成（`random-layout/`，种子化，mulberry32）
- 目标 **144 张**，网格范围 x∈[0,36]、y∈[0,16]、z∈[0,5]
- 约束：单元唯一、不重叠（任一点 3×3 邻域内不能有同层牌）、z>0 必须满足支撑（正下方 / 小桥 / 大桥）、需多层
- 基础层模式：checker / lines / rings / areas / cross / diamond / triangle / shapes；可 X/Y 镜像
- 种子可分享、可复现

### 求解器（`solver/`，mjsolver 移植）
1. `prune` 上界剪枝（最乐观配对后还剩多少）
2. `randomSolve` 概率性快速试解
3. `sureSolve` 穷举回溯
- 在 Web Worker 中执行，自动终止；失败时同步兜底

### 辅助机制
- **提示 hint**：按 groupNr 分组自由牌，重复调用循环切换（`hintNext`），EXPERT 禁用
- **撤销 undo**：栈式记录配对（每对 2 条），EXPERT 禁用
- **洗牌 shuffle**：保留已消除牌，对剩余牌按当前 buildMode 重建，仅 EASY
- **死局救援**：EASY 下连续洗牌最多 10 次直到出现可移除对

### 持久化（LocalStorage，前缀 `mah.`）
- 游戏状态（可恢复对局）、设置、`score.<layoutId>`（胜负次数、总时长、最佳时间）、自定义棋盘、最后棋盘、镜像偏好
- **随机布局不计入分数**（`isStorableLayoutId`，id 非 `random-` 开头）

### 平台/分发
Web、Docker/nginx、Tauri（dmg/msi/deb/AppImage/apk）。⚠️ macOS/Windows 构建未签名，需用户手动放行。

---

## 三、值得改进的方面（体验提升建议）

按优先级与实现成本排序：

### 🎯 高价值 / 中等成本

1. **首次进入引导更明确**
   现有 tutorial 存在但不是首启强制。可加"首次访问自动弹出 3 步引导"，讲清匹配规则与自由牌判定——后者是新玩家最大障碍。

2. **可取牌视觉强化**
   目前依赖玩家自己判断"是否被压/夹"。可在 EASY 或新增"辅助层"中，对长考超过 N 秒或卡顿操作时**轻微脉冲提示"可点击"的牌**，比 SHOW_MATCHING 更主动，比 HINT 更轻量。

3. **可解性实时显示**
   求解器已存在但只在后台用。可在 EASY/STANDARD 主动给玩家"当前局面是否还有解"的指示灯（无须给出解法），避免专家局"死磕无解局面"的挫败。

4. **撤销/提示等资源可视化**
   EASY 的"死局救援"次数、提示可用次数等没有显式计数器。给玩家可见的"剩余援助"配额，既能降低挫败又保留策略感（参考常见手游的道具栏 UX）。

5. **移动端手势增强**
   README 强调跨平台含 Android，但 board 组件主要是鼠标/滚轮缩放。补充**双指捏合缩放 + 拖拽平移**，以及长按等效 hover（用于 SHOW_MATCHING 预览）。

### 🛠 中等价值 / 低成本

6. **键盘可达性**
   根组件已监听 keydown。可补完整快捷键体系（H=提示、U/Z=撤销、S=洗牌、R=重开、空格=暂停），并在 Help 中列出。

7. **统计面板扩展**
   `Help` 已有单布局统计。可加**全局战绩总览**（胜场/总时长/平均用时/最长连胜）与**最近对局历史**，提升长期粘性。

8. **每日挑战 / 排行种子**
   `generateLayoutSeed` 已支持种子。可加"每日固定种子 + 全球共享"模式（纯本地比拼最佳时间，无需后端，符合项目"无云"理念）。

9. **设置项分组与搜索**
   Settings 已分 tab，但自定义项极多（13 牌面 + 8 背景 + 375 图案 + 14 主题 + 难度/音/语言…）。加搜索框或"收藏"快捷栏会显著降低选择负担。

10. **音效丰富度**
    当前仅 zzfx 程序化音效。可加可选的胜利/连击/season 配对差异化音效（保持 OSS 资产友好，用 zzfx 合成即可）。

### 🧪 高价值 / 较高成本

11. **可解性保障可视化反馈**
    SolvableBoardBuilder 在 2000 次重试仍失败时会退回 RandomBoardBuilder（可能无解）。建议在此 fallback 路径给玩家一个**"本局可能无解，可重开"**的小提示，体现工程诚实。

12. **Editor 流程更平易**
    编辑器按编译开关懒加载（默认关）。考虑内置一个轻量"简单编辑器"或让社区棋盘一键导入（URL base64 已支持 `?mah=`），降低用户接触自定义布局的门槛。

13. **性能：大棋盘渲染**
    `MAX_RUNS=2000` 次重试 + 多层大布局时，可解生成与渲染在低端机可能卡顿。可对超大布局（>144 张的扩展牌 TILES_EXT）做 Worker 化生成，并把 board 渲染做更激进的虚拟化（仅渲染视口 + 邻层）。

14. **签名发布**
    macOS Gatekeeper 警告是新用户流失点。可引入 GitHub Actions + 临时签名证书做 CI 签名（即便非公证签名，也能去掉"已损坏"提示）。
