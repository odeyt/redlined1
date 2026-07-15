'use client';

import GridLayout, { WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { WidgetRenderer } from './WidgetRenderer';
import { WIDGET_REGISTRY } from '@/lib/dashboardWidgets/registry';
import type { WidgetLayoutItem } from '@/lib/dashboardWidgets/types';

const ResponsiveGridLayout = WidthProvider(GridLayout);

interface WidgetGridProps {
  layout: WidgetLayoutItem[];
  onNav: (module: string) => void;
  editable: boolean;
  onLayoutChange?: (layout: WidgetLayoutItem[]) => void;
  renderChrome?: (widgetId: string) => React.ReactNode;
}

export function WidgetGrid({ layout, onNav, editable, onLayoutChange, renderChrome }: WidgetGridProps) {
  const items = layout.filter(item => WIDGET_REGISTRY[item.i]);

  return (
    <ResponsiveGridLayout
      className="layout"
      layout={items}
      cols={12}
      rowHeight={60}
      margin={[16, 16]}
      isDraggable={editable}
      isResizable={editable}
      onLayoutChange={editable ? (l => onLayoutChange?.(l.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })))) : undefined}
    >
      {items.map(item => {
        const def = WIDGET_REGISTRY[item.i];
        return (
          <div key={item.i}>
            <WidgetRenderer definition={def} onNav={onNav} chrome={renderChrome?.(item.i)} />
          </div>
        );
      })}
    </ResponsiveGridLayout>
  );
}
