import { Button as AntButton } from "antd";
import type { ButtonProps } from "antd";
import type { ReactNode } from "react";

export type UIButtonTone = "primary" | "secondary" | "danger";

export type UIButtonProps = Omit<ButtonProps, "type" | "danger"> & {
  tone?: UIButtonTone;
  children?: ReactNode;
};

export function UIButton({ tone = "secondary", className, children, ...rest }: UIButtonProps) {
  const type = tone === "primary" ? "primary" : "default";
  const danger = tone === "danger";
  const cls = ["ddup-ui-btn", className].filter(Boolean).join(" ");
  return (
    <AntButton {...rest} type={type} danger={danger} className={cls}>
      {children}
    </AntButton>
  );
}

