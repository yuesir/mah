# 玩法、规则与限制

> 本篇梳理 Mah（麻将接龙）的核心玩法、判定规则、生成算法、辅助机制与持久化。

## 目录

- [玩法](#玩法)
- [核心规则](#核心规则)
- [难度等级](#难度等级)
- [棋盘生成引擎](#棋盘生成引擎)
- [随机布局生成](#随机布局生成)
- [求解器](#求解器)
- [辅助机制](#辅助机制)
- [持久化](#持久化)
- [平台与分发](#平台与分发)

---

## 玩法

经典上海麻将：144 张牌堆成多层立体牌阵，玩家从叠堆顶部、左右两端找出**可自由取出**的成对牌进行消除，目标是清空整盘。

## 核心规则

| 规则 | 位置 | 说明 |
|---|---|---|
| **牌组** | `model/consts.ts` TILES | 37 组基础牌（万/条/筒各 9 组 + 风牌 4 组 + 箭牌 3 组 + 季节 1 组 + 花卉 1 组），每组 4 张 |
| **匹配** | `game.ts:60`、`board.canRemove` | 两张牌 `groupNr` 相同即可匹配。季节（春夏秋冬）与花卉（梅兰竹菊）虽 4 张面不同但同属一组，任意两张都能配 |
| **可取（free）** | `stone.ts:62 isBlocked` | 被上方（z+1）任意牌挡住 → 阻塞；或**左右两侧同时**被相邻牌（x±2，跨 y±1）挡住 → 阻塞；否则自由 |
| **可移除** | `board.ts:106` | 不在 picked、未阻塞、且同组至少还有一张也是自由的 |
| **胜利** | `game.ts:238` | `board.count < 2`（剩余不足 2 张） |
| **失败** | `game.ts:240` | `board.free.length === 0`（无可移除对） |

**邻居拓扑**（`builder/base.ts collectNodes`）：左右邻居在 `x ± 2`（跨 `y-1..y+1`），上下邻居在 `z ± 1`（跨 `x-1..x+1`、`y-1..y+1`，3×3 窗口）。这就是麻将牌"半张错位"网格的实现。

## 难度等级

定义在 `consts.ts` 的 `GameModes`：

- **EASY 简单**：洗牌 + 提示 + 撤销 + 死局救援洗牌（最多 10 次）+ 选中时高亮同组可配牌（SHOW_MATCHING）
- **STANDARD 标准（默认）**：提示 + 撤销
- **EXPERT 专家**：无任何辅助

## 棋盘生成引擎

两个核心生成器（`model/builder.ts` 门面，`MODE_SOLVABLE` / `MODE_RANDOM`）：

- **SolvableBoardBuilder**（`builder/solvable.ts`）：**保证可解**。算法 `assignTilePairs` 是"正向打牌"——只在两张牌都自由时才赋予一对，因此该放置顺序本身就是一组解。失败重试最多 2000 次，再用反向组序兜底 10 次，最后退回随机。
- **RandomBoardBuilder**（`builder/random.ts`）：纯随机分配，仅保证开局至少存在一对可移除牌（最多重投 50 次）。
- **LoadBoardBuilder**（`builder/load.ts`）：从已保存的 `StoneMapping`（z,x,y,v）重建牌局，用于续局。

## 随机布局生成

位于 `model/random-layout/`，种子化（mulberry32，可分享/复现）：

- 目标 **144 张**，网格范围 `x∈[0,36]`、`y∈[0,16]`、`z∈[0,5]`
- 约束（`utilities.ts`）：
  - **单元唯一**
  - **不重叠**（`blocksOverlap`：任一点 3×3 邻域内不能有同层牌，强制 2 格间距）
  - **z>0 必须满足支撑**（`isSupported`：正下方有牌 / 小桥 [x±1,y] 双点支撑 / 大桥 [四角] 支撑）
  - **需多层**（`hasMultipleLevels`）
- 基础层模式：checker / lines / rings / areas / cross / diamond / triangle / shapes；可 X/Y 镜像
- 上层生长（`upper-layers.ts fillLayout`）：按 largeBridge → smallBridge → direct 优先级填充，最后 `ensureEven` 补齐到偶数

## 求解器

位于 `model/solver/`，移植自 Michiel de Bondt 的 `mjsolver`，三层策略：

1. **`prune`** 上界剪枝（最乐观配对后还剩多少）；`pairing` 0=自由选择，1/2/3=具体 2-of-4 配对，4=半组，5=全 4 张
2. **`randomSolve`** 概率性快速试解（迭代收敛）
3. **`sureSolve`** 穷举回溯（尝试配对/旋转压低剩余数）

由 `worker/solve.worker.ts` 在 Web Worker 中执行（`worker.service.ts` 用 RxJS 管理生命周期，失败时同步兜底）。`SolverWriter` 把 `bestPairing` 物化为具体移除顺序。

## 辅助机制

- **提示 hint**（`board.hint`）：按 groupNr 分组自由牌，重复调用循环切换（`hintNext`），EXPERT 禁用
- **撤销 undo**（`board.back`）：栈式记录配对（每对 2 条），EXPERT 禁用
- **洗牌 shuffle**（`board.shuffle`）：保留已消除牌，对剩余牌按当前 buildMode 重建，仅 EASY
- **死局救援**（`game.gameOverEasyModeShuffle`）：EASY 下连续洗牌最多 10 次直到出现可移除对
- **SHOW_MATCHING**（`board.highlightMatches`）：EASY 下选中牌时高亮所有同组自由牌

## 持久化

LocalStorage，前缀 `mah.`（`localstorage.service.ts`）：

- 游戏状态（可恢复对局）、设置、`score.<layoutId>`（胜负次数、总时长、最佳时间）、自定义棋盘、最后棋盘、镜像偏好
- **随机布局不计入分数**（`isStorableLayoutId`：id 非 `random-` 开头才入库）
- 含配额错误处理与历史 key 迁移

## 平台与分发

Web、Docker/nginx、Tauri（dmg/msi/deb/AppImage/apk）。

> ⚠️ macOS/Windows 构建未签名，首次运行需用户手动放行（macOS 需 `xattr -dr com.apple.quarantine`，Windows SmartScreen 选"仍然运行"）。
