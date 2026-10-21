# 省级中小学足球联赛管理系统 · 前端

面向省、市州、学校 / 球队、运动员与教练员的青少年校园足球赛事前端原型。覆盖门户网站、八类角色控制台、报名与审核、赛事编排与记录、遴选、公示、内容运营和系统管理，内置 Mock 数据，无需后端即可独立运行。

> 页面清单、权限体系、组件复用与模块完成度详见 **[football-front/README.md](football-front/README.md)**。

## 功能概览

- **门户网站**：首页、赛事资讯、政策公告、赛程与比分、比赛详情、射手榜、公示查询、政策问答。
- **报名管理**：三类主体统一报名向导、球员 Excel 导入、照片 ZIP 匹配、材料上传、报名单编辑与导出。
- **审核管理**：市州初审、省级终审、驳回原因、审核记录、报名统计。
- **赛事与比赛**：赛事 / 组别配置、比赛管理、记录台（进球、判罚、换人）、图文直播、战报与成绩发布。
- **球队与人员**：球队资料、球员名单、教练团队、球队材料、个人资料与履历。
- **遴选管理**：遴选档案、评分规则、评分录入、排名汇总、正式结果。
- **门户运营**：内容管理、门户资源、公示管理、身份核验。
- **系统管理**：人员、参赛主体、账号、权限矩阵、组织、字典、操作日志。
- **权限体系**：菜单、路由、按钮、数据范围四层权限，支持一键切换 8 类演示身份。

## 技术栈

Vue 3（`<script setup>`）+ TypeScript + Vite + Element Plus + Pinia + Vue Router + Axios + dayjs。

## 快速开始

应用位于 `football-front/` 子目录：

```bash
cd football-front
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
| `province` | PROVINCE_REVIEWER | 省级审核端：终审、赛事配置、成绩、内容与公示 |
| `athlete` | ATHLETE | 运动员：个人资料、履历、所属队伍 |
| `coach` | COACH | 教练员：个人资料、履历、所属队伍 |
| `admin` | ADMIN | 管理员：全部模块 |
| `recorder` | MATCH_RECORDER | 赛事记录员：比赛记录台、身份核验 |

> 根目录的 `package.json` 仅保留依赖清单，不包含启动脚本，请在 `football-front/` 下运行项目。

## 接入真实后端

复制 `football-front/.env.example` 为 `football-front/.env.local`：

```bash
VITE_USE_MOCK=false
VITE_API_BASE_URL=/api/v1
```

接口封装位于 `football-front/src/api/`，Mock 实现在 `football-front/src/mock/adapter.ts`，两者使用同一套 `{ code, message, data, requestId }` 响应约定。

## 项目结构

```text
.
├── football-front/          # Vue 3 前端应用
│   ├── src/
│   │   ├── api/             # 接口封装与领域类型
│   │   ├── mock/            # Mock 适配器与种子数据
│   │   ├── config/          # 角色菜单、权限点
│   │   ├── composables/     # 组合式函数
│   │   ├── layouts/         # 门户 / 控制台布局
│   │   ├── components/      # 通用组件
│   │   ├── views/           # 门户及各业务模块页面
│   │   ├── stores/          # auth / app
│   │   └── styles/          # 设计变量与全局样式
│   └── README.md            # 详细说明
├── 后端接口文档.md           # 接口约定
├── 省级中小学足球系统_10天版优化分工.xlsx
└── 省级中小学足球系统_前端项目汇报.pptx
```

## 当前状态

已完成基础页面、四层权限体系与 33 个业务模块的主流程交互。所有写操作按接口文档传递乐观锁 `version`；Mock 模式下的下载 / 导出会提示“模拟下载”，接入真实后端后自动获取文件流。

本项目为前端原型，演示数据均为模拟数据。
