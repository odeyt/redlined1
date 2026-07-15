import type { ComponentType } from 'react';

export type WidgetCategory = 'financial' | 'operational' | 'customer' | 'intelligence' | 'placeholder';

export interface WidgetLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetProps {
  onNav: (module: string) => void;
}

export interface WidgetDefinition {
  id: string;
  title: string;
  category: WidgetCategory;
  component: ComponentType<WidgetProps>;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  /** null = visible to every role */
  allowedRoles: string[] | null;
  /** Feature flag key that must be enabled for this widget to appear in the catalog */
  requiredFlag?: string;
}
