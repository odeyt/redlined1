/**
 * Meta WhatsApp Cloud API client — the only module that talks to
 * graph.facebook.com.
 *
 * Behind a small interface (WhatsAppTransport) so the send service never
 * depends on Meta directly: tests and local development use the mock
 * transport, and a different provider could be dropped in without touching
 * the service.
 *
 * Calls this integration makes, and the ones it deliberately never makes:
 *   - messages (template sends), phone number reads, template list/create,
 *     subscribed_apps, the Embedded Signup code exchange.
 *   - NEVER /register or /deregister. A coexistence number is already
 *     registered by the WhatsApp Business App; calling /register would be
 *     wrong, and /deregister is refused by Meta for coexistence numbers and
 *     would take a Cloud-API-only number offline. Offboarding is done by the
 *     owner in the app (Settings → Account → Business Platform → Disconnect).
 *
 * Never logs or returns the access token. Meta error bodies are reduced to
 * code + title before they leave this module.
 */
import { GRAPH_BASE_URL, graphApiVersion, metaAppId, metaAppSecret } from './config';

export interface GraphError {
  status: number;
  code: string | null;
  title: string;
}

export type GraphResult<T> = { ok: true; data: T } | { ok: false; error: GraphError };

export interface PhoneNumberInfo {
  id: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  codeVerificationStatus: string | null;
  nameStatus: string | null;
  platformType: string | null;
  isOnBizApp: boolean | null;
  messagingLimitTier: string | null;
  throughputLevel: string | null;
}

export interface TemplateStatusRow {
  name: string;
  language: string;
  status: string;
  category: string | null;
  id: string | null;
  rejectedReason: string | null;
}

export interface WhatsAppTransport {
  readonly kind: 'cloud' | 'mock';
  sendTemplate(args: { token: string; phoneNumberId: string; to: string; template: unknown }): Promise<GraphResult<{ wamid: string }>>;
  getPhoneNumber(args: { token: string; phoneNumberId: string }): Promise<GraphResult<PhoneNumberInfo>>;
  listTemplates(args: { token: string; wabaId: string }): Promise<GraphResult<TemplateStatusRow[]>>;
  createTemplate(args: { token: string; wabaId: string; submission: unknown }): Promise<GraphResult<{ id: string; status: string }>>;
  subscribeApp(args: { token: string; wabaId: string }): Promise<GraphResult<{ success: boolean }>>;
  exchangeCode(args: { code: string }): Promise<GraphResult<{ accessToken: string }>>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/* eslint-disable @typescript-eslint/no-explicit-any */
function reduceError(status: number, body: any): GraphError {
  const e = body?.error ?? {};
  const code = e.code != null ? String(e.code) : null;
  const sub = e.error_subcode != null ? `/${e.error_subcode}` : '';
  // error_user_title / message can quote request parameters; keep it short and
  // never include anything from the request Authorization header (we never
  // put the token anywhere else).
  const title = String(e.error_user_title || e.message || `Meta API error ${status}`).slice(0, 200);
  return { status, code: code ? `${code}${sub}` : null, title };
}

export function createCloudTransport(fetchImpl: FetchLike = fetch): WhatsAppTransport {
  const url = (path: string) => `${GRAPH_BASE_URL}/${graphApiVersion()}/${path.replace(/^\/+/, '')}`;

  async function call<T>(path: string, init: RequestInit, token: string | null, map: (b: any) => T): Promise<GraphResult<T>> {
    let res: Response;
    try {
      res = await fetchImpl(url(path), {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
        cache: 'no-store',
      });
    } catch {
      return { ok: false, error: { status: 0, code: 'network', title: 'Could not reach Meta' } };
    }
    let body: any = null;
    try { body = await res.json(); } catch { body = null; }
    if (!res.ok) return { ok: false, error: reduceError(res.status, body) };
    try {
      return { ok: true, data: map(body) };
    } catch {
      return { ok: false, error: { status: res.status, code: 'unexpected_response', title: 'Unexpected response from Meta' } };
    }
  }

  return {
    kind: 'cloud',
    sendTemplate: ({ token, phoneNumberId, to, template }) =>
      call(`${encodeURIComponent(phoneNumberId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template', template }),
      }, token, b => {
        const wamid = b?.messages?.[0]?.id;
        if (!wamid) throw new Error('no message id');
        return { wamid: String(wamid) };
      }),

    getPhoneNumber: ({ token, phoneNumberId }) =>
      call(`${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status,platform_type,is_on_biz_app,messaging_limit_tier,throughput`, { method: 'GET' }, token, b => ({
        id: String(b.id),
        displayPhoneNumber: b.display_phone_number ?? null,
        verifiedName: b.verified_name ?? null,
        qualityRating: b.quality_rating ?? null,
        codeVerificationStatus: b.code_verification_status ?? null,
        nameStatus: b.name_status ?? null,
        platformType: b.platform_type ?? null,
        isOnBizApp: typeof b.is_on_biz_app === 'boolean' ? b.is_on_biz_app : null,
        messagingLimitTier: b.messaging_limit_tier ?? null,
        throughputLevel: b.throughput?.level ?? null,
      })),

    listTemplates: ({ token, wabaId }) =>
      call(`${encodeURIComponent(wabaId)}/message_templates?fields=name,language,status,category,id,rejected_reason&limit=200`, { method: 'GET' }, token, b =>
        (Array.isArray(b?.data) ? b.data : []).map((t: any) => ({
          name: String(t.name),
          language: String(t.language),
          status: String(t.status),
          category: t.category ?? null,
          id: t.id ? String(t.id) : null,
          rejectedReason: t.rejected_reason && t.rejected_reason !== 'NONE' ? String(t.rejected_reason) : null,
        }))),

    createTemplate: ({ token, wabaId, submission }) =>
      call(`${encodeURIComponent(wabaId)}/message_templates`, { method: 'POST', body: JSON.stringify(submission) }, token, b => ({
        id: String(b.id),
        status: String(b.status ?? 'PENDING'),
      })),

    subscribeApp: ({ token, wabaId }) =>
      call(`${encodeURIComponent(wabaId)}/subscribed_apps`, { method: 'POST' }, token, b => ({ success: !!b?.success })),

    exchangeCode: ({ code }) => {
      const qs = new URLSearchParams({ client_id: metaAppId(), client_secret: metaAppSecret(), code });
      return call(`oauth/access_token?${qs.toString()}`, { method: 'GET' }, null, b => {
        if (!b?.access_token) throw new Error('no token');
        return { accessToken: String(b.access_token) };
      });
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * In-process fake. Deterministic message ids; records sends for tests. Used
 * when WHATSAPP_TRANSPORT=mock outside production (lib/whatsapp/config.ts).
 */
export function createMockTransport(opts: { isOnBizApp?: boolean | ((phoneNumberId: string) => boolean); failSendsTo?: string[] } = {}): WhatsAppTransport & { sent: Array<{ to: string; template: unknown }> } {
  const sent: Array<{ to: string; template: unknown }> = [];
  let n = 0;
  return {
    kind: 'mock',
    sent,
    async sendTemplate({ to, template }) {
      if (opts.failSendsTo?.includes(to)) return { ok: false, error: { status: 400, code: '131026', title: 'Message undeliverable' } };
      sent.push({ to, template });
      n += 1;
      return { ok: true, data: { wamid: `wamid.MOCK${String(n).padStart(6, '0')}` } };
    },
    async getPhoneNumber({ phoneNumberId }) {
      return {
        ok: true,
        data: {
          id: phoneNumberId,
          displayPhoneNumber: '+1 555-0100',
          verifiedName: 'Test Number',
          qualityRating: 'GREEN',
          codeVerificationStatus: 'VERIFIED',
          nameStatus: 'APPROVED',
          platformType: 'CLOUD_API',
          isOnBizApp: typeof opts.isOnBizApp === 'function' ? opts.isOnBizApp(phoneNumberId) : (opts.isOnBizApp ?? false),
          messagingLimitTier: 'TIER_250',
          throughputLevel: 'STANDARD',
        },
      };
    },
    async listTemplates() { return { ok: true, data: [] }; },
    async createTemplate() { return { ok: true, data: { id: `mock-${Date.now()}`, status: 'PENDING' } }; },
    async subscribeApp() { return { ok: true, data: { success: true } }; },
    async exchangeCode() { return { ok: true, data: { accessToken: 'mock-token' } }; },
  };
}
