/**
 * dsh-workspace-tree — node half (v3)。
 *
 * v3 设计（grill 收敛）：工作区 = 目录强绑定，树结构完全由文件系统推导，
 * 不再有自定义逻辑文件夹（旧 folders/assignments 模型废弃，避免
 * 「UI 隔离 ≠ cwd 隔离」的环境污染问题）。
 *
 * 路由：
 *  - GET  /debug   工作区注册表投影（诊断用）
 *  - POST /mkdir   真实创建子目录 { parent, name } → { path }
 *                  （浏览器半区新建文件夹走这里，绕开官方 browse 能力——
 *                  官方 directoryFlow hole 被替换后 browse 装配不可用）
 *
 * 零持久化。
 */
import { mkdir, stat } from "node:fs/promises";
import { appendFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { basename, join } from "node:path";
import { homedir } from "node:os";

/** Cordis 插件名（patch 行 id）。 */
const name = "dsh-workspace-tree";
/** 依赖的服务。 */
const inject = ["webServer"];

/** Host 路由前缀（避开 /plugins/ 的 client bundle 保留空间）。 */
const PREFIX = "/api/dsh-workspace-tree";

/** DSH 配置根目录（仅用于 README 说明；v3 无持久化）。 */
function dshHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-cache"
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        req.destroy();
        reject(new Error("request body too large"));
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/** 调试：输出工作区注册表（path/title/id），用于诊断文件系统树。 */
async function handleDebug(ctx, req, res) {
  const registry = ctx.get("workspaceRegistry");
  if (!registry || typeof registry.list !== "function") {
    return sendJson(res, 200, { ok: false, error: "workspaceRegistry 不可用" });
  }
  const records = registry.list();
  sendJson(res, 200, {
    ok: true,
    workspaces: records.map((r) => ({
      workspaceId: String(r.id),
      title: r.title,
      path: r.path,
      sessionCount: Array.isArray(r.sessionIds) ? r.sessionIds.length : 0
    }))
  });
}

/** 新建子目录：真实 fs.mkdir（不依赖官方 browse 能力）。 */
async function handleMkdir(req, res) {
  const raw = JSON.parse(await readBody(req));
  const parent = typeof raw.parent === "string" ? raw.parent.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!parent || !name) return sendJson(res, 200, { ok: false, error: "parent 与 name 必填" });
  if (/[\\/:*?"<>|]/.test(name)) return sendJson(res, 200, { ok: false, error: "文件夹名包含非法字符" });
  const target = join(parent, name);
  await mkdir(target);
  sendJson(res, 200, { ok: true, path: target });
}

// ══════════════ 在文件夹中打开（自包含后端） ══════════════
// 官方浏览器被本插件 shadow 后，官方 UI 的「在文件夹中打开」按钮消失；
// 树 UI 复刻按钮后，后端由本插件自带（/api/dsh-workspace-tree/open-folder），
// 插件自包含——不依赖用户另行安装 dsh-open-folder 插件。
// 逻辑移植自 dsh-open-folder v2.2：stat 校验 / cmd start（ShellExecute 语义）/
// 去抖 1.2s / 前台激活（AppActivate 轮询）/ 会话 cwd 三级兜底 / 审计日志。
const OPEN_DEBOUNCE_MS = 1200;
const OPEN_CWD_TTL_MS = 60_000;
const OPEN_LOG_PATH = join(process.env.USERPROFILE ?? process.env.HOME ?? ".", ".dsh", "open-folder.log");
/** path -> 最近一次打开时间戳（去抖） */
const openRecent = new Map();
/** sessionId -> { cwd, at }（解析缓存） */
const openCwdCache = new Map();

function openAudit(msg) {
  try { appendFileSync(OPEN_LOG_PATH, new Date().toISOString() + " " + msg + "\n"); } catch { /* ignore */ }
}

/** 解析会话工作目录：live → 持久化 → 工作区归属。 */
async function openResolveCwd(sessionId, sessions, persistence, workspaces) {
  const hit = openCwdCache.get(sessionId);
  if (hit && Date.now() - hit.at < OPEN_CWD_TTL_MS) return hit.cwd;
  let cwd = null;
  const live = sessions?.get(sessionId);
  if (live) cwd = live.header?.cwd ?? live.meta?.cwd ?? null;
  if (!cwd && persistence) {
    try {
      const headers = await persistence.list();
      cwd = headers.find((h) => h.id === sessionId)?.cwd ?? null;
    } catch (err) { openAudit("persistence 兜底失败: " + String(err?.message ?? err)); }
  }
  if (!cwd && workspaces) {
    try {
      const ws = workspaces.list().find((w) => w.sessionIds.includes(sessionId));
      cwd = ws?.path ?? null;
    } catch (err) { openAudit("workspace 兜底失败: " + String(err?.message ?? err)); }
  }
  openCwdCache.set(sessionId, { cwd, at: Date.now() });
  return cwd;
}

/** 解析目标路径：body.path / ?path= / body.sessionId（多级兜底）。 */
async function openResolveTarget(req, body, deps) {
  let target = typeof body?.path === "string" && body.path.length > 0
    ? body.path
    : new URL(req.url ?? "/", "http://x").searchParams.get("path");
  if (typeof target === "string" && target.length > 0) return { target, source: "path" };
  const sessionId = typeof body?.sessionId === "string" && body.sessionId.length > 0 ? body.sessionId : "";
  if (!sessionId) return { target: null, source: "none" };
  target = await openResolveCwd(sessionId, deps.sessions, deps.sessionPersistence, deps.workspaceRegistry);
  return { target, source: target ? "session" : "session-unresolved" };
}

/** 前台激活（尽力而为→轮询重试）：explorer 新窗口可能被焦点保护压到后台。 */
function openBringToFront(dir) {
  let base = basename(dir);
  if (!base || base.length > 28 || /^[a-zA-Z]:$/.test(base)) return;
  const script = "Start-Sleep -Milliseconds 150; Add-Type -AssemblyName Microsoft.VisualBasic; for ($i = 0; $i -lt 6; $i++) { if ([Microsoft.VisualBasic.Interaction]::AppActivate('" + base.replace(/'/g, "''") + "')) { break }; Start-Sleep -Milliseconds 150 }";
  const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script], { detached: true, stdio: "ignore" });
  child.on("error", (err) => { openAudit("bringToFront spawn error: " + String(err)); });
  child.unref();
}

/** POST /api/dsh-workspace-tree/open-folder { path | sessionId } → 打开对应目录。 */
async function handleOpenFolder(req, res, deps) {
  try {
    if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "method not allowed" });
    const raw = await readBody(req);
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { return sendJson(res, 400, { ok: false, error: "invalid json" }); }
    openAudit("收到请求 url=" + req.url + " body=" + (raw || "(空)"));
    const { target, source } = await openResolveTarget(req, body, deps);
    if (target === null) {
      const msg = source === "session-unresolved"
        ? "该会话未找到或没有关联文件夹"
        : "缺少路径参数（path 或 sessionId）";
      openAudit("解析失败 400: " + msg);
      return sendJson(res, 400, { ok: false, error: msg });
    }
    openAudit("目标路径: " + target + "（来源: " + source + "）");
    let st;
    try {
      st = await stat(target);
    } catch {
      openAudit("路径不存在 404: " + target);
      return sendJson(res, 404, { ok: false, error: "路径不存在: " + target, path: target });
    }
    // 去抖：同一路径 1.2s 内重复请求直接返回（防连点叠窗）
    const now = Date.now();
    const last = openRecent.get(target);
    if (last !== undefined && now - last < OPEN_DEBOUNCE_MS) {
      openAudit("去抖命中（1.2s 内重复）: " + target);
      return sendJson(res, 200, { ok: true, debounced: true });
    }
    openRecent.set(target, now);
    if (openRecent.size > 128) {
      for (const [key, ts] of openRecent) if (now - ts >= OPEN_DEBOUNCE_MS) openRecent.delete(key);
    }
    if (st.isFile()) {
      openAudit("cmd start explorer /select " + target);
      // 宿主进程内 explorer.exe 直启会 exit 1 且不出现窗口，统一走 cmd /c start（ShellExecute 语义）
      const child = spawn("cmd.exe", ["/c", "start", "", "explorer.exe", "/select," + target], { detached: true, stdio: "ignore" });
      child.on("error", (err) => { openAudit("cmd start error: " + String(err)); });
      child.unref();
    } else {
      openAudit("spawn cmd start " + target);
      const child = spawn("cmd.exe", ["/c", "start", "", target], { detached: true, stdio: "ignore" });
      child.on("error", (err) => { openAudit("cmd start error: " + String(err)); });
      child.unref();
      openBringToFront(target);
    }
    sendJson(res, 200, { ok: true });
    openAudit("响应 200 ok");
  } catch (err) {
    openAudit("异常 500: " + String(err?.message ?? err));
    sendJson(res, 500, { ok: false, error: String(err?.message ?? err) });
  }
}

function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: PREFIX,
    handler: async (req, res) => {
      const url = new URL(req.url || "/", "http://x");
      const rest = url.pathname.split("/").filter(Boolean).slice(2);
      const head = rest[0];
      try {
        if (head === "debug" && (req.method === "GET" || req.method === "HEAD")) return await handleDebug(ctx, req, res);
        if (head === "mkdir" && req.method === "POST") return await handleMkdir(req, res);
        if (head === "open-folder" && req.method === "POST") return await handleOpenFolder(req, res, {
          sessions: ctx.get("sessions"),
          sessionPersistence: ctx.get("sessionPersistence"),
          workspaceRegistry: ctx.get("workspaceRegistry")
        });
        sendJson(res, 404, { ok: false, error: "not found" });
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String((error && error.message) || error) });
      }
    }
  }), "dsh-workspace-tree: routes");
}

export { apply, inject, name };
