# BrewOps 发酵管理系统 — 设计文档

_日期：2026-05-15 · 项目：brew-dashboard_

---

## 一、产品定位

面向精酿酒厂的 SaaS 发酵过程管理系统。多租户架构，核心用户是酿酒师。主要场景：车间大屏常驻看板 + 罐边手机操作。

- **产品名**：BrewOps
- **核心价值**：入罐前填配方，系统自动排期；节点到期提醒酿酒师；一键记录操作，数据永久留存
- **账户模型**：邀请制，Owner 注册后邀请团队成员；两种角色（owner / brewer）

---

## 二、技术选型

| 层 | 选型 | 原因 |
|----|------|------|
| 前端 | React 18 + Vite + Tailwind（内联样式） | 复用已有代码，快速开发 |
| 状态 | useState / useReducer + 自定义 hooks | 无需 Redux |
| 后端 | Supabase（Auth + DB + RLS） | 已有实例，零额外成本 |
| 部署 | Vercel，现有项目新增 builds 入口 | 不新增基础设施 |
| 邀请邮件 | Supabase Admin `inviteUserByEmail` | 内置，无需第三方邮件服务 |

---

## 三、目录结构

```
brew-dashboard/
├── brewops/                    ← 新增 Vite + React SPA
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx             ← 路由根 + Auth guard
│   │   ├── constants.js        ← STEPS, DEF, TCOLS, C
│   │   ├── utils.js            ← 日期工具函数
│   │   ├── lib/
│   │   │   └── supabase.js     ← anon key 客户端
│   │   ├── hooks/
│   │   │   ├── useAuth.js      ← session / user
│   │   │   ├── useBrewery.js   ← brewery + role + members
│   │   │   └── useBatches.js   ← 批次 CRUD + 日志
│   │   ├── components/
│   │   │   ├── BlinkPill.jsx
│   │   │   ├── GanttView.jsx
│   │   │   ├── TodayView.jsx
│   │   │   ├── LogsView.jsx
│   │   │   ├── LogSheet.jsx
│   │   │   ├── EditSheet.jsx
│   │   │   └── AddSheet.jsx
│   │   └── pages/
│   │       ├── LoginPage.jsx
│   │       ├── SetupPage.jsx
│   │       └── SettingsPage.jsx
│   ├── index.html
│   ├── vite.config.js          ← base: '/brewops/', outDir: 'dist'
│   └── package.json
│
├── api/
│   └── brewops/
│       └── invite.js           ← 邀请成员（service key，服务端）
│
└── vercel.json                 ← 新增 brewops builds + routes
```

---

## 四、数据库 Schema

### 表定义

```sql
-- 酒厂
CREATE TABLE breweries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text UNIQUE NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- 成员（多租户核心）
CREATE TABLE brewery_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brewery_id   uuid REFERENCES breweries NOT NULL,
  user_id      uuid REFERENCES auth.users NOT NULL,
  role         text CHECK (role IN ('owner','brewer')) NOT NULL,
  display_name text NOT NULL,
  status       text CHECK (status IN ('active','pending')) DEFAULT 'pending',
  created_at   timestamptz DEFAULT now(),
  UNIQUE(brewery_id, user_id)
);

-- 批次
CREATE TABLE batches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brewery_id  uuid REFERENCES breweries NOT NULL,
  tank        text NOT NULL,
  beer        text NOT NULL,
  batch_no    text,
  color       text NOT NULL DEFAULT '#1D9E75',
  og          text,
  yeast       text,
  notes       text,
  plan        jsonb NOT NULL,   -- {tank_in: "2025-05-01", yeast: "2025-05-02", ...}
  created_at  timestamptz DEFAULT now(),
  archived_at timestamptz       -- 软删除
);

-- 操作日志
CREATE TABLE batch_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brewery_id uuid REFERENCES breweries NOT NULL,  -- 冗余，RLS 直查
  batch_id   uuid REFERENCES batches NOT NULL,
  step_key   text NOT NULL,     -- "tank_in" 或 "_defer_dryhop1"
  operator   text,              -- display_name 快照
  ts         timestamptz NOT NULL DEFAULT now(),
  temp       text,
  brix       text,
  ph         text,
  note       text,
  is_defer   boolean DEFAULT false
);
```

### RLS 策略

```sql
-- 辅助函数（SECURITY DEFINER 避免递归）
CREATE FUNCTION my_brewery_id() RETURNS uuid AS $$
  SELECT brewery_id FROM brewery_members
  WHERE user_id = auth.uid() AND status = 'active' LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE FUNCTION my_role() RETURNS text AS $$
  SELECT role FROM brewery_members
  WHERE user_id = auth.uid() AND status = 'active' LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- breweries
ALTER TABLE breweries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own brewery" ON breweries
  FOR SELECT USING (id = my_brewery_id());

-- brewery_members
ALTER TABLE brewery_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read members" ON brewery_members
  FOR SELECT USING (brewery_id = my_brewery_id());
CREATE POLICY "owner manage" ON brewery_members
  FOR ALL USING (brewery_id = my_brewery_id() AND my_role() = 'owner');

-- batches
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant" ON batches FOR ALL USING (brewery_id = my_brewery_id());

-- batch_logs
ALTER TABLE batch_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant" ON batch_logs FOR ALL USING (brewery_id = my_brewery_id());
```

### 邀请激活 Trigger

```sql
CREATE FUNCTION handle_user_confirmed() RETURNS trigger AS $$
BEGIN
  UPDATE brewery_members SET status = 'active'
  WHERE user_id = NEW.id AND status = 'pending';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW WHEN (NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION handle_user_confirmed();
```

### 关键设计决策

| 决策 | 原因 |
|------|------|
| `plan` 存 jsonb | 节点可动态增减，8列无法扩展 |
| `batch_logs.brewery_id` 冗余 | RLS 直接过滤，无需 JOIN |
| `archived_at` 软删除 | 发酵数据有历史价值 |
| `operator` 存文字快照 | 成员离职后记录仍可读 |
| `is_defer` 独立字段 | 前端过滤方便，不解析前缀 |

---

## 五、账户管理流程

### 用户旅程

```
首次访问 /brewops
├── 未登录 → LoginPage（邮箱+密码）
│   └── 收到邀请链接 → SetPasswordPage（激活账号）
└── 已登录
    ├── 无所属酒厂（新 owner）→ SetupPage（创建酒厂）
    └── 有所属酒厂 → MainApp
        └── owner 可进入 SettingsPage（成员管理 + 邀请）
```

### 邀请流程

1. Owner 在 SettingsPage 输入邮箱，点「发邀请」
2. 前端调用 `POST /api/brewops/invite`（带 JWT）
3. `invite.js` 验证 JWT + owner 身份，调用 `supabase.auth.admin.inviteUserByEmail()`
4. 同时预写 `brewery_members(status: 'pending')`
5. 被邀请人收到邮件，点链接设密码
6. Supabase trigger 自动将 `brewery_members.status` 改为 `active`

### 前端路由

```jsx
<Routes>
  <Route path="/brewops/login"    element={<LoginPage />} />
  <Route path="/brewops/setup"    element={<RequireAuth><SetupPage /></RequireAuth>} />
  <Route path="/brewops/settings" element={<RequireOwner><SettingsPage /></RequireOwner>} />
  <Route path="/brewops/*"        element={<RequireAuth><MainApp /></RequireAuth>} />
</Routes>
```

---

## 六、核心 Hook 接口

```js
// useAuth: session 状态
const { session, user, loading, signIn, signOut } = useAuth()

// useBrewery: 租户上下文
const { brewery, role, members, inviteMember, removeMember } = useBrewery()

// useBatches: 批次数据（封装所有 Supabase 调用）
const { batches, loading, addBatch, updateBatch, archiveBatch,
        saveLog, deferStep } = useBatches(brewery?.id)
```

`App.jsx` 只替换 `useState(initBatches)` → `useBatches(breweryId)`，所有子组件不变。

---

## 七、Vercel 部署配置

```json
{
  "builds": [
    {
      "src": "brewops/package.json",
      "use": "@vercel/static-build",
      "config": { "distDir": "brewops/dist" }
    },
    { "src": "api/**/*.js", "use": "@vercel/node" }
  ],
  "routes": [
    { "src": "/brewops/assets/(.*)", "dest": "/brewops/dist/assets/$1" },
    { "src": "/brewops/(.*)",        "dest": "/brewops/dist/index.html" },
    { "src": "/api/(.*)",            "dest": "/api/$1" }
  ],
  "rewrites": [
    { "source": "/claimyourtap", "destination": "/claimyourtap.html" },
    { "source": "/class",        "destination": "/class.html" },
    { "source": "/class/",       "destination": "/class.html" }
  ],
  "crons": [
    { "path": "/api/cron/sponsor-expiry", "schedule": "0 2 * * *" }
  ]
}
```

### 环境变量

| 变量 | 用途 | 可见性 |
|------|------|--------|
| `SUPABASE_URL` | 现有 API 服务端 | 服务端 |
| `SUPABASE_SERVICE_KEY` | 现有 API 服务端 | 服务端 |
| `VITE_SUPABASE_URL` | BrewOps 前端 | 构建注入 |
| `VITE_SUPABASE_ANON_KEY` | BrewOps 前端 | 构建注入 |

---

## 八、现有代码复用说明

用户提供的 React 代码直接拆分为组件，无需重写，只做两处改动：

1. `App.jsx` 的 `useState(initBatches)` → `useBatches(brewery.id)`（异步加载）
2. `AddSheet`、`EditSheet`、`LogSheet` 的回调改为调用 `useBatches` 暴露的方法

其余组件（`GanttView`、`TodayView`、`LogsView`、`BlinkPill`）**零改动**。

---

## 九、节点数据结构（来自 PRD）

```js
const STEPS = [
  { k:"tank_in",   n:"入罐",     s:"入罐",    c:"#1D9E75", fixed:true  },
  { k:"yeast",     n:"酵母接种", s:"酵母",    c:"#378ADD", fixed:false },
  { k:"dryhop1",   n:"干投一",   s:"干投一",  c:"#BA7517", fixed:false },
  { k:"dryhop2",   n:"干投二",   s:"干投二",  c:"#D4537E", fixed:false },
  { k:"yeast_out", n:"排酵母",   s:"排酵母",  c:"#7F77DD", fixed:false },
  { k:"hop_out1",  n:"排酒花一", s:"排花一",  c:"#E24B4A", fixed:false },
  { k:"hop_out2",  n:"排酒花二", s:"排花二",  c:"#BA7517", fixed:false },
  { k:"fill",      n:"灌装",     s:"灌装",    c:"#0F6E56", fixed:false },
]
const DEF = {
  tank_in:0, yeast:1, dryhop1:5, dryhop2:7,
  yeast_out:10, hop_out1:12, hop_out2:14, fill:16
}
```
