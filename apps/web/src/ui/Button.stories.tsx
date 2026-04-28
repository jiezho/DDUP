import type { Meta, StoryObj } from "@storybook/react";

import { UIButton } from "./Button";

const meta: Meta<typeof UIButton> = {
  title: "UI/Button",
  component: UIButton,
  args: {
    children: "按钮"
  }
};

export default meta;
type Story = StoryObj<typeof UIButton>;

export const Primary: Story = { args: { tone: "primary" } };
export const Secondary: Story = { args: { tone: "secondary" } };
export const Danger: Story = { args: { tone: "danger" } };

