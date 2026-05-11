import { Input as AntInput } from "antd";
import type { InputProps, TextAreaProps } from "antd/es/input";

export type UITextFieldProps = InputProps;

export function UITextField({ className, ...rest }: UITextFieldProps) {
  const cls = ["ddup-ui-input", className].filter(Boolean).join(" ");
  return <AntInput {...rest} className={cls} />;
}

export type UITextAreaProps = TextAreaProps;

export function UITextArea({ className, ...rest }: UITextAreaProps) {
  const cls = ["ddup-ui-textarea", className].filter(Boolean).join(" ");
  return <AntInput.TextArea {...rest} className={cls} />;
}

