import { ReactNode } from 'react';

interface PanelProps {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string; // extra classes, e.g. "card-hero"
}

export function Panel({ title, hint, action, children, className }: PanelProps) {
  return (
    <section className={`panel${className ? ` ${className}` : ''}`}>
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {hint && <p className="hint">{hint}</p>}
        </div>
        {action && <div>{action}</div>}
      </div>
      {children}
    </section>
  );
}
