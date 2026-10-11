import { useEffect, useRef } from "react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const PREFIXO = "CLÁUSULA PRIMEIRA – OBJETO\n\n1.1 O objeto do presente contrato é a prestação de serviços advocatícios relativos ";

type ObjectClauseFieldProps = {
  value: string;
  onChange: (value: string) => void;
};

export function ObjectClauseField({ value, onChange }: ObjectClauseFieldProps) {
  const objectRef = useRef<HTMLTextAreaElement>(null);

  function keepCursorAfterPrefix() {
    const textarea = objectRef.current;
    if (textarea && (textarea.selectionStart ?? 0) < PREFIXO.length) {
      textarea.setSelectionRange(PREFIXO.length, PREFIXO.length);
    }
  }

  function resizeObjectTextarea() {
    const textarea = objectRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }

  useEffect(() => {
    resizeObjectTextarea();
  }, [value]);

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label htmlFor="contract-object">Objeto do contrato</Label>
      <Textarea
        ref={objectRef}
        id="contract-object"
        rows={1}
        value={`${PREFIXO}${value}`}
        className="resize-none overflow-hidden"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        onFocus={(event) => {
          event.currentTarget.setSelectionRange(event.currentTarget.value.length, event.currentTarget.value.length);
          resizeObjectTextarea();
        }}
        onClick={keepCursorAfterPrefix}
        onSelect={keepCursorAfterPrefix}
        onKeyDown={(event) => {
          if (event.key === "Backspace" && event.currentTarget.selectionStart === PREFIXO.length && event.currentTarget.selectionEnd === PREFIXO.length) {
            event.preventDefault();
          }
          keepCursorAfterPrefix();
        }}
        onChange={(event) => {
          if (!event.target.value.startsWith(PREFIXO)) return;
          onChange(event.target.value.slice(PREFIXO.length));
          resizeObjectTextarea();
        }}
      />
      <p className="text-xs text-muted-foreground">Comece com "a", "à" ou "ao".</p>
    </div>
  );
}
