import * as React from "react";

import { cn } from "@/lib/utils";

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

function PageHeader({ title, subtitle, action, className, ...props }: PageHeaderProps) {
  return (
    <div
            className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4", className)}
      {...props}
    >
      <div className="min-w-0">
                <h1 className="text-[26px] font-bold leading-tight text-[#0F2340] sm:text-[32px]">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
            {action ? <div className="flex flex-wrap gap-2 sm:shrink-0">{action}</div> : null}
    </div>
  );
}

export { PageHeader };
