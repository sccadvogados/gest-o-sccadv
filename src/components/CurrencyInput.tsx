import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";

type CurrencyInputProps = {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function CurrencyInput({
  id,
  value,
  onChange,
  disabled,
}: CurrencyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const formattedValue = currencyFormatter.format(value || 0);

  useEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement === input) {
      const cursorPosition = input.value.length;
      input.setSelectionRange(cursorPosition, cursorPosition);
    }
  }, [formattedValue]);

  return (
    <Input
      ref={inputRef}
      id={id}
      value={formattedValue}
      inputMode="numeric"
      disabled={disabled}
      onFocus={(event) => {
        const cursorPosition = event.currentTarget.value.length;
        event.currentTarget.setSelectionRange(cursorPosition, cursorPosition);
      }}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, "");
        onChange(digits ? Number(digits) / 100 : 0);
      }}
    />
  );
}
