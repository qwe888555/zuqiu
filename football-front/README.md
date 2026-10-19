# 省级中小学足球联赛 · 前端原型

基于 `后端接口文档.md` 搭建的省级中小学足球系统前端基础工程。已完成**角色权限侧边栏**、**门户网站**与**八类角色控制台基础页面**，可切换内置 Mock 数据独立运行，后续按模块逐步优化。

## 技术栈

Vue 3（`<script setup>`）+ TypeScript + Vite + Element Plus + Pinia + Vue Router + Axios + dayjs。

## 快速开始

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 类型检查 + 生产构建
```

默认启用内置 Mock 接口，无需启动后端。演示账号密码统一为 `12345678`：

| 账号 | 角色 | 说明 |
| --- | --- | --- |
| `team` | TEAM | 中小学球队端：球队、名单、报名、材料 |
| `university` | UNIVERSITY | 高校端：高校球队报名与材料 |
| `city` | CITY | 市州审核端：初审、统计、代报 |
| `province` | PROVINCE_REVIEWER | 省级审核端：终审、赛事配置、比赛成绩、内容与公示 |
| `athlete` | ATHLETE | 运动员：个人资料、履历、所属队伍 |
| `coach` | COACH | 教练员：个人资料、履历、所属队伍 |
| `admin` | ADMIN | 管理员：全部模块 |
| `recorder` | MATCH_RECORDER | 赛事记录员：比赛记录台、身份核验 |

## 页面板块

- **门户**：首页、新闻资讯、政策公告、赛事中心、比赛详情（图文直播/事件）、射手榜、公示信息、政策问答。
- **报名管理**：报名单、新建报名向导、报名详情、审核工作台、报名统计。
- **赛事与比赛**：比赛管理、赛事与组别配置、比赛记录台（进球/判罚/换人、直播、战报、成绩发布）。
- **球队管理**：参赛队伍（ADMIN 跨市州只读聚合）、球队资料、球员名单、教练团队、球队材料。
- **个人中心**（ATHLETE / COACH）：个人资料、履历材料、所属队伍、我的球队、我的公示。
- **遴选管理**（PROVINCE_REVIEWER / ADMIN）：遴选档案、评分规则、评分录入、排名汇总、正式结果。
- **门户运营**（ADMIN / PROVINCE_REVIEWER / MATCH_RECORDER）：内容管理、门户资源、公示管理、身份核验。
- **系统管理**（ADMIN）：人员管理、参赛主体、参赛账号、权限矩阵、组织结构、数据字典、操作日志。
- **消息中心**：所有角色可见，未读数与顶部铃铛同步。

## 权限管理

权限分为四层，彼此配合而非互相替代：

1. **菜单可见性**：`src/config/menus.ts` 为每个菜单声明可用角色，登录后按账号角色自动过滤侧边栏。
2. **页面访问**：路由 `meta.roles` 控制页面可达性，无权限访问会跳转到 `/console/forbidden` 403 页并展示当前角色与可访问入口。
3. **按钮级权限**：`src/config/permissions.ts` 定义 8 个权限组、32 个权限点及角色映射；页面通过 `usePermission().can()` 控制新建、审核、导出、发布等操作。管理员（ADMIN）默认拥有全部权限。
4. **数据范围**：Mock 层按市州（CITY）、球队（TEAM / UNIVERSITY）、本人（ATHLETE / COACH）做行级隔离，对应 `data.city` / `data.team` / `data.self` / `data.province`。

`系统管理 → 权限矩阵` 可按角色查看菜单、权限点与数据范围；`参赛账号` 负责账号与角色授权。演示模式下，右上角用户菜单支持**一键切换 8 类演示身份**，便于逐端验收。

## 组件与复用

列表页与详情页的通用结构已抽到 `src/components/common/`，页面只保留业务字段：

| 组件 / 模块 | 用途 | 使用范围 |
| --- | --- | --- |
| `PageHeader` | 页面标题、说明、返回与操作区 | 全部控制台页面 |
| `StatCard` | 统计卡片 | 工作台、报名统计、账号等 |
| `StatusTag` | 报名/比赛/赛事/内容/审核状态标签 | 各类列表与详情 |
| `FilterBar` | 筛选栏布局与右侧结果统计 | 15 个列表页 |
| `PaginationBar` | 分页状态回写与每页条数切换 | 18 个列表页 |
| `PolicyAssistant` | 门户政策问答 | 门户 |
| `config/labels.ts` | 角色、学段、参赛主体文案 | 登录、账号、球队、报名等 |
| `composables/usePermission.ts` | 按钮级权限判断 | 业务页面 |
| `composables/useTeamScope.ts` | 多球队账号的球队切换 | 球队与个人中心 |

新增列表页时直接组合 `PageHeader + FilterBar + el-table + PaginationBar`，无需再复制分页与筛选栏代码。

## 接入真实后端

复制 `.env.example` 为 `.env.local` 并调整：

```bash
VITE_USE_MOCK=false
VITE_API_BASE_URL=/api/v1
```

接口封装位于 `src/api/`，Mock 实现在 `src/mock/adapter.ts`，两者保持同一套 `{ code, message, data, requestId }` 响应约定。

## 目录结构

```
src/
  api/          # 接口封装与领域类型
  mock/         # Mock 适配器、种子数据
  config/       # 角色菜单与权限点配置
  composables/  # useTeamScope、usePermission 等组合式函数
  layouts/      # 门户 / 控制台布局
  components/   # PageHeader、StatCard、StatusTag 等通用组件
  views/        # 门户、报名、比赛、球队、个人、遴选、CMS、系统管理
  stores/       # auth / app
  styles/       # 设计变量与全局样式
```

## 当前阶段说明

当前已完成**基础页面 + 权限体系 + 33 个业务模块的主流程交互**：门户、八类角色控制台、菜单/页面/按钮/数据四层权限、403 页面与演示身份切换均已成型。核心业务闭环包括：

- **报名**：三类主体统一报名向导、球员 Excel 导入（模板下载、逐行错误 CSV 导出）与照片 ZIP 匹配、报名单编辑与草稿删除、名单增改删、材料分类上传/下载/删除、报名表 PDF 与球员信息表 Word 导出。
- **审核**：市州初审/省级终审、驳回原因与审核记录、材料下载、报名统计与导出。
- **档案**：人员头像与履历材料审核（人员管理抽屉）、球队队徽/队旗/合影上传、球队成员关系编辑、球队材料审核（参赛队伍详情页）。
- **赛事**：比赛新建/编辑/删除、裁判信息维护、发布到门户、比赛事件增改删、图文直播、赛事文件上传与下载、现场身份核验发起与人工复核。
- **其他**：遴选评分与汇总、CMS 内容与门户资源、公示发布、消息中心、账号/组织/字典/日志管理。

所有写操作已按接口文档传递乐观锁 `version`，删除接口使用查询参数。Mock 模式下的下载/导出会提示“模拟下载”，接入真实后端后自动获取文件流。
