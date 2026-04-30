// ============================================================
// AI总参谋 · Cloudflare Worker 后端
// 用途：跨设备共享激活码状态（微信号绑定 + 使用次数）
// 部署：npx wrangler deploy
// ============================================================

const SECRET = "miaohan1913_AI_2026_KEY";

// ========== 加密工具（与前端完全一致）==========
function decrypt(encoded, key) {
    try {
        encoded = encoded.replace(/[\._]/g, c => ({ '.': '+', '_': '/' }[c]));
        while (encoded.length % 4) encoded += '=';
        const bytes = atob(encoded);
        let result = '';
        for (let i = 0; i < bytes.length; i += 2) {
            const hi = bytes.charCodeAt(i) & 0xFF;
            const lo = bytes.charCodeAt(i + 1) & 0xFF;
            const c = (hi << 8) | lo;
            result += String.fromCharCode(c ^ key.charCodeAt((i / 2) % key.length));
        }
        return result;
    } catch (e) {
        return '';
    }
}

function simpleHash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 3266489909);
    return (h1 ^ h2) >>> 0;
}

function validateAndDecode(rawCode) {
    const clean = rawCode.replace(/[-\s]/g, '');
    if (clean.length < 12) return { error: '激活码格式错误' };
    const hashPart = clean.slice(-4).toUpperCase();
    const dataPart = clean.slice(0, -4);
    const expectedHash = simpleHash(dataPart + SECRET).toString(16).slice(0, 4).toUpperCase();
    if (hashPart !== expectedHash) return { error: '激活码无效' };
    const payload = decrypt(dataPart, SECRET);
    if (!payload) return { error: '激活码数据损坏' };
    const parts = payload.split('|');
    if (parts.length < 4) return { error: '激活码数据损坏' };
    const expiry = new Date(parts[0] + 'T23:59:59');
    if (new Date() > expiry) return { error: '激活码已过期' };
    return {
        expiry: parts[0],
        maxUses: parseInt(parts[1]) || 0,
        userName: parts[2],
        maxWechatUsers: parts.length >= 5 ? (parseInt(parts[4]) || 0) : 0,
        codeHash: simpleHash(clean).toString(16)
    };
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
    });
}

// ========== KV 操作 ==========
async function getState(codeHash, env) {
    try {
        const raw = await env.CODE_STORE.get(codeHash);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

async function saveState(codeHash, state, env) {
    // 过期时间：激活码到期日 + 90天清理
    const expiryDate = new Date(state.expiry + 'T23:59:59');
    const ttl = Math.max(86400, Math.floor((expiryDate.getTime() - Date.now()) / 1000) + 7776000);
    await env.CODE_STORE.put(codeHash, JSON.stringify(state), { expirationTtl: ttl });
}

// ========== API 处理 ==========

// POST /activate — 激活绑定微信号
async function handleActivate(body, env) {
    const { code, wechatId } = body;
    if (!code || !wechatId) return json({ success: false, error: '缺少参数' }, 400);

    // 解密激活码
    const decoded = validateAndDecode(code);
    if (decoded.error) return json({ success: false, error: decoded.error }, 403);

    // 读取或初始化状态
    let state = await getState(decoded.codeHash, env);
    if (!state) {
        state = {
            wechatIds: [],
            uses: 0,
            maxUses: decoded.maxUses,
            maxWechatUsers: decoded.maxWechatUsers,
            expiry: decoded.expiry,
            userName: decoded.userName
        };
    } else {
        // 用激活码中的最新参数更新（允许通过重新生成激活码来升级套餐）
        state.maxUses = decoded.maxUses;
        state.maxWechatUsers = decoded.maxWechatUsers;
        state.expiry = decoded.expiry;
    }

    // 检查微信号人数限制
    if (state.maxWechatUsers > 0) {
        if (state.wechatIds.indexOf(wechatId) === -1) {
            if (state.wechatIds.length >= state.maxWechatUsers) {
                return json({
                    success: false,
                    error: '已达人数上限（最多' + state.maxWechatUsers + '人）',
                    bindCount: state.wechatIds.length,
                    maxWechatUsers: state.maxWechatUsers
                }, 403);
            }
            state.wechatIds.push(wechatId);
        }
    }

    // 检查次数
    if (state.maxUses > 0 && state.uses >= state.maxUses) {
        return json({ success: false, error: '使用次数已用完' }, 403);
    }

    await saveState(decoded.codeHash, state, env);

    return json({
        success: true,
        bindCount: state.wechatIds.length,
        maxWechatUsers: state.maxWechatUsers,
        uses: state.uses,
        maxUses: state.maxUses,
        userName: state.userName,
        expiry: state.expiry
    });
}

// POST /use — 扣减一次使用次数
async function handleUse(body, env) {
    const { code, wechatId } = body;
    if (!code) return json({ success: false, error: '缺少参数' }, 400);

    const decoded = validateAndDecode(code);
    if (decoded.error) return json({ success: false, error: decoded.error }, 403);

    let state = await getState(decoded.codeHash, env);
    if (!state) {
        // 首次使用（未经过 activate 直接使用的情况）
        state = {
            wechatIds: wechatId ? [wechatId] : [],
            uses: 0,
            maxUses: decoded.maxUses,
            maxWechatUsers: decoded.maxWechatUsers,
            expiry: decoded.expiry,
            userName: decoded.userName
        };
    }

    // 检查次数
    if (state.maxUses > 0 && state.uses >= state.maxUses) {
        return json({ success: false, error: '使用次数已用完', uses: state.uses, maxUses: state.maxUses }, 403);
    }

    // 检查微信号（如果限制人数）
    if (state.maxWechatUsers > 0 && wechatId) {
        if (state.wechatIds.indexOf(wechatId) === -1) {
            if (state.wechatIds.length >= state.maxWechatUsers) {
                return json({ success: false, error: '已达人数上限', bindCount: state.wechatIds.length, maxWechatUsers: state.maxWechatUsers }, 403);
            }
            state.wechatIds.push(wechatId);
        }
    }

    state.uses++;
    await saveState(decoded.codeHash, state, env);

    return json({
        success: true,
        uses: state.uses,
        maxUses: state.maxUses,
        userName: state.userName
    });
}

// GET /state?code=XXXX — 查询当前状态（同步用）
async function handleState(url, env) {
    const code = url.searchParams.get('code');
    if (!code) return json({ success: false, error: '缺少参数' }, 400);

    const decoded = validateAndDecode(code);
    if (decoded.error) return json({ success: false, error: decoded.error }, 403);

    const state = await getState(decoded.codeHash, env);
    if (!state) {
        return json({
            exists: false,
            uses: 0,
            maxUses: decoded.maxUses,
            maxWechatUsers: decoded.maxWechatUsers,
            bindCount: 0,
            userName: decoded.userName,
            expiry: decoded.expiry
        });
    }

    return json({
        exists: true,
        uses: state.uses,
        maxUses: state.maxUses,
        maxWechatUsers: state.maxWechatUsers,
        bindCount: state.wechatIds.length,
        userName: state.userName,
        expiry: state.expiry
    });
}

// ========== 主入口 ==========
export default {
    async fetch(request, env) {
        // CORS 预检
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                }
            });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        try {
            if (request.method === 'POST' && path === '/activate') {
                const body = await request.json();
                return handleActivate(body, env);
            }

            if (request.method === 'POST' && path === '/use') {
                const body = await request.json();
                return handleUse(body, env);
            }

            if (request.method === 'GET' && path === '/state') {
                return handleState(url, env);
            }

            return json({ error: 'Not Found' }, 404);
        } catch (e) {
            return json({ success: false, error: '服务器内部错误' }, 500);
        }
    }
};
