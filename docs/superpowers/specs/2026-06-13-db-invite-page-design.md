# 愉景湾居民邀请页（db_invite） — 设计文档

_日期：2026-06-13 · 项目：brew-dashboard_

---

## 一、背景

已有一份现成草稿 `~/Downloads/db_invite.html`（标题 "Your Weekend in Shenzhen — Chrono Brewery"），
是面向香港愉景湾（Discovery Bay）居民的单页邀请/攻略页面，介绍如何从愉景湾跨境到深圳南山的
時光釀造所（Chrono Brewery），含交通步骤、巴士时间表、周末行程推荐、周边景点、联系方式等。

目标：先把这个页面原样上线到一个可分享的 URL，内容文案后续再迭代。

## 二、上线方案

- **域名**：复用现有 `dashboard.dbbrewbeer.com`（已指向本 Vercel 项目，零新增 DNS 配置）
- **路径**：`/db` → 最终地址 `dashboard.dbbrewbeer.com/db`
- **路由**：在 `vercel.json` 的 `rewrites` 中新增：
  ```json
  { "source": "/db", "destination": "/db-invite.html" }
  ```
- **部署**：git push 到 `main`，沿用 Vercel 现有的 git 自动部署流程

## 三、图片处理

源文件 9.8MB，其中 10 张图片以 base64 内嵌在 `<img src="data:image/...">` 中
（实际都是 JPEG 数据，标了 `image/png` 的 MIME 是误标）。直接上线对移动端分享场景不友好。

处理方式：
1. 解码全部 10 张图片为独立文件
2. 转换为 WebP，按用途限制最大尺寸（首图/通栏图 ≤1600px 宽，其余 ≤1200px 宽）
3. 命名为 `db-invite-01.webp` ~ `db-invite-10.webp`，放在项目根目录
   （沿用 `logo.png` / `cup.png` 等现有扁平资源结构）
4. 现有构建命令已包含 `cp -n ../*.webp dist/`，无需改构建脚本
5. 更新 HTML 中对应 `<img src>` 为 `/db-invite-XX.webp`

预期效果：页面体积从 ~10MB 降到 1-2MB 左右。

## 四、文件清单

| 文件 | 操作 |
|------|------|
| `db-invite.html` | 新增（清理后的页面，根目录） |
| `db-invite-01.webp` ~ `db-invite-10.webp` | 新增（提取并压缩的图片，根目录） |
| `vercel.json` | 修改（新增一条 rewrite） |

## 五、范围说明

本次只做"原样上线 + 图片优化 + 路由"，不改动文案、行程内容、联系方式等。
后续如需调整内容，再单独迭代。

## 六、验证

- 本地用静态服务器打开 `db-invite.html`，确认所有图片正常加载、布局正常
- 部署后访问 `dashboard.dbbrewbeer.com/db` 确认可达
