interface PageHeaderProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  sticky?: boolean;
}

export function PageHeader({ title, subtitle, right, sticky = false }: PageHeaderProps) {
  return (
    <div
      className={`border-b border-border bg-background z-30 ${
        sticky ? "sticky top-[60px] backdrop-blur bg-background/95" : ""
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-7 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h1 className="font-serif text-4xl text-primary leading-tight">{title}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </div>
  );
}
