# dsh-workspace-tree · 工作区树（v4）

> [!WARNING]
> **本插件已停止维护。** DSH 官方已内置等效的工作区树功能，请优先使用官方实现。
> 本仓库保留作为历史参考，不再接受功能更新与问题修复。

> **English**: An archived DSH plugin that turned the sidebar workspace list into a dual-mode filesystem tree; DSH now ships the equivalent itself.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Status](https://img.shields.io/badge/status-archived-lightgrey.svg)

它当年做的事：把 DSH Web 左侧栏的「工作区」从一张平铺列表换成**文件系统树**。

- **文件夹模式** —— 按真实目录层级浏览，在任意目录下新建会话（会话 cwd = 该目录）；
- **工作区模式** —— 只列工作区，管会话（打开 / 重命名 / 分叉 / 归档）。

两条模式共用一条硬规矩：**工作区 = 目录强绑定** —— 会话的 cwd 就是它所在的目录。
所以在哪个目录下开的会话，文件操作就落在哪个目录，环境真正隔离（不是 UI 上的归类）。

![工作区树总览](docs/screenshots/overview.png)

*图 · DSH 侧栏「工作区模式」：工作区按目录层级嵌套（`make-videos/0825-1/qwen`…），行尾为最近活动时间。作者本机实拍，仓库自带素材（commit `13f08da`）。*

---

## 目录

| 想了解 | 看这里 |
| --- | --- |
| 为什么它死了 | [归档理由](#archived) |
| 官方现在管这块的是谁 | [官方现在的对应能力](#official) |
| 怎么把它拿掉、怎么回到官方 | [卸载与迁移](#uninstall) |
| 它当年长什么样（双模式 / 搜索） | [历史资料 · 双模式设计](#modes) · [历史资料 · v4 搜索过滤](#search) |
| 为什么推倒重写过一次 | [历史资料 · 为什么重写（v2 → v3）](#why) |
| 它挂在 DSH 的哪个位置 | [历史资料 · 架构与装配点](#arch) |
| 有哪些可配的开关 | [历史资料 · 配置面板](#config) |
| 有什么坑 | [已知限制（归档前的记录）](#limits) |
| 想读代码 | [历史资料 · 代码与验证](#dev) |

---

<a id="archived"></a>
## 归档理由

仓库主人的原话：**「官方功能已经替代。不再维护」**。

具体地说：本插件是靠**影子实现**（shadowing）活的 —— 它以 `priority: -1` 注册进官方的
`sidebar.workspaces` 槽位，把官方那个工作区浏览器**顶掉**再换成自己的树
（DSH 插件机制：同一槽位上优先级低的先渲染，所以能覆盖）。
这种做法的代价是它必须**跟着官方槽位的每次改动跑**：官方一改 props、一挪服务、
一加子槽位，插件就得跟着改，否则整块侧栏都可能是它渲染的旧版本。

官方后来自己把这块收回去了 —— 于是这个插件失去了存在的前提。

<a id="official"></a>
## 官方现在的对应能力

| | 当年 | 现在 |
| --- | --- | --- |
| 侧栏工作区这块 UI 由谁渲染 | 本插件（`priority: -1` shadow 掉官方浏览器） | 官方自己：`@deepseek-ai/dsh-client-ui-workspace` 直接注册进 `sidebar.workspaces` |
| 目录浏览的扩展点 | 无（本插件自带 `POST /mkdir` 绕开官方 browse，因为官方 `directoryFlow` 被替换后其 browse 装配不可用） | 官方开放 `sidebar.workspaces.directoryFlow` 槽位 |

上面这一行是本机能核对到的部分（读的是本机安装的官方包
`@deepseek-ai/dsh-client-ui-workspace` 的 `lib/client.js`）。
**逐项功能对照（文件夹模式、会话 cwd 隔离、搜索过滤等）请以 DSH 官方文档与更新日志为准** ——
本 README 已归档，不再维护这张对照表。

---

<a id="uninstall"></a>
## 卸载与迁移（不再提供安装引导）

> 本节只讲**怎么把它拿掉、怎么回到官方**。
> **不给新装步骤** —— 引导别人去装一个已经死掉的插件没有意义。

### 一、先弄清它是怎么被装进去的

装配链路全在仓库文件里，两条：

| 路径 | 依据 | 形态 |
| --- | --- | --- |
| `dsh plugin add .` | 原 README「安装」节；`package.json` 的 `dsh.bundle.patch` → `cordis.patch.yml` | **持久装配**：patch 里 `insert` 一行 `id: dsh-workspace-tree`，并入 profile 的层栈；浏览器半边由 client-modules 依 `dsh.client` 声明自动发现 |
| `dev_inject_plugin {"dir": "…"}` | 原 README「安装」节（dsh-super-injector，原文标注「免重启」） | **运行时注入**：不进 profile 清单，重启宿主后不再加载（按机制推断，归档前未实测） |

### 二、拿掉它

1. **持久装配的**：从 profile 里摘掉那一行。入口是 DSH 的插件管理界面（设置 → 插件）；
   命令行侧本仓库只记录过 `dsh plugin add`，**没有记录移除子命令** —— 具体写法请参考 DSH 官方文档，别照抄这里的 `add` 反推。
2. **运行时注入的**：重启宿主即可（它本来就不在 profile 清单里）。
3. 让它生效：浏览器半边刷新页面就够了；宿主半边（`lib/index.js` 那部分）需要重新装配 profile。
   > 桌面端经验：Node 的模块缓存不会因为重挂条目而失效，**通常要重启应用**才彻底。
   > 这条来自同族插件 `dsh-cosplay` 的实测记录，不是本插件归档前的实测。
4. **官方浏览器自动恢复** —— 这是本插件 v3 起的设计目标（零持久化、注册级替换），原 README「兼容性」节的原文。

### 三、清理残留

宿主侧 v3 起是**零持久化**的（`lib/index.js` 文件头原话），所以没有需要迁移的数据。
真正会留在机器上的只有两处：

| 残留 | 位置 | 怎么清 |
| --- | --- | --- |
| 界面偏好（模式选择、展开状态、配置面板 5 项） | 浏览器 `localStorage`：`dsh-workspace-tree.mode` / `.dirs` / `.groups` / `.config` | 在 DSH 页面控制台执行 `Object.keys(localStorage).filter(k=>k.startsWith('dsh-workspace-tree')).forEach(k=>localStorage.removeItem(k))`，或直接清站点数据 |
| 「在文件夹中打开」审计日志 | `%USERPROFILE%\.dsh\open-folder.log` | 手动删除该文件即可（它只是 append 的文本日志） |

**不需要迁移的**：工作区注册表本身由 DSH 官方维护，本插件只做只读投影
（`GET /api/dsh-workspace-tree/debug`），从不写它。

### 四、迁移到官方

卸载后官方 `sidebar.workspaces` 自动接管，没有「把数据导过去」这一步 —— 本来就没有私有数据格式。
想确认官方版本里对应功能在哪，看 DSH 官方文档；本插件的 `defaultMode` / `indent` / `showAgg` / `showCount`
这几个纯显示偏好，官方界面里有没有等价项**本 README 不做保证**。

---

<a id="modes"></a>
## 历史资料 · 双模式设计

（以下为归档前 README 的原文，保留作为技术记录。）

**双模式（标题栏切换，选择自动记忆）**

| 模式 | 显示 | 用途 |
| --- | --- | --- |
| **文件夹模式** | 完整文件系统目录树（含非工作区的中间目录），工作区节点带会话计数标记 | 浏览目录结构；hover 任意目录可「新建会话」（会话 cwd = 该目录，自动注册工作区）或「添加为工作区」；点击工作区节点 = 纯导航到工作区模式并定位 |
| **工作区模式** | 只显示工作区节点（隐藏中间目录），按目录相对层级嵌套，会话挂各自工作区下 | 管理会话：打开 / 重命名 / 分叉 / 归档；工作区重命名 / 删除 |

<a id="search"></a>
## 历史资料 · v4 搜索过滤

模式切换按钮与「新建会话」之间新增简约搜索框（🔍 图标，输入即过滤，`Esc` / ✕ 清空）：

- **匹配范围**：会话标题 或 文件夹/工作区名，不区分大小写子串
- **工作区模式**：隐藏不匹配的会话与整组；命中组强制展开（临时），清空后还原手动折叠状态
- **文件夹模式**：目录按「名字或后代会话是否有匹配」剪枝并强制展开命中分支；
  命中的工作区节点下**内联列出要展示的会话**（名字命中 → 该工作区全部可见会话，否则仅标题命中的会话），可直接点击打开
- 无任何命中时显示「无匹配会话」空态

<a id="why"></a>
## 历史资料 · 为什么重写（v2 → v3）

v2 的自定义逻辑文件夹（不改变会话 cwd）造成了**环境不隔离**：文件夹只是 UI 归类，
会话里的文件操作仍落在工作区根目录。v3 彻底移除逻辑文件夹模型，树完全由
`workspaces[].path` 的文件系统层级推导，**在目录下新建的会话其 cwd 就是该目录**。

> 这条教训是这个仓库最值得留下的东西：**UI 上的归类不等于运行时的隔离。**
> 只要 cwd 没变，用户以为「分开了」的两件事其实还在同一个目录里互相污染。

<a id="arch"></a>
## 历史资料 · 架构与装配点

| 半区 | 文件 | 职责 |
| --- | --- | --- |
| Host | `lib/index.js`（231 行） | 只读调试路由 + 两个动作路由，**零持久化** |
| Client | `lib/client.js`（1190 行） | 树浏览器：双模式渲染、目录树推导（`buildDirTree` / `buildWorkspaceForest`）、导航联动、隔离会话创建（`sessions.create({cwd})`） |

数据源全部来自标准 props（`useWorkspaces` / `useSessions`），无额外状态。

**宿主路由**（前缀 `/api/dsh-workspace-tree`，刻意避开 `/plugins/` 的 client bundle 保留空间）

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET / HEAD | `/debug` | 工作区注册表投影（`path` / `title` / `id` / `sessionCount`），诊断用 |
| POST | `/mkdir` | 真实 `fs.mkdir`。官方 `directoryFlow` 被本插件替换后官方 browse 装配不可用，所以自带 |
| POST | `/open-folder` | 「在文件夹中打开」，逻辑移植自 `dsh-open-folder` v2.2（去抖 1.2s、会话 cwd 三级兜底、前台激活轮询、审计日志） |

**客户端注册点**

| 槽位 | id | 参数 |
| --- | --- | --- |
| `settings.plugins.tab` | `dsh-workspace-tree-config` | `order: 90`，`label: "工作区树"`，始终注册 |
| `sidebar.workspaces` | — | `priority: -1`（shadowing 升序、最低渲染）；`enabled=false` 时不注册 |

**装配声明**（`package.json` → `cordis.patch.yml`）

```yaml
# dsh-workspace-tree bundle patch
- insert:
    - id: dsh-workspace-tree
      name: dsh-workspace-tree
```

`dsh.client` 声明为 `{ platform: "web", inject: [], immediately: true }`；
浏览器半边（`lib/client.js`）由 client-modules 依此自动发现，不需要在 patch 里写。

<a id="interact"></a>
## 历史资料 · 交互细节

- **文件夹模式**：目录节点点击 = 展开/折叠（chevron 单独点击也可）；工作区节点点击 = 切到工作区模式 + 展开该组 + 滚动定位（纯导航，不打断当前会话）；hover 操作：工作区节点「＋新建会话 / ✎重命名 / 🗑删除」，普通目录「＋新建会话（自动注册）/ ＋添加为工作区」
- **工作区模式**：组头「＋新建会话 / ✎重命名 / 🗑删除」；会话行保留官方「完成未读」绿色提醒点、运行矩阵动画、等待交互琥珀点
- 展开状态、模式选择均 localStorage 记忆
- 工作区拖拽排序走官方 `insertWorkspaceBefore` 语义（仅同父组内有效，跨组 drop 忽略）
- 会话列表隐藏子代理会话（`origin === "subagent"`）与已归档会话，与官方浏览器行为对齐
- 树渲染套了 ErrorBoundary：出错时只把侧栏换成一行「工作区树渲染错误: …」，不炸整个界面

<a id="config"></a>
## 历史资料 · 配置面板

位置：**设置 → 插件 → 插件配置 → 工作区树**。5 项全部存 `localStorage["dsh-workspace-tree.config"]`。

| 字段 | 默认 | 面板标签 · 说明 |
| --- | --- | --- |
| `enabled` | `true` | 启用插件 · 关闭后回退官方工作区浏览器（注册级，刷新页面生效） |
| `indent` | `16` | 层级缩进 · 紧凑 8px / 标准 16px / 宽松 24px |
| `defaultMode` | `workspace` | 默认模式 · 文件夹模式 / 工作区模式（手动切换后会记住） |
| `showAgg` | `true` | 状态向上透传 · 目录/组头显示子树内会话的聚合状态点（运行 / 等待 / 完成） |
| `showCount` | `true` | 会话计数角标 · 文件夹模式工作区节点旁的会话数 |

<a id="limits"></a>
## 已知限制（归档前的记录）

- **它是一层影子实现，天然跟着官方版本跑。** 官方改 `sidebar.workspaces` 的 props 或服务位置，
  插件就得跟着改 —— 仓库里 `a6ee319` 那次提交正是为此：DSH 0.1.2 把 `startSession` /
  `connectWorkspace` / `pickDirectory` 从 `workspaces` 控制器挪进了 `uiWorkspace` 服务。
  这也是它最终被官方替代后不值得继续维护的原因。
- **「在文件夹中打开」是 Windows 专用**：源码直接调 `cmd.exe` / `explorer.exe` / `powershell.exe`
  （`AppActivate` 做前台激活），且**没有** `process.platform` 判断。非 Windows 平台上这一项必然不可用；
  树 UI 本身不依赖平台。
- **它换掉官方组件时，官方那块的附属能力会一起消失。** 官方 `directoryFlow` 槽位被替换后，
  官方 browse 装配不再可用，所以「新建文件夹」只能自带 `POST /mkdir` 走真实 `fs.mkdir`。
- **官方 UI 的「在文件夹中打开」按钮会跟着消失**，因此树 UI 复刻了一个，后端也自带
  （移植自 `dsh-open-folder` v2.2），代价是这段逻辑变成了本插件的一部分。
- **`localStorage` 偏好是浏览器级的**：同一台机器不同 profile / 不同端口的工作区树，记忆是各自的。
- **宿主半边的改动要重新装配 profile**；桌面端受 Node 模块缓存影响通常要重启应用（同族插件实测记录）。
- 界面只有中文。

<a id="dev"></a>
## 历史资料 · 代码与验证

**没有构建步骤**：`package.json` 里没有 `scripts`、没有 `dependencies` / `devDependencies`，
`lib/index.js` 与 `lib/client.js` 就是入库的手写产物（浏览器半边是
`window.__ModuleLoader__.load({ id, factory })` 形式的手写模块）。改代码 = 直接改这两个文件。

**仓库里没有测试、没有 CI、没有 lint 配置。** 唯一可复跑的只读校验是宿主那条调试路由：

```bash
curl http://127.0.0.1:<DSH端口>/api/dsh-workspace-tree/debug
# → { ok, workspaces: [{ workspaceId, title, path, sessionCount }] }
```

**版本演进**（`git log`）

| 提交 | 内容 |
| --- | --- |
| `ae19d9a` | v1.0.0 文件系统双模式工作区树（工作区 = 目录强绑定，环境隔离） |
| `845c8d4` / `65a58b1` / `b0f950a` | 复刻「在文件夹中打开」、隐藏子代理会话、区分图标（PR #1） |
| `01064ad` | 工作区拖拽排序（官方 `insertWorkspaceBefore` 语义）（PR #2） |
| `4b6b62f` | 「打开文件夹」后端并入本插件，自包含、不再依赖 `dsh-open-folder`（PR #3） |
| `a6ee319` | 会话/工作区动作改走 DSH 0.1.2 的 `uiWorkspace` 服务 |
| `4e2fd2e` | v4 搜索过滤（会话标题 / 文件夹名实时匹配） |

> 版本口径说明：H1 里的 `v4` 是**设计代次**（v1→v4），`package.json` 里的 `1.1.0` 是**包版本**。
> 两者不是一回事，归档时保持原样，不做统一。

<a id="license"></a>
## 许可

MIT License —— 见根目录 [`LICENSE`](LICENSE)（`Copyright (c) 2026 liceses`），
与 `package.json` 的 `license` 字段一致。

---

## 相关

- [DSH 官方文档](https://github.com/deepseek-ai/deepseek-harness) —— 官方工作区树功能请以此为准。
- `liceses/dsh-open-folder` —— 「在文件夹中打开」逻辑的上游，v2.2 被移植进本插件。
