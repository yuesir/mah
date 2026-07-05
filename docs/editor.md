# 内置布局编辑器（Editor）

Mah 自带一个完整的棋盘布局编辑器，可在游戏内设计自定义 3D 棋盘、设置层级、保存为 custom layout。保存后的棋盘会出现在 **Select Board** 列表中（带删除按钮），并归到对应分类。

## 访问方式

### 入口：键盘快捷键 `E`

游戏运行时按下 **`E` 键** 即可切换编辑器开关。

实现位置：`src/app/app.component.ts` 的 `handleKeyDownEvent`：

```ts
if (environment.editor && event.key === 'e') {
    this.toggleEditor();
    event.preventDefault();
}
```

> 注意：光标不能停留在 `<input>` 等输入框内，否则 `e` 会被当作普通字符输入，不会触发编辑器。

编辑器组件通过动态 `import('./modules/editor/components/editor/editor.component')` 懒加载，注入到界面上；再次按 `E` 或点击编辑器内的关闭按钮即可退出。

## 前提条件：`editor` 功能开关

入口被 `environment.editor` 这个布尔标志守卫。只有当它为 `true` 时，按 `E` 才会响应；否则无任何反应。

### 开关来源

`environment.editor` 的值由**构建期 define 注入**，而非运行时配置。注入逻辑在 `tools/builders/mah-builder.mjs`：

```js
APP_FEATURE_EDITOR: JSON.stringify(!!config.editor),
```

`config` 来自仓库根目录的 `custom-build-config.json`（被 `.gitignore` 忽略，仓库只提供 `custom-build-config.json.dist` 模板）。未配置 `editor: true` 时，该标志默认为 `false`。

### 各构建场景下的状态

| 构建命令 | `editor` 值 | 能否用 `E` 打开 |
|---|---|---|
| `npm start`（dev） | 取决于 `custom-build-config.json` | 默认**否** |
| `npm run build:prod`（production） | 同上 | 默认**否** |
| `vitest` 测试环境 | `true`（见 `vitest.config.mjs` 的 `define`） | — |

> `src/environments/environment.ts` 与 `environment.production.ts` 都只是 `editor: env.APP_FEATURE_EDITOR`，真正取值来自构建期注入的 `APP_FEATURE_EDITOR` 全局常量。

## 开启编辑器

### 方法 1：配置 `custom-build-config.json`（推荐）

复制模板并新增 `editor` 字段：

```bash
cp custom-build-config.json.dist custom-build-config.json
```

编辑 `custom-build-config.json`：

```json
{
    "name": "Mah Jong",
    "description": "Mah Jong Solitaire",
    "category": "Solitaire Board Game",
    "title": "Mah Jong",
    "url": "https://ffalt.github.io/mah/",
    "editor": true
}
```

然后 `npm start`，进入游戏按 `E` 即可打开编辑器。这是标准做法，走 `mah-builder` 的配置通道，dev 与 production 构建均会生效。

### 方法 2：直接修改 dev define（仅本地临时验证）

如需快速验证而不创建配置文件，可在 dev server 的构建配置中临时注入 `APP_FEATURE_EDITOR` 为 `true`。但建议优先使用方法 1，以保持配置统一。

## 编辑器能力

编辑器位于 `src/app/modules/editor/`，提供完整的棋盘设计能力：

- 在 3D 网格上绘制 / 擦除牌位
- 设置牌的层级（z 轴堆叠）
- 实时预览棋盘形状
- 命名并保存为 custom layout（持久化到 `localStorage`，通过 `LocalstorageService`）
- 保存后的棋盘自动出现在 **Select Board** 列表中，并可指定 `category`，从而进入对应的分类分组

> 保存的 custom layout 会在 Select Board 中带有删除按钮（见 `layout-list.component.html` 中的 `.preview-custom-delete`）。

## 与 Select Board 分类的联动

编辑器保存棋盘时填写的 `category` 字段，会成为 Select Board 中的一个分组。分组逻辑在 `LayoutListComponent.buildGroups()` 中按 `layout.category` 动态聚合，无需在代码中预声明分类列表。分类显示名经 `TranslateGroupPipe` 转成 `CAT_<大写>` 翻译键（如 `Monuments` → `CAT_MONUMENTS`），找不到翻译则回退显示原始字符串。

详见 [Select Board 中添加分类](./README.md) 相关说明。

---

## 编辑器工作原理

整体是一个 **"3D 体素网格 + 紧凑坐标列表" 双向同步**的可视化编辑器。核心是把麻将牌阵抽象成三维坐标集合，再用 SVG 网格做所见即所得的编辑。

### 数据模型：两层抽象

编辑器维护同一种棋盘布局的两种表示，编辑时实时互转。

#### 1. `Mapping` — 牌的坐标列表（真相源）

```ts
type Place = [z, x, y];   // 每张牌占一个格点
type Mapping = Array<Place>;
```

定义在 `src/app/model/types.ts`。一张牌 = 一个 `(层级 z, 列 x, 行 y)` 三元组。整个棋盘就是一个 `Place[]`。`EditLayout.mapping` 就是这个数组，所有编辑操作（增删牌、移动、镜像、复制层）本质都是对这个数组做 push/filter/修改。

#### 2. `Matrix` — 3D 体素网格（用于校验和渲染）

定义在 `src/app/modules/editor/model/matrix.ts`：

```ts
class Matrix {
    levels: Array<Level> = [];   // levels[z][x][y] = 0 | 1
}
```

是一个三维稀疏数组，每格存 `0`（空）或 `1`（有牌）。它由 `mapping` 通过 `applyMapping()` 重建而来：

```ts
applyMapping(mapping, minLevel, minX, minY) {
    const bounds = mappingBounds(mapping, ...);
    this.init(bounds.x + 1, bounds.y + 1, bounds.z);
    for (const place of mapping) {
        this.setValue(place[0], place[1], place[2], 1);
    }
}
```

`Matrix` 的真正价值是**几何校验**，提供四个关键判断：

| 方法 | 作用 |
|---|---|
| `inBounds(z,x,y)` | 坐标是否在网格范围内 |
| `isTile(z,x,y)` | 该格是否有牌 |
| `isTilePosInvalid(z,x,y)` | 该格是否"违规"——会与相邻牌产生半格重叠（麻将牌是 2×2 占位，所以邻居关系不是简单相邻） |
| `isTilePosBlocked(z,x,y)` | 该格下方是否有支撑（下层 `(x, y)` 或 `(x-1, y)`、`(x-1, y-1)` 有牌），决定能否放置 |

`isTilePosInvalid` 检查的是 6 个相对位置 `[-1,-1],[1,-1],[0,1],[-1,1],[1,0],[1,1]`，这正是麻将牌 2×2 占位导致的几何约束。

### 编辑流程：点击 → 改 mapping → 重建 Matrix → 重绘

入口在 `LayoutComponent.onPosClick()`（`layout.component.ts:136`）：

```ts
onPosClick(z, x, y) {
    if (blocked 或 invalid) return;       // Matrix 几何校验
    if (isTile(z, x, y)) {
        removeStone(z, x, y);             // 从 mapping 过滤掉
        // 镜像位置也一起删
    } else {
        addStone(z, x, y);                // push 进 mapping
        // 镜像位置也一起加（如果合法）
    }
    this.refresh();
}
```

`addStone` / `removeStone` 都只是改 `layout.mapping` 数组，然后调 `matrix.applyMapping()` 重建网格。`refresh()` 做三件事：

1. `matrix.applyMapping()` — 重建几何网格
2. `stats.set(...)` — 算统计（总牌数、是否偶数、是否 ≤144、各轴范围）
3. `svg.set(generatePreview(optimizeMapping(mapping)))` — 生成预览 SVG

`optimizeMapping()` 把布局平移到原点（`min z/x/y` 归零），让预览紧凑。

### 渲染：分层 SVG 网格

渲染由 `BoardComponent`（`editor/components/board/`）负责，它把一个 `level`（即 `Matrix.levels[z]` 的二维数组）渲染成 SVG 网格。

`updateLevel()` 遍历 `level.rows`，对每个 `(x, y)` 创建一个 `Draw`：

```ts
const draw: Draw = {
    x, y, z: level.z, v: value,
    pos: calcDrawPos(level.z, x, y),       // 屏幕坐标（含 z 层级偏移）
    className: this.drawClass(...),         // 'tile' | 'invalid' | 'blocked' | 'below'
    source: value > 0 ? new Stone(...) : emptySource
};
```

`drawClass()` 根据 Matrix 的几何判断给每格上色：合法位置、违规位置、被压位置用不同 CSS class 显示。`calcDrawPos()` 用 `CONSTS` 里的牌宽/高/层级偏移算出 SVG 坐标，制造伪 3D 视觉（高层向左上偏移 `levelOffset`）。

编辑器界面（`layout.component.html`）有**三层视图**：

1. **左侧层列表**（`matrix-list`）—— 每层一个缩略 `app-editor-board`，点击切换当前层
2. **中间编辑网格**（`matrix-edit`）—— 当前层的完整网格，点击增删牌
3. **右下预览**（`matrix-preview`）—— 整个棋盘的 3D 预览 SVG + 三轴尺寸标注

### 几何校验为何重要

麻将牌在数据上虽然占 1 格，但视觉上是 **2×2** 大小。这意味着相邻格的牌会"半格重叠"，物理上无法共存。`isTilePosInvalid` 用那 6 个偏移检查的就是这件事——如果新牌会和已有牌在视觉上重叠，就标记为 invalid 禁止放置。`isTilePosBlocked` 则模拟"上层牌必须有下层支撑"的物理规则。

这两个校验是编辑器防止产生非法布局的第一道防线。第二道是 `stats.countInvalid`：检查总数是否为偶数且 ≤144（标准麻将牌数）。

### 可解性验证：Web Worker

光几何合法不够，棋盘还得**能解开**。`solve()` 方法（`layout.component.ts:343`）调用 `WorkerService.solve()`，把 mapping 丢给后台 worker 跑蒙特卡洛求解：

```ts
solve() {
    this.solveWorker.set(this.worker.solve(
        this.layout().mapping, 1000,     // 跑 1000 次
        progress => { ... },              // 每次成功/失败回调
        result => { ... }                 // 完成回调
    ));
}
```

UI 上显示 "Solved: N / Failed: M"。如果有失败，说明这个布局不一定能解开，玩家可能死局。这是编辑器的核心质量保障。

### 保存与导出

点保存弹出 `ExportComponent`（`export/export.component.ts`）：

- **保存到本地**：`save()` → `LayoutService.storeCustomBoards([loadLayout])`，写入 `localStorage`（通过 `LocalstorageService`），下次进游戏直接出现在 Select Board。会先 `removeCustomLayout` 清掉同 id 旧版。
- **导出文件**：支持三种格式（`export.ts`）：
  - **Mah**（`.mah`，JSON，本游戏原生）
  - **Kyodai**（`.lay`）
  - **Kmahjongg**（`.layout`，Olmazeb 用）

`generateExportLayout()` 把 `EditLayout` 压成紧凑的 `LoadLayout`（`map` 字段用 RLE 压缩，见 `model/mapping.ts` 的 `compactMapping`），这正是 `boards.json` 里的格式。

### 完整数据流

```
用户点击网格
    ↓
onPosClick(z,x,y)
    ↓
改 layout.mapping (Place[])  ← 真相源
    ↓
matrix.applyMapping()  → 重建 3D 网格
    ↓
┌─────────────────────────────────┐
│ 三处消费：                       │
│ 1. BoardComponent 渲染分层网格  │
│    （用 Matrix 做 invalid/blocked 着色）│
│ 2. stats() 算总数/偶数/尺寸      │
│ 3. generatePreview() 生成预览 SVG │
└─────────────────────────────────┘
    ↓ （可选）
solve() → Worker 跑 1000 次验证可解性
    ↓ （保存）
storeCustomBoards() → localStorage → Select Board 出现新棋盘
```

**一句话总结**：编辑器是一个**以坐标数组为单一真相源、用 3D 体素网格做几何校验、用分层 SVG 做可视化、用 Web Worker 验证可解性**的布局设计工具。所有花哨的图形交互，本质都是对一个 `Array<[z,x,y]>` 的增删改。

---

## 可解性：为什么会出现 "no more matching tiles"

### 不是"牌没渲染"，而是"配对关系断了"

游戏每次消除后跑 `checkGameState()`（`game.ts:237`）：

```ts
checkGameState(): boolean {
    if (this.board.count < 2) {
        this.gameOverWinning();          // 赢
    } else if (this.board.free.length === 0) {
        // 没有任何可配对组合了 → MSG_FAIL
        if (this.mode === GAME_MODE_EASY && this.board.countUnblocked() > 1) {
            this.gameOverEasyMode();      // Easy 模式允许 shuffle
        }
        ...
    }
}
```

`board.free` 是"当前露出来、且至少存在一对同组"的牌集合（`collectHints()` 算的）。一旦它变空，哪怕棋盘上还剩几十张牌，也会立即判负——这就是 `no more matching tiles`（`MSG_FAIL`）。

### 牌数必须是偶数，否则一定无解

关键在 `Tiles.build()`（`src/app/model/tiles.ts:24`）和 `RandomBoardBuilder.buildOnce()`（`builder/random.ts:20`）：

```ts
// RandomBoardBuilder.buildOnce
const remainingTiles = this.getTilesInGame(tiles, mapping.length);
const remainingPlaces = [...mapping];
while (remainingPlaces.length > 0 && remainingTiles.length > 0) {
    stones.push(new Stone(..., tile.v, tile.groupNr));
}
```

牌是按"组"生成的（`TILES` 数组每组 4 张同图案）。游戏开始时：

- `Tiles(mapping.length)` 按你的格子数生成牌堆
- 每个 `place`（棋盘格点）随机抽一张牌赋上去
- **同 `groupNr` 的牌才能互相消除**

如果你设了比如 **30 格**：
- 30 不是 4 的倍数，会有一个组只分到 2 张（凑巧能配对）
- 但更常见的问题是：**这 2 张牌可能一张在底层被压死、一张在远处**，永远无法同时露出来

编辑器的 `stats.countInvalid` 会检查 `(count > 144) || (count % 2 !== 0)`（`layout.component.ts:92`），但**这只警告总数，不保证可解**。

### "几何合法" ≠ "可解"

这是最关键的认知差。编辑器 `Matrix` 只校验：

| 校验 | 含义 |
|---|---|
| `isTilePosInvalid` | 牌不能和邻居半格重叠（2×2 占位约束） |
| `isTilePosBlocked` | 上层牌需要下层支撑 |
| `stats.countInvalid` | 总数 ≤144 且为偶数 |

**这些都不保证可解**。一个几何上完美、偶数张牌的布局，完全可能是死局。比如经典反例：把所有牌堆成一根柱子，从下到上每层一张——几何合法、总数偶数，但只能消除最顶上一对，剩下的全被压死。

### 正确的做法

1. **牌数用偶数**，最好 4 的倍数（标准是 144）
2. **必须点 Test Run 验证**，确保 `won > 0` 且最好 `fail = 0`
3. 更稳妥：开始游戏时在 Select Board 选 **Board Generator = Solvable**（`MODE_SOLVABLE`），它会让 `SolvableBoardBuilder` 反向构造一个保证可解的牌面分配——但这只改牌的分配，不改你画的形状
4. 如果死局发生在 Easy 模式，游戏会提示 shuffle；Standard/Expert 模式直接判负

---

## 多层关卡设计指南

编辑器的核心思路：**左边管理层（z 轴），中间编辑当前层，右下看 3D 预览**。多层就是 z=0、z=1、z=2… 多个平面棋盘叠起来，上层牌会物理压住下层牌。

### 界面三区认知

打开编辑器进入 edit 模式后（点 New Board 或编辑已有布局）：

```
┌─────────────┬──────────────────────────┬──────────────┐
│ 左侧：层列表 │ 中间：当前层编辑网格      │ 右下：3D 预览 │
│ Level 0  ▓ │ Level 1                   │  [整盘立体   │
│ Level 1 ▓ │  ┌──────────────┐         │   效果+尺寸] │
│ Level 2  ░ │  │ 可点击的网格  │         │              │
│             │  └──────────────┘         │ Tiles: 总数  │
│ [+ 新增层]  │ [层操作][整体移动][镜像]  │ [Test Run]   │
└─────────────┴──────────────────────────┴──────────────┘
```

- **左侧列表**：每个 `Level N` 是一个 z 层，缩略图显示该层牌位。点击切换"当前编辑层"。
- **中间网格**：只显示当前层，点击空格添加牌、点击已有牌删除。
- **右下预览**：所有层叠在一起的立体效果，实时更新。

### 关键操作（对照 `layout.component.html`）

#### 新增层 — 左下角 `+` 按钮（`app-icon-list-add`）

```html
<button (click)="this.newLayerBelow(this.currentZ())">  <!-- 第 23 行 -->
    <app-icon-list-add />
</button>
```

在当前层**上方**插入一个新层（`newLayerBelow` 把所有 `z > currentZ` 的牌上移一位，腾出新层）。比如当前在 Level 0，点一次 → 出现 Level 1（空）。

#### 切换当前层 — 点击左侧列表项

点 `Level 0` / `Level 1` / `Level 2`… 中间网格就切换到那一层。当前层在左侧高亮（`selected` class），顶部显示 `Level N`（`buttonbar-title`）。

#### 在每一层里画牌

切到目标层后，**在中间网格点击格点**：
- 点空格 → 加牌（同时镜像开关开着的话会对称加）
- 点已有牌 → 删牌

**关键认知**：上层牌必须压住下层牌的某一部分才有意义。麻将牌是 2×2 占位，所以上层牌放在 `z+1` 的 `(x,y)` 时，它会压住 `z` 层 `(x-1..x+1, y-1..y+1)` 范围（见 `base.ts:34` 的 `collectNodes`，邻居判定范围是 `x±2, y±1` 和 `z±1` 的 `x±1, y±1`）。

### 层操作工具栏（中间顶部，`Level N` 右边）

这一排按钮（`layout.component.html:35-55`）针对**当前层**：

| 按钮 | 功能 | 代码 | 用途 |
|---|---|---|---|
| ⬆️ | 当前层下移（z 减小） | `moveLayerZ(-1, currentZ)` | 调整层序 |
| ⬇️ | 当前层上移（z 增大） | `moveLayerZ(1, currentZ)` | 调整层序 |
| 📋 | 复制当前层 | `duplicateLayerZ(currentZ)` | **快速造对称多层** |
| 🧹 | 清空当前层 | `clearLayerZ(currentZ)` | 保留层但删光牌 |
| 🗑️ | 删除当前层 | `deleteLayerZ(currentZ)` | 连层带牌删除 |
| ︱ | 镜像 X 开关 | `toggleMirrorX()` | 对称作图 |
| ⎯ | 镜像 Y 开关 | `toggleMirrorY()` | 对称作图 |

> 注意：`moveLayerZ(-1)` 在 `currentZ===0` 时禁用，`moveLayerZ(1)` 在最高层禁用（`[disabled]` 绑定）。

#### 最实用的技巧：复制层（📋）

`duplicateLayerZ`（`layout.component.ts:263`）的逻辑：

```ts
duplicateLayerZ(layer) {
    for (const m of mapping) {
        if (m[0] > layer) m[0] += 1;   // 上层全上移
        else if (m[0] === layer) {
            dups.push(m);              // 复制当前层
        }
    }
    for (const m of dups) {
        mapping.push([layer + 1, m[1], m[2]]);  // 粘贴到上一层
    }
}
```

**它把当前层原样复制一份到正上方。** 然后你可以切到上层，稍微删掉几张牌，制造"阶梯感"——这是造金字塔最快的方法。

### 推荐的多层设计流程（造一个 3 层金字塔）

以一个 3 层、约 60 张牌的金字塔为例。

#### 第 1 步：画底层（Level 0）

1. 确认左侧选中 `Level 0`
2. 开启 **Mirror X**（︱）+ **Mirror Y**（⎯）—— 这样点一格会自动加 4 格（四象限对称）
3. 在中间网格点出底层轮廓，比如一个矩形/圆形/十字。对称模式下点 ~15 次就能得到 ~60 格
4. 看 **Tiles 数字**（顶部，`Tiles: N`），目标是偶数，最好 4 的倍数

#### 第 2 步：复制并缩小，造上层

1. 点 **复制层**（📋）→ 自动生成 Level 1，内容和 Level 0 一模一样
2. 切到 `Level 1`
3. **关掉 Mirror**（否则删一格会删 4 格，可能不是你想要的）
4. 在 Level 1 删掉外圈一圈牌，只留中间 ~70% 的区域。这样上层比下层小，形成阶梯
5. 重复：再复制 Level 1 → Level 2，再删更多，顶层只剩 1~4 张

#### 第 3 步：检查阻塞关系

切回 Level 0，观察中间网格的着色（`BoardComponent.drawClass`，`board.component.ts:44`）：

- **正常色** = 合法牌位
- **blocked 标记** = 该格被上层压住（这是好事，制造了消除顺序约束）
- **invalid 标记** = 该格和邻居半格重叠，违规，必须调整

上层牌会在下层对应位置显示 `below` 标记（`board.component.ts:56`）。

#### 第 4 步：调整总数

看右下预览面板的 **Tiles: N**：
- 奇数 → 删或加 1 格（数字变白）
- 非 4 的倍数 → 可选优化，但偶数即可玩
- > 144 → 超出标准牌组，会启用扩展牌（`TILES_EXT`），仍可玩但不推荐

#### 第 5 步：整体移动（可选）

如果整个布局位置不对，用右下预览面板旁的整体移动箭头（`layout.component.html:84-95`）：

| 按钮 | 功能 |
|---|---|
| ⬆️⬇️⬅️➡️ | 所有层一起沿 Y/X 轴移动 |

把棋盘聚拢到中心，让牌之间产生阻塞关系（这对可解性很重要）。

### 验证可解性（必做）

点右下 **Test Solvability**（`solve()`，跑 1000 次模拟）：

```
Solved: N    Failed: M
```

- **Solved = 0**：布局无解。常见原因：层数太少、牌太分散没阻塞、奇数张
- **Solved > 0, Failed > 0**：可解但不稳，玩家容易死局
- **Solved > 0, Failed = 0**：理想，任意顺序都能解

**如果 Solved = 0，多层调整方向：**

1. **加层**：用 `+` 新增层，把顶层牌分散到两层，增加阶梯过渡
2. **缩小上层**：上层越小、越集中，下层被压区域越明确，求解器越容易构造解
3. **避免"平铺"**：单层大平面几乎一定 Solved=0，必须靠 z 轴分层制造约束

### 保存

1. 点右上角 Save（`editor.component.ts:29` 的 `save()`）→ 弹出 Export 对话框
2. 填 Name、Category（自定义分类名）、By（作者）
3. 点 **Save**（`export.component.ts:78`）→ 存入 `localStorage`，立即出现在 Select Board
4. 或点下载，导出 `.mah` / `.lay` / `.layout` 文件

### 快速总结表

| 想做的事 | 点哪里 |
|---|---|
| 加新层 | 左下 `+`（`newLayerBelow`） |
| 切换编辑层 | 左侧 Level 列表 |
| 复制当前层到上层 | 中部工具栏 📋（`duplicateLayerZ`） |
| 删光当前层但保留层 | 🧹（`clearLayerZ`） |
| 删除整个层 | 🗑️（`deleteLayerZ`） |
| 调整层序 | ⬆️⬇️（`moveLayerZ`） |
| 对称作图 | ︱ / ⎯ 镜像开关 |
| 整盘移动 | 右下 ⬆️⬇️⬅️➡️ |
| 验证可解 | 右下 Test Solvability |
