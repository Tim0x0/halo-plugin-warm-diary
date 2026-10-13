# 暖阳日记 · warm-diary

面向 Halo 站长的个人文字日记本。前台是纸本手帐，后台直接使用 Halo Console 组件。新日记默认写给自己，也可以单独分享某一篇。

## 安装与使用

需要 **Halo 2.26.0 或更新版本**。在 Console 的「插件」中上传 `build/libs/plugin-warm-diary-0.1.0-alpha.6.jar` 并启用。

1. 首次打开 Console 内容菜单里的「日记」时点击「开始使用暖阳日记」。当前超级管理员会成为唯一日记主人；这是一次性初始化，完成后不能在界面重新认领。
2. 在后台或 `/diary` 写日记；主人登录后自动看到自己的全部日记。日期可以补写，一天可以写多篇；标题、心情、天气都可以留空，心情和天气从固定选项里选。
3. 内容自动保存。后台点日记行的「⋯ → 分享」，或前台正文页的「分享」，预览并确认后，访客才能读到这一版。之后的修改只保存到自己的版本，标题旁会出现「有修改未分享」的状态点，需要再次「更新分享」。
4. 后台提供搜索、按状态 / 日期 / 心情 / 天气筛选和回收站。时区与手帐便笺在插件列表的设置里填写：时区留空时使用 Halo 服务器时区，也可以填写 `Asia/Shanghai` 等 IANA 时区；便笺留空则使用「不必写得漂亮，真实就很好。」

| 入口 | 用途 |
| --- | --- |
| `/console/warm-diary` | 管理日记、初始化 |
| `/console/warm-diary/deleted` | 日记回收站、恢复和永久删除 |
| `/diary` | 统一目录：主人看全部日记，其他人只看已分享的 |
| `/diary/write` | 主人写日记 |
| `/diary/entry/{name}` | 统一阅读地址：主人看当前内容，其他人看已分享的版本 |

全站用词统一：一篇日记要么「写给自己」，要么「已分享」；对应的操作是「分享 / 更新分享 / 收回分享」。「删除」进回收站，回收站里可以「恢复」或「永久删除」。

前台 `/diary` 走主题 Thymeleaf 模板渲染，因此全站变灰一类通过 `TemplateHeadProcessor` 注入主题 `<head>` 的插件可以对日记页生效。可在 Halo 菜单中自行添加入口。以上路径需留给插件使用。

### 前台手帐

左侧是目录，右侧是正文。目录只列日期、标题（没有标题时取正文开头）和状态；点一篇只换右侧正文，目录、日历和滚动位置都留在原处。日期显示为「2026 年 9 月 22 日 · 星期二」。

日历对所有人开放：主人看到的是每天的日记数，访客只看到已分享的日期。点日期只看那一天，点月份标题只看那个月，左右箭头翻月份不改变筛选。关键词、状态（主人可用）、月份、日期和页码都写在地址里，刷新和前进后退都能恢复。

主人可以在页面内开启「访客预览」，此时目录、搜索、日历和正文全部换成访客看到的内容。预览是页面内状态，不进入地址；刷新后恢复主人视角。

正文页右下角是这一篇的操作：编辑、分享 / 更新分享、收回分享、删除。确认框和分享预览都是手帐样式的原生 `dialog`，预览里看到的就是访客读到的样子。

### 后台

后台列表按 Halo 文章列表的方式交互：关键词按回车搜索，状态、日期、心情、天气通过条件菜单选择，再次点击已选项可取消；日期提供今天、最近 7 天、本月和自定义范围，已选的自定义范围可以再次打开修改。条件和页码写入地址。

每行显示标题、心情、天气和日期；有未分享修改时标题旁有状态点，悬停可看改动了哪些字段。行尾的眼睛图标与 Halo 文章列表一致：睁眼表示已分享，点击收回；闭眼表示写给自己，点击预览并分享。「阅读」弹窗在有未分享修改时可以切换「当前内容」和「访客看到的版本」对照。

勾选当前页的日记后，搜索区域切换为批量操作；切换筛选、页码或回收站会清除选择。删除、收回分享、恢复、永久删除都用 Halo Dialog 确认；批量操作部分失败时保留失败项以便重试；分享仍逐篇预览确认。

## 保存与隐私

- 复用 Halo 账号登录。普通登录用户与匿名访客一样只能读已分享的版本，所有写入接口都会校验日记本主人。
- 分享时把日期、标题、正文、心情、天气一起复制成独立的分享版本。之后的自动保存只改自己的版本，分享版本不会跟着变，直到再次「更新分享」。心情或天气改了也算有修改未分享。
- 未分享的日记、未分享的修改不会出现在访客的目录、搜索、日历、分页总数或单篇响应中。日记不接入站点公共搜索、RSS 或站点地图。
- 收回分享或删除后，访客立即读不到；从回收站恢复后仍为写给自己。
- 目录和列表接口只返回摘要（日期、标题、正文开头 80 字、心情、天气、状态），正文在打开一篇时才取。
- 保存使用 Halo Extension 的版本控制。遇到网络失败或版本冲突会保留当前输入，可重试、查看服务器上的最新版本、另存为新日记或下载输入。关闭未保存页面会提醒。
- 使用 Halo 官方富文本编辑器，首版仅开放文字、加粗、斜体、列表、引用等格式。禁用图片、附件、嵌入内容，服务端还会清理 HTML。
- 不提供单独的导出。日记以 Halo 扩展模型存储，随 Halo 的「备份与恢复」一起备份和恢复。

这里的隐私是站点访问权限隔离，不是端到端加密。能直接访问数据库、服务器或 Halo 原始资源接口的超级管理员仍可访问底层数据。已被访客阅读、截图或下载的内容无法远程收回。

## 接口

两个接口分组都通过 `SpringdocRouteBuilder` 声明，OpenAPI 分组为 `warmDiary`，数据结构统一带 `Diary` 前缀。

| 分组 | 路径 | 说明 |
| --- | --- | --- |
| `api.warm-diary.timxs.com/v1alpha1` | `GET /readableentries`、`GET /readableentries/{name}`、`GET /readablecalendar`、`GET /session` | 所有身份共用。服务端从 Halo 登录上下文判断日记主人；`publicOnly=true` 只会缩小到已分享的版本，不能提升权限 |
| `console.api.warm-diary.timxs.com/v1alpha1` | `GET/POST /entries`、`GET/PUT /entries/{name}`、`POST /entries/{name}/{publish,unpublish,trash,restore,delete}`、`POST /notebooks/-/initialize` | 只有日记主人可用。写入要带 `X-Warm-Diary: 1` 头，并校验版本号 |

列表接口支持 `page`、`size`、`keyword`、`from`、`to`、`mood`、`weather`；`visibility` 只在主人身份下生效，`trash` 只有主人接口接受。无权阅读、不存在或已进回收站的日记一律返回 HTTP 404。

## 官方能力复用

项目由 Halo 官方 `create-halo-plugin@1.6.0` 实际生成，初始命令为：

```sh
npm exec --yes --package=create-halo-plugin@1.6.0 -- create-halo-plugin warm-diary --name=warm-diary --domain=com.timxs --author=Tim0x0 --includeUI --uiTool=vite
```

- 插件标识为 `warm-diary`，Java 包与 Gradle group 为 `com.timxs.warmdiary`。
- `timxs.com` 的 Java 命名空间按反向域名使用 `com.timxs`；Halo 资源组使用 `warm-diary.timxs.com`。
- Console 以 Halo 2.26.1 的文章列表及回收站为交互参照，直接使用宿主全局注册的 `SearchInput`、`FilterDropdown`、`FilterCleanButton`，并复用 `VEntity`、`VEntityField`、`VStatusDot`、`VTabbar`、分页、弹窗、Dialog 与 Toast。表单使用 FormKit。图标来自 Halo 使用的同一套 Remix Icon，通过 `unplugin-icons` 引入。
- 前后台编辑器均复用 `@halo-dev/richtext-editor`；Console 的 Vue、Halo 组件及编辑器由官方 ESM 共享机制加载。前台访客页只加载手帐自己的样式，Halo 组件和编辑器的样式随写日记页按需加载。
- 登录、权限、Extension 存储、版本校验、Setting 配置及静态资源路由都使用 Halo 提供的能力。
- 接口通过官方 `generateApiClient` 生成 TypeScript 类型和方法，再接入官方 `axiosInstance`。
- 构建保留官方 Gradle Wrapper 9.4.0、Halo DevTools 0.8.0、UI Plugin Bundler Kit 2.26.0；UI 使用 pnpm 与锁文件，与 `create-halo-plugin` 及官方 CI 一致。

Console 交互对照 [Halo 2.26.1 PostList](https://github.com/halo-dev/halo/blob/v2.26.1/ui/console-src/modules/contents/posts/PostList.vue)、[DeletedPostList](https://github.com/halo-dev/halo/blob/v2.26.1/ui/console-src/modules/contents/posts/DeletedPostList.vue)；搜索与筛选组件的宿主注册见 [setupComponents](https://github.com/halo-dev/halo/blob/v2.26.1/ui/src/setup/setupComponents.ts)。这些组件直接由宿主提供，插件没有复制一份实现。

前台阅读参考 Halo 2.26.1 的 [DefaultQueryPostPredicateResolver](https://github.com/halo-dev/halo/blob/v2.26.1/application/src/main/java/run/halo/app/theme/router/DefaultQueryPostPredicateResolver.java)，以及官方「瞬间」插件的 [权限过滤](https://github.com/halo-sigs/plugin-moments/blob/0f631c3f6ab9526c656b4210cb00014ff41bf9c6/src/main/java/run/halo/moments/DefaultQueryMomentPredicateResolver.java)、[统一阅读接口](https://github.com/halo-sigs/plugin-moments/blob/0f631c3f6ab9526c656b4210cb00014ff41bf9c6/src/main/java/run/halo/moments/MomentQueryEndpoint.java) 和 [Console 入口](https://github.com/halo-sigs/plugin-moments/blob/0f631c3f6ab9526c656b4210cb00014ff41bf9c6/console/src/views/MomentsList.vue)。日记采用同一接口按身份返回可读内容，并保留独立的分享版本，避免自动保存把私人改稿直接展示给访客。

## 代码结构

| 位置 | 内容 |
| --- | --- |
| `src/main/java/com/timxs/warmdiary` | `DiaryEntry` / `DiaryNotebook` 扩展模型，`DiaryService` 读写与分享逻辑，`DiaryContent` 校验与 HTML 清理，`DiaryAccess` 身份判断，`DiaryEndpoint` / `PublicDiaryEndpoint` 接口，`DiaryPageController` 前台页面 |
| `ui/src/diary` | 前后台共用：`api.ts`（接口封装、日期与标题格式）、`wording.ts`（操作名称与确认文案）、`useDraft.ts` / `useDraftLeave.ts` / `useDiaryWriter.ts`（自动保存与离开确认）、`DiaryBodyEditor.vue`（正文编辑器） |
| `ui/src/views/DiaryConsoleView.vue`、`ui/src/components/DiaryEditorModal.vue` | 后台列表、回收站和编辑弹窗，类名前缀 `wd-`。提示、错误和确认都用 Halo 的 VAlert、Dialog 与灰字；分享预览不套框，标题加粗、日期灰字、正文与编辑器同字号同墨色 |
| `ui/src/notebook` | 前台手帐：`App.vue` 页面骨架，`NotebookIndex.vue` 目录，`NotebookPage.vue` 正文页，`NotebookWriter.vue` 写作页，`NotebookDialog.vue` 对话框，`NotebookDateField.vue` 日期选择，`useNotebook.ts` 状态，`notebook.css` 样式（类名前缀 `nb-`，颜色、字号、字体只从变量取） |
| `ui/src/api/generated` | 由 OpenAPI 生成，不要手改 |

## 构建与开发

需要 Java 21、Node 22.12+（官方 CI 使用 Node 24）和依赖下载网络。UI 使用 pnpm，与官方脚手架相同。

```powershell
# Windows
.\gradlew.bat clean build

# macOS / Linux
./gradlew clean build
```

产物在 `build/libs/`。构建同时运行 Java 测试、Vue 类型检查和前端单元测试。

有 Docker 时可使用官方 `./gradlew haloServer`。UI 开发：

```sh
cd ui
pnpm install
pnpm run dev
```

手帐前台另由 `pnpm run build:notebook` 构建，并随插件打包。

### 重新生成接口客户端

插件自定义 API 使用 Halo DevTools 的 `generateApiClient` 任务，从运行中 Halo 的 OpenAPI 分组生成 TypeScript 客户端，输出到 `ui/src/api/generated/`。日常 `build` 不会执行该任务。

页面不要直接 new 生成类，也不要手改生成代码。与官方「瞬间」插件相同，由 `ui/src/api/index.ts` 注入 Halo 的 `axiosInstance`，再导出 `diaryConsoleApiClient` / `diaryPublicApiClient`。日记的保存、分享、回收站等封装在 `ui/src/diary/api.ts`。

OpenAPI 分组已写在根目录 `build.gradle` 的 `haloPlugin.openApi` 中。只有接口契约改变时才重新生成：

1. 先构建并将新插件装入本地 Halo，或使用 `./gradlew haloServer`。
2. 若对接独立 Halo 实例，为其开启 OpenAPI，并配置与 Gradle 一致的分组。OpenAPI 3.0 可避免当前生成器在 Windows 下对本地路径的解析问题。

```yaml
springdoc:
  api-docs:
    enabled: true
    version: OPENAPI_3_0
  group-configs:
    - group: warmDiary
      display-name: Warm Diary
      paths-to-match:
        - /apis/console.api.warm-diary.timxs.com/v1alpha1/**
        - /apis/api.warm-diary.timxs.com/v1alpha1/**
```

3. 运行 `./gradlew generateApiClient -PhaloApiUrl=http://127.0.0.1:8098`，然后重新构建。

Halo 会把全局的 JsonPatch 模型并入每个分组，生成器还会附带 `.gitignore`、`git_push.sh` 等脚手架文件；这些与本插件无关，生成后删掉即可。生成目录不参与 ESLint 和 Prettier（`eslint.config.ts` 与 `.prettierignore`），与 Halo 核心忽略 `packages/api-client/src` 和「瞬间」插件忽略 `src/api/generated` 的做法相同。首次生成或契约升级导致旧客户端无法编译时，可以用 `generateApiClient -x build` 读取已安装的新插件接口后再运行完整构建。

## 验证

29 项 Java 测试覆盖首次初始化权限、禁止重复认领、主人权限、统一阅读接口的身份校验、分享版本隔离、心情天气随分享复制与旧快照兼容、心情天气选项校验、列表摘要不含正文、日历按身份统计、详情 HTTP 404、页面安全头、写接口的自定义头与来源校验（含反向代理后的站点对外地址）、版本冲突、幂等创建、HTML 清理与便笺设置回退。53 项前端测试覆盖首次使用按钮和无权访问提示、统一阅读接口与地址、页面内访客预览、账号变化与切换时清除私人数据、目录内换篇不重载、分享后页面不清空、连续输入、网络重试、冲突保留输入、退出保存、重复关闭、导航历史、筛选、自定义日期范围可修改、慢响应竞态、空页回退、日历计算，以及 Console 跨页选择、批量操作部分失败与重复提交。

本地 Halo 2.26.1 实例已通过真实接口检查，包括匿名和其他登录用户的访问隔离、分享版本含心情天气、按心情筛选、主人与访客的日历、搜索隔离、收回 / 回收站 / 恢复、页面不嵌入私密内容、原始资源权限和 OpenAPI 分组。该实例不连接生产站点。

已在 1440px 与 390px 下用浏览器截图核对前台目录、正文、无标题日记、访客日历、分享预览、确认框、写作页、日期选择的键盘操作，以及后台列表、编辑弹窗、自定义日期范围和「访客看到的版本」对照；页头、手帐、页脚共用同一对左右边线，天气章文字留在圆框内，可见文字的对比度全部达到 WCAG AA。

设计草稿与静态原型不纳入仓库。

## 许可证

[GPL-3.0](LICENSE) © Tim0x0
