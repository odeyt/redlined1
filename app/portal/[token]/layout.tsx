export default function PortalLayout({ children }: { children: React.ReactNode }) {
  // Intentionally minimal — no sidebar, no AppShell
  return <>{children}</>;
}
