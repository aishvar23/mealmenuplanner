import { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  type PressableProps,
} from "react-native";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const CONTAINER: Record<Variant, string> = {
  primary: "bg-green-600 active:bg-green-700",
  secondary: "bg-gray-100 active:bg-gray-200",
  ghost: "bg-transparent active:bg-gray-100",
  danger: "bg-red-50 active:bg-red-100",
};

const LABEL: Record<Variant, string> = {
  primary: "text-white",
  secondary: "text-gray-900",
  ghost: "text-green-700",
  danger: "text-red-700",
};

interface ButtonProps extends Omit<PressableProps, "children"> {
  label: string;
  variant?: Variant;
  loading?: boolean;
  /** Optional leading icon (e.g. a lucide icon element). */
  icon?: ReactNode;
}

/**
 * The app's primary tappable. NativeWind-styled so the green accent and pressed
 * states match the web app; disables + shows a spinner while `loading`.
 */
export function Button({
  label,
  variant = "primary",
  loading = false,
  icon,
  disabled,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      className={`h-12 flex-row items-center justify-center gap-2 rounded-xl px-5 ${CONTAINER[variant]} ${isDisabled ? "opacity-50" : ""}`}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "primary" ? "#ffffff" : "#16a34a"}
        />
      ) : (
        <>
          {icon}
          <Text className={`text-base font-semibold ${LABEL[variant]}`}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
