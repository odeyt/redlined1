// Fire-and-forget seeder — called after RO close or invoice paid
// Sends data to /api/labor-guide/seed in the background (no await needed)
export function seedLaborGuide(params: {
  vehicle: string;
  jobDescription: string;
  laborHours: number;
  laborRate: number;
}): void {
  if (!params.jobDescription || !params.laborHours) return;
  fetch('/api/labor-guide/seed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }).catch(() => {}); // silent fail — never block the UI
}
