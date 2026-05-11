import type { Meta, StoryObj } from "@storybook/react";

import { UINav } from "./Nav";

const meta: Meta<typeof UINav> = {
  title: "UI/Navigation",
  component: UINav
};

export default meta;
type Story = StoryObj<typeof UINav>;

export const Default: Story = {
  args: {
    mode: "inline",
    selectedKeys: ["home"],
    items: [
      { key: "home", label: "对话" },
      { key: "assistant", label: "助手" },
      { key: "resources", label: "资源" }
    ]
  }
};

