# 技术架构

> Mah（v1.19.3）是一款开源 HTML5 麻将接龙游戏，作者 ffalt，MIT 许可证。本篇梳理技术栈、目录结构、启动方式与工程约束。

## 目录

- [技术栈](#技术栈)
- [目录结构](#目录结构)
- [启动与开发](#启动与开发)
- [部署形态](#部署形态)
- [工程约束](#工程约束)

---

## 技术栈

- **框架**：Angular 22（standalone components，无 NgModules，无 Router，单页应用）
- **语言**：TypeScript 6（`strict: true` 全开），ES2022
- **状态管理**：**可变 Model 对象**（`Game` / `Board` / `Settings`），由 `AppService` 持有；新组件局部用 signals，无 NgRx
- **构建**：自定义 builder `@mah/builders`（位于 `tools/builders`），底层 `@angular/build`；AOT；SCSS；Web Worker 单独 tsconfig
- **测试**：Vitest 4 + Analog.js Angular 插件，jsdom，覆盖率 v8
- **原生壳**：Tauri v2（macOS/Windows/Linux/Android）
- **其他**：`@ngx-translate`（37 语言）、`canvas-confetti`（胜利彩纸）、`zzfx`（音效）、RxJS 7

## 目录结构

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

**依赖流向**：`AppComponent → GameComponent → BoardComponent/Dialog/Help/Settings/... → 服务（AppService、LayoutService、PatternService、SvgdefService）→ 模型（Game、Board、Settings）`。

## 启动与开发

```bash
npm run start              # 开发服务器 → http://localhost:4200/
npm run build:prod         # 生产构建 → dist/
npm run test               # 单元测试
npm run coverage           # 覆盖率
npm run lint               # ng lint + eslint
docker run -d -p 8080:80 ffalt/mah   # 直接跑 Docker
```

**应用名定制**：复制 `custom-build-config.json.dist` 为 `custom-build-config.json`，修改其中的 app 名即可。

## 部署形态

通过环境文件替换区分三种构建目标（`angular.json` 中 `production` / `apps` / `development` / `development-apps` 配置）：

- `production` — 纯 Web
- `apps` — Tauri 桌面/移动
- `development` / `development-apps` — 开发

原生打包位于 `resources/apps/tauri/`（Tauri v2，`tauri.conf.json`，identifier `io.github.ffalt.mah`），Docker 位于 `resources/docker/`（nginx:alpine）与 `resources/docker-image/`。

## 工程约束

- **Node ≥ 26**，TypeScript 全 `strict*`（含 `noImplicitAny`、`noImplicitReturns`、`strictTemplates`）
- ESLint：tab 缩进、必须分号、无尾逗号、`complexity ≤ 20`、`max-len 240`、`max-lines 1000`、`max-classes-per-file 2`
- Qlty CI 聚合：eslint / stylelint / biome / oxc / markdownlint / hadolint / checkov / trufflehog / osv-scanner / zizmor 等
- 包体积预算：初始 bundle 警告 1mb / 错误 5mb；组件样式 10kb / 12kb
