import type { Meta, StoryObj } from "@storybook/react";

import { UICard } from "./Card";
import { UIButton } from "./Button";

const meta: Meta<typeof UICard> = {
  title: "UI/Card",
  component: UICard
};

export default meta;
type Story = StoryObj<typeof UICard>;

export const Default: Story = {
  render: () => (
    <UICard title="卡片标题" extra={<UIButton tone="primary">操作</UIButton>}>
      内容区示例：用于承载列表、表单、统计信息与工具入口。
    </UICard>
  )
};

