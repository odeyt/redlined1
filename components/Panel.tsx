import { ReactNode } from 'react';

interface PanelProps {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function Panel({ title, hint, action, children }: PanelProps) {
  return (
    <section className="panel">
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
