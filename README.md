# dsh-narration-policy

给 DeepSeek Harness 全局追加一段「过程汇报（Preamble）」系统提示词：让 agent 像 Codex 那样，边干边用一两句话同步「在做什么、刚做完什么、遇到什么问题、打算怎么解决」，而不是只在开头计划、结尾总结。

## 它做什么 / 不做什么

- 只**追加**一段 system-prompt section（`narration-policy`，order `9000`）。
- 不覆盖、不替换任何现有 persona / 工具说明 / 环境段。
- 不做文件、网络、定时器、进程操作；唯一副作用是注册一段文本。
- 零运行时依赖；只用稳定的 `ctx.systemPrompt.section()` API。
- 注册挂在 `ctx.effect()` 上，插件卸载/升级时自动注销。

## 生效范围

profile 级：装进 `desktop`（或当前 profile）后，**所有新会话**都会带上这段（含子代理）。

## 成本

每次请求多约 150–200 tokens（取决于措辞）。想改文案直接改 `index.js` 里的 `NARRATION_TEXT`，重装或重启后生效。

## 安装

用 DSH 的插件管理器安装本目录（绝对路径）：

```
plugin_manager action=install_bundle target=~/.dsh/local-plugins/dsh-narration-policy
```

或在 Desktop 的 **Plugins → Add plugin** 选择本目录。装完**新建会话**验证（已有会话保持它启动时的插件版本）。

## 更新

本插件从 GitHub 安装（非 npm registry），目前**没有“发现新版本”的自动提示**；更新需手动：

1. 拉取最新代码：`git -C ~/.dsh/local-plugins/dsh-narration-policy pull`（或重新 clone 覆盖）；
2. 在 **Plugins** 里重装/重新添加该 bundle，或 `plugin_manager action=install_bundle target=~/.dsh/local-plugins/dsh-narration-policy`；
3. **完全退出并重启 DSH**（system-prompt 在启动时装配，刷新页面不够）；
4. 新建会话验证。

版本见仓库 tag 与 `package.json` 的 `version`。若将来发布到 npm 公共包，才会支持 registry 的“版本更新”式提示（当前未发布）。

## 卸载

在 **Plugins** 里把这个 bundle 移除，或在 `~/.dsh/profiles/<profile>/package.json` 的 `dsh.profile.bundles` 去掉条目后重启。

## 安全/稳定/可维护说明

- 唯一 section 名 `narration-policy`，不会与 `deployment:persona-*` 或工具段冲突。
- `inject: ['systemPrompt']`：没有该服务的 profile 里自动不激活，不抛错。
- 注册失败只 `console.warn`，不阻断会话启动。
- 文案集中在一个常量，改文案不碰逻辑；后续如需可改成 `Config` 字段。

## 维护 / 回滚 / 排错

见同目录 `MAINTENANCE.md`。

## 许可证

MIT，见同目录 `LICENSE`。
