/**
 * "Created by API" on an estimate or invoice a bot made through API v1
 * (docs/api/PLAN.md phase 6), so staff can tell a bot's draft from their own
 * before they send it. Renders nothing for anything made in the app.
 *
 * The key's name is in Settings → API Keys (owners), not here: the browser
 * cannot read the api_keys table, by design.
 */
export function CreatedByApiBadge({ createdVia, style }: { createdVia?: string; style?: React.CSSProperties }) {
  if (createdVia !== 'api') return null;
  return (
    <span
      title="A bot or integration created this through the Redlined1 API. Check it before sending."
      style={{
        marginLeft: 6, fontSize: 10, fontWeight: 800, letterSpacing: '0.04em',
        color: '#1d4ed8', background: 'rgba(29,78,216,0.1)', padding: '1px 6px', borderRadius: 10,
        whiteSpace: 'nowrap', ...style,
      }}
    >
      CREATED BY API
    </span>
  );
}
