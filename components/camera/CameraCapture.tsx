'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { compressImage, isAcceptedImage } from '@/lib/image/compress';

/**
 * Take a photo, look at it, keep it or try again.
 *
 * Built for a technician holding a phone next to a car, which sets the shape:
 * the camera opens full-screen, the shutter is a thumb-sized target at the
 * bottom, and nothing is uploaded until they have seen the photo. A blurred
 * shot of a brake disc discovered later is a job that has to be re-inspected.
 *
 * Every route to failure has somewhere to go. Permission refused, no camera,
 * a browser without getUserMedia, an insecure origin — each falls back to the
 * photo picker rather than a dead viewfinder, because a photo from the camera
 * roll is worth the same as one taken here.
 *
 * The component's job ends at producing a compressed File. Uploading it is the
 * caller's, which keeps this reusable across inspections, vehicles and parts
 * without knowing anything about storage.
 */

type Phase = 'idle' | 'requesting' | 'streaming' | 'preview' | 'denied' | 'unsupported' | 'error';

interface Props {
  onCapture: (file: File) => void;
  onCancel: () => void;
  /** Shown in the header so the operator knows what they are photographing. */
  title?: string;
  maxDimension?: number;
}

export function CameraCapture({ onCapture, onCancel, title = 'Take a photo', maxDimension }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<{ url: string; file: File } | null>(null);
  const [busy, setBusy] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  // A live camera left running drains the battery and holds the torch on some
  // phones, so it is released the moment this leaves the screen.
  useEffect(() => stop, [stop]);

  // Revoking on unmount rather than on replace: the URL is still rendered
  // until the next paint.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const start = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      // Also the state on plain http: getUserMedia is unavailable outside a
      // secure context, which is easy to mistake for a broken camera.
      setPhase('unsupported');
      setMessage('This browser cannot open the camera. Choose an existing photo instead.');
      return;
    }
    setPhase('requesting');
    setMessage('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      setPhase('streaming');
      // The video element only exists once the streaming phase renders.
      setTimeout(() => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => {});
      }, 40);
    } catch (e) {
      const name = (e as { name?: string })?.name ?? '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setPhase('denied');
        setMessage('Camera access was refused. You can allow it in your browser settings, or choose an existing photo.');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setPhase('unsupported');
        setMessage('No camera was found on this device. Choose an existing photo instead.');
      } else {
        setPhase('error');
        setMessage('The camera could not be opened. Choose an existing photo instead.');
      }
    }
  }, []);

  useEffect(() => { void start(); }, [start]);

  async function accept(file: File) {
    setBusy(true);
    try {
      const compressed = await compressImage(file, maxDimension ? { maxDimension } : {});
      setPreview({ url: URL.createObjectURL(compressed), file: compressed });
      setPhase('preview');
      stop();
    } catch (e) {
      setPhase('error');
      setMessage(e instanceof Error ? e.message : 'That photo could not be prepared.');
    } finally {
      setBusy(false);
    }
  }

  async function shoot() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // A video frame is already upright — the EXIF rotation problem applies to
    // files from the picker, not to what is on screen here.
    ctx.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.92));
    if (!blob) { setPhase('error'); setMessage('The photo could not be captured.'); return; }
    await accept(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }));
  }

  async function onPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // so the same photo can be picked again after a retake
    if (!file) return;
    if (!isAcceptedImage(file)) {
      setPhase('error');
      setMessage('That file is not an image. Photos only.');
      return;
    }
    await accept(file);
  }

  function retake() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    void start();
  }

  const shell: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 3500, background: '#000',
    display: 'flex', flexDirection: 'column',
    paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
    paddingTop: 'max(12px, env(safe-area-inset-top))',
  };
  const bar: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 16px', color: '#fff', fontSize: 14, fontWeight: 700,
  };
  const ghost: React.CSSProperties = {
    minHeight: 48, padding: '12px 20px', borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.1)',
    color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
  };

  return (
    <div style={shell} role="dialog" aria-label={title}>
      <div style={bar}>
        <span>{title}</span>
        <button onClick={() => { stop(); onCancel(); }} style={{ ...ghost, minHeight: 40, padding: '8px 14px' }}>
          Cancel
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 12px', minHeight: 0 }}>
        {phase === 'streaming' && (
          <video ref={videoRef} playsInline muted
            style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 12 }} />
        )}

        {phase === 'preview' && preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.url} alt="Captured photo"
            style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 12 }} />
        )}

        {phase === 'requesting' && (
          <p style={{ color: '#fff', opacity: 0.8, fontSize: 15, textAlign: 'center' }}>
            Waiting for camera permission…
          </p>
        )}

        {(phase === 'denied' || phase === 'unsupported' || phase === 'error') && (
          <div style={{ color: '#fff', textAlign: 'center', maxWidth: 380 }}>
            <p style={{ fontSize: 15, lineHeight: 1.5, marginBottom: 18 }}>{message}</p>
            <button onClick={() => fileRef.current?.click()}
              style={{ ...ghost, background: 'linear-gradient(135deg, #e03030, #b02020)', border: 'none', minHeight: 54, width: '100%' }}>
              🖼 Choose a photo
            </button>
            {phase !== 'unsupported' && (
              <button onClick={() => void start()} style={{ ...ghost, marginTop: 10, width: '100%' }}>
                Try the camera again
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
        {phase === 'streaming' && (
          <>
            <button onClick={() => fileRef.current?.click()} style={ghost} aria-label="Choose an existing photo">🖼</button>
            <button onClick={() => void shoot()} disabled={busy} aria-label="Take photo"
              style={{
                width: 76, height: 76, borderRadius: '50%', cursor: 'pointer',
                border: '5px solid rgba(255,255,255,0.9)', background: busy ? '#888' : '#e03030',
              }} />
            <span style={{ width: 48 }} />
          </>
        )}

        {phase === 'preview' && (
          <>
            <button onClick={retake} disabled={busy} style={{ ...ghost, flex: 1, maxWidth: 200 }}>Retake</button>
            <button
              onClick={() => { if (preview) { onCapture(preview.file); } }}
              disabled={busy}
              style={{
                flex: 1, maxWidth: 240, minHeight: 54, borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #16a34a, #15803d)',
                color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer',
              }}>
              Use this photo
            </button>
          </>
        )}
      </div>

      {/* capture="environment" asks Android for the rear camera directly; iOS
          offers camera or library, which is the sensible choice on that
          platform anyway. */}
      <input ref={fileRef} type="file" accept="image/*" capture="environment"
        onChange={onPicked} style={{ display: 'none' }} />
    </div>
  );
}
