import { Table as AntTable } from "antd";
import type { TableProps } from "antd";

export function UITable<RecordType extends object>(props: TableProps<RecordType>) {
  const cls = ["ddup-ui-table", props.className].filter(Boolean).join(" ");
  return <AntTable {...props} className={cls} size={props.size || "middle"} />;
}

