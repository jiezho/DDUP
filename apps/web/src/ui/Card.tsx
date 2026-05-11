import { Card as AntCard } from "antd";
import type { CardProps } from "antd";

export type UICardProps = CardProps;

export function UICard({ className, ...rest }: UICardProps) {
  const cls = ["ddup-ui-card", className].filter(Boolean).join(" ");
  return <AntCard {...rest} className={cls} />;
}

