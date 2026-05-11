import type { Meta, StoryObj } from "@storybook/react";

import { UITable } from "./Table";

type Row = { key: string; name: string; status: string };

const meta: Meta<typeof UITable<Row>> = {
  title: "UI/Table",
  component: UITable
};

export default meta;
type Story = StoryObj<typeof UITable<Row>>;

export const Default: Story = {
  args: {
    columns: [
      { title: "名称", dataIndex: "name" },
      { title: "状态", dataIndex: "status" }
    ],
    dataSource: [
      { key: "1", name: "任务 A", status: "进行中" },
      { key: "2", name: "任务 B", status: "已完成" }
    ],
    pagination: false
  }
};

