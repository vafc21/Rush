import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const STYLES: Record<Variant, string> = {
  primary: "bg-accent text-bg hover:opacity-90 font-bold",
  secondary: "bg-panel text-secondary hover:bg-panel/80 font-semibold",
  ghost: "text-secondary hover:text-white",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant };

export function Button({ variant = "primary", className = "", ...rest }: Props) {
  return (
    <button
      className={`rounded-md px-4 py-2 text-sm transition-colors disabled:opacity-50 ${STYLES[variant]} ${className}`}
      {...rest}
    />
  );
}
