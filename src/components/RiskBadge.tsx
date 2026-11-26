import type { RiskRating } from '../types/audit';

export function RiskIndicator({
  rating,
}: {
  rating: RiskRating | 'Informational';
}) {
  const styles: Record<string, string> = {
    Critical: 'text-red-700 bg-red-50 border-red-200',
    High: 'text-amber-800 bg-amber-50 border-amber-200',
    Moderate: 'text-sky-800 bg-sky-50 border-sky-200',
    Low: 'text-emerald-800 bg-emerald-50 border-emerald-200',
    Informational: 'text-slate-700 bg-slate-100 border-slate-200',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded whitespace-nowrap shrink-0 ${
        styles[rating] || styles.Informational
      }`}
    >
      {rating} Risk
    </span>
  );
}
