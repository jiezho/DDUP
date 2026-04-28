# 迁移指南：现有页面无痛升级到新风格（v1）

## 1. 迁移原则
- 先全局后局部：先落地 tokens（颜色/字体/圆角/阴影/焦点），再逐页替换组件使用方式。
- 先高频后长尾：优先对话、助手、资源、工作台等高频路径。
- 低风险增量：优先使用封装组件替换直接 antd 使用；保持 API 兼容，避免大改页面逻辑。

## 2. 分批计划（建议）
1) 基础层（完成）
   - 引入 `tokens.css` + `global.css` 统一风格
   - App 级主题 Token 映射（Ant Design）
   - 全局 focus ring 与可访问性基础
2) 原子组件替换（进行中）
   - Button/Input/Card 先替换对话输入区与关键 CTA
3) 页面级统一
   - 统一 Card/List/Empty/Loading 表现
   - 统一表单样式与错误提示
4) 组件示例与回归
   - Storybook 收敛组件使用方式
   - 走查清单逐项验证

## 3. 代码迁移示例

### 3.1 Button
- 旧：
  - `import { Button } from "antd";`
  - `<Button type="primary">发送</Button>`
- 新：
  - `import { UIButton } from "../ui";`
  - `<UIButton tone="primary">发送</UIButton>`

### 3.2 Input
- 旧：
  - `<Input placeholder="..." />`
- 新：
  - `<UITextField placeholder="..." />`

## 4. 验收方式
- 视觉：按 [checklist.md](./checklist.md) 逐条走查，关键页面提供截图对比（Desktop/Tablet/Mobile）。
- 交互：关键路径录屏（对话发送、抽屉编辑、资源检索预览）。
- 可访问性：键盘 Tab 走查 + 对比度抽查 + 焦点环覆盖面检查。

