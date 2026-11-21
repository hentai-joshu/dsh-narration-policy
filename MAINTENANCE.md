# 维护手册（MAINTENANCE）

> 位置：`~/.dsh/local-plugins/dsh-narration-policy`（独立于工作区，profile 通过软链引用，清理工作区不会断）。

## 它是什么

给 DeepSeek Harness 全局加一段 system-prompt section，要求 agent 边干边说。**只有这一层，不注入任何消息。**

- section 名 `narration-policy`，order `9000`。
- 文案见 `index.js` 的 `NARRATION_TEXT`，四小节：过程说明 / 该说和不该说 / 回答本身 / 压缩后重新对一遍。
- 「压缩后重新对一遍」是一条**条件规则**：DSH 压缩时会写一条以 `This is an automatically generated checkpoint…` 开头的摘要消息，模型看到它就自行重新执行上述要求。不需要插件做任何注入。

## 为什么不注入消息

`agent/pre-step` 只能追加 `UserMessage`（会以用户气泡显示）；`agent/request` 已废弃且只能改模型参数。两条都不是合适的载体。纯提示 + 条件规则零噪音，也就没有「用户没说过却冒出一条消息」的问题。

历史：v1.1 每步纠偏、v1.2 压缩后插一条 user 提醒，均已废弃。

v1.3.1 起 section 以 `interpolate: false` 注册：文案按字面量渲染，里面的 `{{…}}` 不会被解析成提示变量（本插件文案本来也没有占位符，这是防线）。order 维持 `9000`——实测前移到 900 每步能多省约 1.5KB 的缓存未命中，一个长任务折合几分钱，不值得改公共行为。

## 目录结构

- `index.js` —— 逻辑 + `NARRATION_TEXT`
- `package.json` —— `name: @local/dsh-narration-policy`, `version: 1.3.1`
- `cordis.patch.yml` —— 把插件挂到 profile loader
- `README.md` / `MAINTENANCE.md` / `LICENSE`

## 改文案

1. 改 `index.js` 的 `NARRATION_TEXT`（逻辑别动）。
2. 重装：`plugin_manager action=install_bundle target=~/.dsh/local-plugins/dsh-narration-policy`
3. 验证：读会话日志 `~/.dsh/sessions/<cwd>/session-*/session.v4.jsonl.zstd` 最新的 `system/message` 事件，含新文案即生效。
4. `git commit`，必要时 `git tag v1.3.x && git push`。

## 安装 / 卸载

- 安装：见 `README.md`。
- 卸载：`plugin_manager action=remove_bundle target=@local/dsh-narration-policy`，再去掉 profile `package.json` 的 `dsh.profile.bundles` 条目。

## 验证清单

1. `~/.dsh/profiles/desktop/package.json` 依赖行 = `"@local/dsh-narration-policy": "link:/Users/maliyang/.dsh/local-plugins/dsh-narration-policy"`，且 `dsh.profile.bundles` 有该条目。
2. `plugin_manager install_bundle` 返回 `version: 1.3.1`、`application: "applied"`。
3. 会话日志 `system/message` 含 `### 压缩后重新对一遍`。
4. 确认没有 `source.kind = 'narration-policy'` 的 user 消息（本版应完全不再产生）。
5. `index.js` 里 section 带 `interpolate: false`；`node -e` 用真实 `renderPrompt` 组装时该段逐字节出现在提示里（见 `~/.dsh/local-plugins/...`/实验脚本）。

## 回滚

- 回 v1.2（压缩后插一条 user 提醒）：`git checkout v1.2.1 -- index.js package.json` 后重装。
- 整体移除：去掉 bundle。

## 排错 / 坑

- **bundles 被清空**：插件管理器重写 profile `package.json` 时偶有清掉 `bundles` 条目的先例；装/卸别的插件后 `grep @local/dsh-narration-policy ~/.dsh/profiles/desktop/package.json` 确认还在。
- **别再挪回工作区**：工作区可能被清理/迁移，软链会断；`~/.dsh` 用户数据区才稳。
- **升级 DSH 后**：只用了 `ctx.systemPrompt.section()` 一个稳定接口；若压缩检查点的开头文字改了（`This is an automatically generated checkpoint`），同步更新 `NARRATION_TEXT` 里引用的标记。

## 版本管理

独立 git 仓库，改动请 `git add -A && git commit`。远端：`github.com/hentai-joshu/dsh-narration-policy`。
