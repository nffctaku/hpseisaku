"use client";

import * as React from "react";
import { CircleIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type RadioGroupContextValue = {
  name: string;
  value?: string;
  disabled?: boolean;
  onValueChange?: (value: string) => void;
};

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null);

function RadioGroup({
  className,
  value,
  defaultValue,
  onValueChange,
  disabled,
  ...props
}: Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
}) {
  const [uncontrolled, setUncontrolled] = React.useState<string | undefined>(defaultValue);
  const name = React.useId();

  const currentValue = value !== undefined ? value : uncontrolled;

  const ctx = React.useMemo<RadioGroupContextValue>(() => {
    return {
      name,
      value: currentValue,
      disabled,
      onValueChange: (next) => {
        if (value === undefined) setUncontrolled(next);
        onValueChange?.(next);
      },
    };
  }, [name, currentValue, disabled, onValueChange, value]);

  return (
    <RadioGroupContext.Provider value={ctx}>
      <div role="radiogroup" className={cn("grid gap-3", className)} {...props} />
    </RadioGroupContext.Provider>
  );
}

function RadioGroupItem({
  className,
  value,
  id,
  disabled,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> & {
  value: string;
}) {
  const ctx = React.useContext(RadioGroupContext);

  const isDisabled = Boolean(disabled || ctx?.disabled);
  const checked = ctx?.value === value;

  return (
    <span className={cn("inline-flex items-center", className)}>
      <span className="relative inline-flex size-4 shrink-0">
        <input
          {...props}
          id={id}
          type="radio"
          name={ctx?.name}
          value={value}
          checked={checked}
          disabled={isDisabled}
          onChange={() => ctx?.onValueChange?.(value)}
          className={cn(
            "peer absolute inset-0 m-0 size-4 cursor-pointer appearance-none rounded-full border border-input bg-transparent shadow-xs outline-none",
            "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 peer-checked:opacity-100">
          <CircleIcon className="size-2 fill-primary text-primary" />
        </span>
      </span>
    </span>
  );
}

export { RadioGroup, RadioGroupItem };
