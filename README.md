# arcade_ftw_fe

Arcade FTW 前端（React 19 + TypeScript + Vite）。与现有 `cyber_ai_festival` 完全隔离。

> 跨项目文档（系统手册 / WS 协议 / 题型契约 / AWS）见 [`../arcade_ftw_docs`](../arcade_ftw_docs)。

## 结构

```
.github/workflows/
└── deploy.yml           # CI：build → S3（分级缓存）→ CloudFront 失效 → 验证
infra/
└── cloudformation.yml   # S3（私有 + OAC）+ CloudFront + SPA 回退函数 + OIDC 部署角色
src/
├── main.tsx             # 入口
├── App.tsx              # 路由：/ /play /r/:code /display /display/:code /admin /status
├── api.ts               # 同源相对路径 API 客户端（登录、房间、玩家、分数）
├── store/gameStore.ts   # zustand 中央 store（phase / node / question / 连接状态）
├── hooks/               # WS 自动重连、250ms ticker、节点已用时间
├── views/               # 玩家、大屏、管理台、员工登录
├── games/               # Hallucination / Quiz / Data Shadow（内容 + 计分 + 界面）
└── pages/StatusPage.tsx # 诊断页：/health、/health/db、/api/ws 的实时状态
```

## 同源架构

前端与 API **共用同一个 CloudFront 域名**，所以前端一律用**相对路径**（`/health`、`/api/ws`），不写绝对地址、也没有 CORS：

| 路径 | CloudFront 行为 |
|---|---|
| `/` 及其它 | → S3（静态文件）；SPA 回退函数把无扩展名路径改写成 `/index.html` |
| `/api/*` | → 后端 ALB（缓存关闭，允许全部方法，WebSocket 走这里）|
| `/health*` | → 后端 ALB（例外：运维端点留在根路径供 ALB 探活）|

> ⚠️ **刻意没有配置分发表级的 `403/404 → 200 /index.html`**。旧系统就是这么做的，结果所有后端错误都伪装成 `200 text/html`，极难排查。这里改用只在 S3 行为上生效的 CloudFront Function 做 SPA 回退，**打错的 API 路径会返回真实的 404 JSON**。

## 本地运行

```bash
npm install
npm run dev     # 5070（在 vite.config.ts 里固定，strictPort）
```

`vite.config.ts` 里配了 dev proxy，把 `/health` 与 `/api` 转发到 `http://localhost:5071`，所以**本地与线上跑的是同一套相对路径代码**（见 `arcade_ftw_be`）。

## 部署

### 基础设施（CloudFormation）

`infra/cloudformation.yml` —— S3 桶（私有 + OAC）、CloudFront 分发、SPA 回退函数、前端 repo 专用的 OIDC 部署角色。

API 源站通过 `Fn::ImportValue` 读取后端栈导出的 `arcade-ftw-AlbDns`，两边**永不漂移**。副作用：后端栈在前端栈存在期间**无法单独删除**。

```bash
aws cloudformation deploy \
  --template-file infra/cloudformation.yml \
  --stack-name arcade-ftw-frontend \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ap-south-1
```

### CI

`push main` → OIDC 换凭证 → `npm ci` → lint → build → S3 同步 → CloudFront 失效 → 验证 `/health`。

**缓存策略**（分开传是为了避免「前端发新版但用户拿到旧页面」）：
- `dist/assets/*`（Vite 会加内容哈希）→ `max-age=31536000, immutable`
- 其余（尤其 `index.html`）→ `no-cache`

## 脚本

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器（HMR）|
| `npm run build` | `tsc -b` + `vite build` |
| `npm run lint` | oxlint |
| `npm run preview` | 预览产物 |

