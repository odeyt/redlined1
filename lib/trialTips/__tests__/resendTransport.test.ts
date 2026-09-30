/**
 * How Resend's answers are classified. The installed SDK (resend 6.12.4)
 * never throws: an HTTP error comes back as `error` with its statusCode, and a
 * network failure as application_error with statusCode null.
 */
const send = jest.fn();
jest.mock('resend', () => ({ Resend: jest.fn().mockImplementation(() => ({ emails: { send } })) }));

import { classifyResendError, resendTransport } from '../resendTransport';

const message = {
  from: 'RedlineD1 <tips@redlined1.com>', to: 'a@test.local', replyTo: 'admin@redlined1.com',
  subject: 's', html: '<p>h</p>', text: 't', headers: { 'List-Unsubscribe': '<https://x>' },
  tags: [{ name: 'campaign', value: 'trial_tips' }],
};

describe('classifyResendError', () => {
  it.each([
    [{ name: 'application_error', statusCode: null }, 'uncertain'],             // network: may have arrived
    [{ name: 'application_error', statusCode: 500 }, 'uncertain'],
    [{ name: 'application_error', statusCode: 503 }, 'uncertain'],
    [{ name: 'concurrent_idempotent_requests', statusCode: 409 }, 'uncertain'], // still in progress
    [{ name: 'invalid_idempotent_request', statusCode: 409 }, 'uncertain'],     // key already used
    [{ name: 'request_timeout', statusCode: 408 }, 'uncertain'],
    [{ name: 'validation_error', statusCode: 422 }, 'rejected'],
    [{ name: 'rate_limit_exceeded', statusCode: 429 }, 'rejected'],
    [{ name: 'invalid_api_key', statusCode: 403 }, 'rejected'],
    [{ name: 'invalid_idempotency_key', statusCode: 400 }, 'rejected'],
  ])('%j → %s', (error, expected) => {
    expect(classifyResendError(error)).toBe(expected);
  });
});

describe('resendTransport', () => {
  beforeEach(() => send.mockReset());

  it('passes the idempotency key and every field', async () => {
    send.mockResolvedValue({ data: { id: 'em_1' }, error: null });
    const r = await resendTransport('re_test').send(message, 'trial-tips/u/first_job');
    expect(r).toEqual({ ok: true, id: 'em_1' });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: ['a@test.local'], replyTo: 'admin@redlined1.com', headers: message.headers, tags: message.tags,
    }), { idempotencyKey: 'trial-tips/u/first_job' });
  });

  it('a network failure is uncertain', async () => {
    send.mockResolvedValue({ data: null, error: { name: 'application_error', statusCode: null, message: 'Unable to fetch data.' } });
    expect(await resendTransport('re_test').send(message, 'k')).toMatchObject({ ok: false, certainty: 'uncertain' });
  });

  it('a validation error is a definite rejection', async () => {
    send.mockResolvedValue({ data: null, error: { name: 'validation_error', statusCode: 422, message: 'bad' } });
    expect(await resendTransport('re_test').send(message, 'k')).toMatchObject({ ok: false, certainty: 'rejected' });
  });

  it('success without an id is uncertain, not success', async () => {
    send.mockResolvedValue({ data: {}, error: null });
    expect(await resendTransport('re_test').send(message, 'k')).toMatchObject({ ok: false, certainty: 'uncertain' });
  });
});
