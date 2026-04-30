# AI总参谋 · 后端部署指南

## 概述

Cloudflare Worker 提供跨设备共享的激活码状态管理，包括：
- 微信号绑定 & 人数限制（跨设备生效）
- 使用次数共享扣减（所有人扣同一个配额）

**免费额度：** 每天 10 万次请求，完全够用。

---

## 部署步骤

### 1. 注册 Cloudflare 账号

访问 https://dash.cloudflare.com/sign-up 注册（免费）。

### 2. 安装 Wrangler CLI

```bash
npm install -g wrangler
wrangler login
```

### 3. 创建 KV 命名空间

```bash
cd backend
npx wrangler kv:namespace create CODE_STORE
npx wrangler kv:namespace create CODE_STORE --preview
```

输出类似：
```
{ "binding": "CODE_STORE", "id": "abc123..." }
```

### 4. 配置 wrangler.toml

把上一步输出的 id 填进 `wrangler.toml`：

```toml
[[kv_namespaces]]
binding = "CODE_STORE"
id = "abc123..."        # ← 填这里
preview_id = "def456..." # ← 填这里
```

### 5. 部署

```bash
npx wrangler deploy
```

部署成功后会输出 Worker 的 URL，类似：
```
https://ai-zongcanmou-api.你的用户名.workers.dev
```

### 6. 配置工作台

打开 `工具_AI总参谋工作台_Andy.html`，找到：

```js
const API_BASE = '';
```

改为：

```js
const API_BASE = 'https://ai-zongcanmou-api.你的用户名.workers.dev';
```

重新部署工作台到 GitHub Pages，完成。

---

## 验证

1. 生成一个激活码（设置 3 人、30 次）
2. 在手机上用微信号 A 激活 → 成功
3. 用微信号 B 在另一台设备激活 → 成功
4. 用微信号 B 使用一次 → 次数从 30 变为 29
5. 回到第一台设备刷新 → 次数显示 29 ✓
6. 用微信号 C、D 激活 → D 被拒绝 ✓

---

## API 接口

| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/activate` | 绑定微信号，校验人数上限 |
| POST | `/use` | 扣减一次使用次数 |
| GET | `/state?code=XXX` | 查询当前状态 |

---

## 安全说明

- Worker 代码中的 `SECRET` 与工作台一致，用于解密激活码
- KV 存储按激活码到期时间 +90 天自动过期清理
- 不存储任何明文经营数据
