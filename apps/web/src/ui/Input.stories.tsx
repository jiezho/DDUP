import type { Meta, StoryObj } from "@storybook/react";

import { UITextArea, UITextField } from "./Input";

export default {
  title: "UI/Input",
  component: UITextField
} satisfies Meta<typeof UITextField>;

type Story = StoryObj<typeof UITextField>;

export const TextField: Story = {
  args: {
    placeholder: "输入内容…"
  }
};

export const TextArea: StoryObj<typeof UITextArea> = {
  render: (args) => <UITextArea {...args} />,
  args: {
    placeholder: "输入多行内容…",
    autoSize: { minRows: 3, maxRows: 6 }
  }
};

