interface StatCardProps {
  label: string;
  value: string | number;
  subtext: string;
}

export function StatCard({ label, value, subtext }: StatCardProps) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <strong>{value}</strong>
      <span>{subtext}</span>
    </div>
  );
}
