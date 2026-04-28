import { Menu as AntMenu } from "antd";
import type { MenuProps } from "antd";

export type UINavProps = MenuProps;

export function UINav({ className, ...rest }: UINavProps) {
  const cls = ["ddup-ui-nav", className].filter(Boolean).join(" ");
  return <AntMenu {...rest} className={cls} />;
}

