# GitHub Gist 跨设备同步 · 设置步骤（小白版）

## 这是什么

让你的 AI 总参谋工作台实现跨设备共享次数。比如年卡 500 次，团队 3 个人在不同手机上使用，扣的是同一个数，不会各扣各的。

不需要注册任何新服务——你已经有 GitHub 账号（就是托管工作台的那个账号）。

---

## 设置步骤（2 分钟，只能做一次）

### 第 1 步：打开 GitHub Token 页面

用浏览器打开：
https://github.com/settings/tokens

点左上角 **"Generate new token"** → 选 **"Generate new token (classic)"**

### 第 2 步：创建 Token

1. **Note**：随便填，比如 `AI总参谋同步`
2. **Expiration**：选 `No expiration`（永不过期）
3. **勾选权限**：只勾 **`gist`** 这一项（Create gists）
4. 拉到页面最下面，点绿色的 **`Generate token`** 按钮

### 第 3 步：复制 Token

生成后会显示一串字母，像 `ghp_xxxxxxxxxxxxxxxxxxxx`

**立刻复制！** 这个页面关了就再也看不到了。

### 第 4 步：填入工作台

打开 `工具_AI总参谋工作台_Andy.html`，找到第 694 行附近：

```js
const GH_TOKEN = '';
```

把 Token 粘贴进去：

```js
const GH_TOKEN = 'ghp_xxxxxxxxxxxxxxxxxxxx';
```

保存文件。

### 第 5 步：更新 GitHub Pages

把修改后的文件推送到 GitHub，等 Pages 自动更新。

---

## 验证

1. 手机上打开工作台，输入激活码 + 微信号 → 激活成功
2. 使用一次功能（点"复制指令"）→ 剩余次数减 1
3. 另一台手机打开工作台，输入同一个激活码 → 看到次数已同步

---

## 如果不想用了

把 `GH_TOKEN` 改回 `''` 空字符串即可，工作台会自动切换回本地计数模式。

---

## 安全说明

- Token 只有 **gist（代码片段）** 权限，无法访问你的代码仓库
- Token 存在工作台 HTML 里，任何人查看页面源码都能看到
- 如果泄露：去 https://github.com/settings/tokens 删掉这个 Token，重新生成一个
- 工作台有激活码保护，不相关的人无法使用
