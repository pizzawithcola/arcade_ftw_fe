# arcade_ftw_fe

Arcade FTW 前端骨架（React 19 + TypeScript + Vite）。与现有 `cyber_ai_festival` 完全隔离。

> 跨项目文档（系统手册 / WS 协议 / 题型契约 / AWS）见 [`../arcade_ftw_docs`](../arcade_ftw_docs)。

## 结构

```
src/
├── main.tsx             # 入口
├── App.tsx              # 根组件
└── store/gameStore.ts   # zustand 中央 store（按 WS 消息更新 phase / current）
```

## 本地运行

```bash
npm install
npm run dev     # 5070（在 vite.config.ts 里固定，strictPort）
```

后端默认跑在 `http://localhost:5071`（见 `arcade_ftw_be`）。

## 脚本

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器（HMR）|
| `npm run build` | `tsc -b` + `vite build` |
| `npm run lint` | oxlint |
| `npm run preview` | 预览产物 |

