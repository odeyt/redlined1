/**
 * @jest-environment jsdom
 */

/**
 * What a thumbnail does when its URL stops working.
 *
 * The failure mode being fixed here is silent: a signed URL expires, the
 * <img> fails, and the photo looks deleted. So the behaviour under test is
 * exactly the recovery — one retry with a FRESH signature, then an honest
 * placeholder — and, just as important, the absence of a loop: an <img> whose
 * onError re-signs unconditionally will sign, fail, sign, fail for as long as
 * the tab is open.
 *
 * Rendered rather than grepped. A test that reads source text cannot tell the
 * difference between a retry that happens once and a retry that happens
 * forever.
 */
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { StorageImage } from '../StorageImage';
import { clearSignedUrlCache, signingStats } from '@/lib/storage/signClient';
import { clearRetryGuard } from '@/lib/storage/useSignedStorageUrl';

const createSignedUrls = jest.fn();
const from = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...a: unknown[]) => from(...a),
    storage: { from: () => ({ createSignedUrls: (...a: unknown[]) => createSignedUrls(...a) }) },
  },
}));

const VEHICLE = '11111111-2222-3333-4444-555555555555';
const PATH = `vehicles/${VEHICLE}/a.jpg`;
const OTHER = `vehicles/${VEHICLE}/b.jpg`;

let serial = 0;

function respondWith(signed: boolean) {
  createSignedUrls.mockImplementation((paths: string[]) => {
    const n = ++serial;
    return Promise.resolve({
      data: paths.map(p => (signed
        ? { path: p, signedUrl: `https://signed/${p}?token=v${n}`, error: null }
        : { path: p, signedUrl: null, error: 'denied' })),
      error: null,
    });
  });
}

async function settle() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  clearSignedUrlCache();
  clearRetryGuard();
  createSignedUrls.mockReset();
  from.mockReset();
  serial = 0;
  respondWith(true);
});

afterEach(() => {
  cleanup();
  clearSignedUrlCache();
});

describe('a thumbnail whose URL has expired', () => {
  it('asks for a fresh signature once and shows the replacement', async () => {
    render(<StorageImage url={PATH} alt="front" />);
    await settle();

    const img = screen.getByAltText('front') as HTMLImageElement;
    expect(img.getAttribute('src')).toContain('token=v1');
    expect(signingStats.requests).toBe(1);

    // The browser reports the expired link.
    await act(async () => { fireEvent.error(img); });
    await settle();

    const after = screen.getByAltText('front') as HTMLImageElement;
    expect(after.getAttribute('src')).toContain('token=v2');
    expect(signingStats.requests).toBe(2);
  });

  it('gives up after the SECOND failure instead of looping', async () => {
    render(<StorageImage url={PATH} alt="front" />);
    await settle();

    await act(async () => { fireEvent.error(screen.getByAltText('front')); });
    await settle();
    expect(signingStats.requests).toBe(2);

    // The fresh signature failed too. The URL was not the problem.
    await act(async () => { fireEvent.error(screen.getByAltText('front')); });
    await settle();

    expect(screen.queryByAltText('front')).toBeNull();
    expect(screen.getByLabelText('Photo unavailable')).toBeTruthy();

    // And nothing keeps trying in the background.
    await settle();
    expect(signingStats.requests).toBe(2);
  });

  it('re-arms the single retry once the image actually loads', async () => {
    render(<StorageImage url={PATH} alt="front" />);
    await settle();

    await act(async () => { fireEvent.error(screen.getByAltText('front')); });
    await settle();
    await act(async () => { fireEvent.load(screen.getByAltText('front')); });

    // A later expiry is a new problem and gets its own retry, rather than
    // inheriting the exhausted guard from hours earlier.
    await act(async () => { fireEvent.error(screen.getByAltText('front')); });
    await settle();
    expect(screen.getByAltText('front')).toBeTruthy();
    expect(signingStats.requests).toBe(3);
  });
});

describe('when signing genuinely fails', () => {
  it('shows the placeholder and an accessible reason', async () => {
    respondWith(false);
    render(<StorageImage url={PATH} alt="front" />);
    await settle();

    const fallback = screen.getByRole('img', { name: 'Photo unavailable' });
    expect(fallback).toBeTruthy();
    expect(screen.queryByAltText('front')).toBeNull();
  });

  it('never writes anything back to the database', async () => {
    // The canonical reference is the one thing that must survive a bad hour.
    // This component has no path to a write at all, and that is the assertion.
    respondWith(false);
    render(<StorageImage url={PATH} alt="front" />);
    await settle();
    await act(async () => { await Promise.resolve(); });
    expect(from).not.toHaveBeenCalled();
  });

  it('keeps rendering the same reference it was given', async () => {
    // Re-rendering with the identical prop after a failure must not have
    // "cleaned up" anything: the row still points at the object.
    respondWith(false);
    const { rerender } = render(<StorageImage url={PATH} alt="front" />);
    await settle();
    respondWith(true);
    rerender(<StorageImage url={PATH} alt="front" key="same" />);
    await settle();
    expect(from).not.toHaveBeenCalled();
  });
});

describe('a vehicle with no photo', () => {
  it('renders nothing at all, leaving the page its own placeholder', async () => {
    const { container } = render(<StorageImage url={null} alt="front" />);
    await settle();
    expect(container.firstChild).toBeNull();
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it('treats an empty string the same way', async () => {
    const { container } = render(<StorageImage url="" alt="front" />);
    await settle();
    expect(container.firstChild).toBeNull();
  });
});

describe('a photo that was replaced while a signature was in flight', () => {
  it('drops the stale answer instead of painting the old photo back', async () => {
    // Deferred so the first signature can be made to arrive LATE, after the
    // upload has already swapped the component onto the new object.
    const deferred: Array<{ paths: string[]; resolve: (v: unknown) => void }> = [];
    createSignedUrls.mockImplementation((paths: string[]) => new Promise(resolve => {
      deferred.push({ paths, resolve });
    }));

    const { rerender } = render(<StorageImage url={PATH} alt="front" />);
    await settle();
    expect(deferred).toHaveLength(1);

    // The replacement lands and the component is pointed at the new object.
    rerender(<StorageImage url={OTHER} alt="front" />);
    await settle();
    expect(deferred).toHaveLength(2);

    // Now the OLD request finally answers.
    await act(async () => {
      deferred[0].resolve({
        data: deferred[0].paths.map(p => ({ path: p, signedUrl: `https://signed/${p}?token=stale`, error: null })),
        error: null,
      });
      deferred[1].resolve({
        data: deferred[1].paths.map(p => ({ path: p, signedUrl: `https://signed/${p}?token=fresh`, error: null })),
        error: null,
      });
      await Promise.resolve();
    });
    await settle();

    const img = screen.getByAltText('front') as HTMLImageElement;
    expect(img.getAttribute('src')).toContain('token=fresh');
    expect(img.getAttribute('src')).toContain(OTHER);
    expect(img.getAttribute('src')).not.toContain('stale');
  });
});
