export function badgeColor(text: string): string {
  const key = String(text).toLowerCase();
  if (key.includes('paid') || key.includes('approved') || key.includes('confirmed') || key.includes('connected') || key.includes('ready'))
    return 'green';
  if (key.includes('waiting') || key.includes('pending') || key.includes('draft') || key.includes('scheduled') || key.includes('approval'))
    return 'yellow';
  if (key.includes('unpaid') || key.includes('low') || key.includes('critical') || key.includes('fail') || key.includes('declined'))
    return 'red';
  if (key.includes('progress') || key.includes('diagnostic') || key.includes('mobile') || key.includes('dispatch') || key.includes('active'))
    return 'blue';
  return 'gray';
}

interface BadgeProps {
  text: string;
  color?: string;
}

export function Badge({ text, color }: BadgeProps) {
  const c = color || badgeColor(text);
  return <span className={`badge ${c}`}>{text}</span>;
}
