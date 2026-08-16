'use client';

import { useEffect, useRef, useState } from 'react';
import { StorageImage } from '@/components/StorageImage';

export interface GalleryImage {
  id: string;
  url: string;
  label: string;
}

interface Props {
  title: string;
  subtitle?: string;
  fetchImages: () => Promise<GalleryImage[]>;
  uploadImage: (file: File, label?: string) => Promise<GalleryImage>;
  deleteImage: (id: string, url: string) => Promise<void>;
  saveOrder?: (ids: string[]) => Promise<void>;
  initialOrder?: string[];
  onClose: () => void;
}

export function PhotoGalleryModal({
  title, subtitle, fetchImages, uploadImage, deleteImage, saveOrder, initialOrder, onClose,
}: Props) {
  const [images, setImages]           = useState<GalleryImage[]>([]);
  const [loading, setLoading]         = useState(true);
  const [uploading, setUploading]     = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [camMode, setCamMode]         = useState<'off' | 'webcam'>('off');
  const [camReady, setCamReady]       = useState(false);
  const [activeIdx, setActiveIdx]     = useState(0);
  const [orderChanged, setOrderChanged] = useState(false);
  const [thumbDragFrom, setThumbDragFrom] = useState<number | null>(null);
  const [thumbDragOver, setThumbDragOver] = useState<number | null>(null);
  const [dropHover, setDropHover]         = useState(false);

  const fileRef     = useRef<HTMLInputElement>(null);
  const cameraRef   = useRef<HTMLInputElement>(null);
  const htmlRef     = useRef<HTMLInputElement>(null);
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const thumbRef    = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    fetchImages()
      .then(imgs => {
        if (initialOrder?.length) {
          imgs.sort((a, b) => {
            const ai = initialOrder.indexOf(a.id);
            const bi = initialOrder.indexOf(b.id);
            if (ai === -1 && bi === -1) return 0;
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
          });
        }
        setImages(imgs);
        setActiveIdx(0);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
    return () => stopStream();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); prev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      if (e.key === 'Escape')     { stopStream(); onClose(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, images.length]);

  useEffect(() => {
    const strip = thumbRef.current;
    if (!strip) return;
    const thumb = strip.children[activeIdx] as HTMLElement | undefined;
    thumb?.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
  }, [activeIdx]);

  function prev() { setActiveIdx(i => (i > 0 ? i - 1 : images.length - 1)); }
  function next() { setActiveIdx(i => (i < images.length - 1 ? i + 1 : 0)); }

  function stopStream() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCamReady(false);
    setCamMode('off');
  }

  async function startWebcam() {
    setError('');
    setCamMode('webcam');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); setCamReady(true); }
    } catch {
      setError('Camera access denied. Check browser permissions.');
      setCamMode('off');
    }
  }

  async function captureWebcam() {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    canvas.toBlob(async blob => {
      if (!blob) return;
      stopStream(); setUploading(true);
      try {
        const img = await uploadImage(new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' }), 'Camera capture');
        setImages(prev => { const next = [...prev, img]; setActiveIdx(next.length - 1); return next; });
      } catch (err: unknown) { setError('Upload failed: ' + (err instanceof Error ? err.message : '')); }
      finally { setUploading(false); }
    }, 'image/jpeg', 0.92);
  }

  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    setUploading(true); setError('');
    const uploaded: GalleryImage[] = [];
    for (const f of files) {
      try {
        const img = await uploadImage(f);
        uploaded.push(img);
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message ?? String(err);
        setError(`Upload failed: ${msg}`);
        console.error('Photo upload error:', err);
      }
    }
    if (uploaded.length) {
      setImages(prev => { const next = [...prev, ...uploaded]; setActiveIdx(next.length - 1); return next; });
    }
    setUploading(false);
    if (fileRef.current)   fileRef.current.value = '';
    if (cameraRef.current) cameraRef.current.value = '';
  }

  async function uploadFromHtml(file: File) {
    setUploading(true); setError('');
    try {
      const html = await file.text();
      const doc  = new DOMParser().parseFromString(html, 'text/html');
      const imgs = Array.from(doc.querySelectorAll('img'));
      if (!imgs.length) { setError('No images found in the HTML file.'); return; }
      let uploaded = 0;
      for (const img of imgs) {
        const src = img.getAttribute('src') || '';
        if (!src) continue;
        let blob: Blob | null = null;
        if (src.startsWith('data:image/')) {
          const [meta, b64] = src.split(',');
          const mime = meta.split(':')[1].split(';')[0];
          const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          blob = new Blob([bytes], { type: mime });
        } else if (src.startsWith('blob:') || src.startsWith('http')) {
          try { const r = await fetch(src); if (r.ok) blob = await r.blob(); } catch { continue; }
        } else { continue; }
        if (!blob || !blob.type.startsWith('image/')) continue;
        const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
        const f   = new File([blob], `html-${Date.now()}-${uploaded}.${ext}`, { type: blob.type });
        const result = await uploadImage(f, img.getAttribute('alt') || 'Photo');
        setImages(prev => { const next = [...prev, result]; setActiveIdx(next.length - 1); return next; });
        uploaded++;
      }
      if (uploaded === 0) setError('No uploadable images found in the HTML file.');
    } catch (err: unknown) { setError('HTML import failed: ' + (err instanceof Error ? err.message : '')); }
    finally { setUploading(false); if (htmlRef.current) htmlRef.current.value = ''; }
  }

  function onThumbDragStart(idx: number, e: React.DragEvent) {
    setThumbDragFrom(idx);
    e.dataTransfer.effectAllowed = 'move';
    // Mark as internal reorder so the outer drop zone ignores it
    e.dataTransfer.setData('application/x-thumb-reorder', String(idx));
    e.stopPropagation();
  }
  function onThumbDragOver(idx: number, e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation(); // prevent outer drop zone from stealing the event
    e.dataTransfer.dropEffect = 'move';
    setThumbDragOver(idx);
  }
  function onThumbDrop(toIdx: number, e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation(); // prevent outer drop zone from firing
    const fromStr = e.dataTransfer.getData('application/x-thumb-reorder');
    const fromIdx = fromStr !== '' ? parseInt(fromStr, 10) : thumbDragFrom;
    if (fromIdx === null || fromIdx === toIdx) { setThumbDragFrom(null); setThumbDragOver(null); return; }
    setImages(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx!, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    setActiveIdx(toIdx);
    setOrderChanged(true);
    setThumbDragFrom(null); setThumbDragOver(null);
  }
  function onThumbDragEnd() { setThumbDragFrom(null); setThumbDragOver(null); }

  async function handleSaveOrder() {
    if (!saveOrder) return;
    setSaving(true);
    try {
      await saveOrder(images.map(i => i.id));
      setOrderChanged(false);
    } catch (e: unknown) { setError('Save order failed: ' + (e instanceof Error ? e.message : '')); }
    finally { setSaving(false); }
  }

  async function handleDelete(idx: number) {
    const img = images[idx];
    if (!confirm('Remove this photo?')) return;
    try {
      await deleteImage(img.id, img.url);
      setImages(prev => {
        const next = prev.filter((_, i) => i !== idx);
        setActiveIdx(i => Math.min(i, Math.max(0, next.length - 1)));
        return next;
      });
    } catch (err: unknown) { setError('Delete failed: ' + (err instanceof Error ? err.message : '')); }
  }

  const current = images[activeIdx];
  function onDropZoneDragOver(e: React.DragEvent) {
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
    setDropHover(true);
  }
  function onDropZoneDragLeave(e: React.DragEvent) {
    if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
    setDropHover(false);
  }
  function onDropZoneDrop(e: React.DragEvent) {
    e.preventDefault(); setDropHover(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) uploadFiles(files);
  }

  const btn: React.CSSProperties = { padding: '10px 8px', borderRadius: 10, border: '2px dashed var(--line)', background: 'var(--surface-soft)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)' };

  return (
    <div onClick={() => { stopStream(); onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 820, maxHeight: '94vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}
        onDragOver={onDropZoneDragOver}
        onDragLeave={onDropZoneDragLeave}
        onDrop={onDropZoneDrop}
      >
        {/* Full-modal drop overlay */}
        {dropHover && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(34,197,94,0.15)', border: '3px dashed #22c55e', borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, pointerEvents: 'none' }}>
            <div style={{ fontSize: 52 }}>🖼️</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#16a34a' }}>Drop images here to upload</div>
          </div>
        )}

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17 }}>📷 {title}</h2>
            {subtitle && <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: 12 }}>{subtitle}</p>}
          </div>
          <button onClick={() => { stopStream(); onClose(); }} style={{ background: 'var(--surface-soft)', border: 'none', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {error && <p style={{ color: 'var(--danger)', margin: '8px 20px 0', padding: '8px 12px', background: 'rgba(220,38,38,0.08)', borderRadius: 6, fontSize: 13 }}>{error}</p>}

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {loading && <p style={{ color: 'var(--muted)', textAlign: 'center', fontSize: 13 }}>Loading photos…</p>}

          {/* Webcam */}
          {camMode === 'webcam' && (
            <div style={{ borderRadius: 10, overflow: 'hidden', border: '2px solid var(--accent)', background: '#000' }}>
              <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', maxHeight: 320, display: 'block', objectFit: 'cover' }} />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              <div style={{ display: 'flex', gap: 10, padding: 12, justifyContent: 'center' }}>
                <button className="btn btn-primary" onClick={captureWebcam} disabled={!camReady || uploading}>📸 {uploading ? 'Saving…' : 'Capture'}</button>
                <button className="btn" onClick={stopStream}>Cancel</button>
              </div>
            </div>
          )}

          {/* Carousel */}
          {camMode === 'off' && images.length > 0 && (
            <div>
              <div
                style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000', aspectRatio: '16/9' }}
                onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
                onTouchEnd={e => {
                  if (touchStartX.current === null) return;
                  const dx = e.changedTouches[0].clientX - touchStartX.current;
                  if (dx > 40) prev(); else if (dx < -40) next();
                  touchStartX.current = null;
                }}
              >
                {current && (
                  <StorageImage key={current.id} url={current.url} alt={current.label}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', transition: 'opacity .15s' }} />
                )}
                {images.length > 1 && (
                  <button onClick={prev} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%', width: 40, height: 40, cursor: 'pointer', color: '#fff', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
                )}
                {images.length > 1 && (
                  <button onClick={next} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%', width: 40, height: 40, cursor: 'pointer', color: '#fff', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
                )}
                <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 12px' }}>
                  <span style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12, padding: '3px 10px', borderRadius: 20 }}>{activeIdx + 1} / {images.length}</span>
                  {current?.label && <span style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 11, padding: '3px 10px', borderRadius: 20, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current.label}</span>}
                  <button onClick={() => handleDelete(activeIdx)} style={{ background: 'rgba(180,0,0,0.75)', border: 'none', borderRadius: 20, color: '#fff', fontSize: 12, padding: '4px 12px', cursor: 'pointer' }}>🗑 Delete</button>
                </div>
              </div>

              {/* Save order bar */}
              {orderChanged && saveOrder && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, padding: '8px 12px', background: 'rgba(204,0,0,0.07)', border: '1px solid rgba(204,0,0,0.25)', borderRadius: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--accent,#cc0000)', fontWeight: 600 }}>⇄ Photo order changed — save to keep it</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setOrderChanged(false)} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface-soft)', cursor: 'pointer' }}>Discard</button>
                    <button onClick={handleSaveOrder} disabled={saving}
                      onMouseEnter={e => { if (!saving) { e.currentTarget.style.background = 'var(--accent,#cc0000)'; e.currentTarget.style.color = '#fff'; } }}
                      onMouseLeave={e => { if (!saving) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--accent,#cc0000)'; } }}
                      style={{ fontSize: 12, fontWeight: 700, padding: '4px 14px', borderRadius: 999, border: '2px solid var(--accent,#cc0000)', background: 'transparent', color: 'var(--accent,#cc0000)', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, transition: 'background .15s, color .15s' }}>
                      {saving ? 'Saving…' : '✓ Save Order'}
                    </button>
                  </div>
                </div>
              )}

              {/* Thumbnail strip */}
              <div ref={thumbRef} style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginTop: orderChanged ? 6 : 10, scrollbarWidth: 'thin' }}>
                {images.map((img, i) => (
                  <div
                    key={img.id}
                    draggable
                    onDragStart={e => onThumbDragStart(i, e)}
                    onDragOver={e => onThumbDragOver(i, e)}
                    onDrop={e => onThumbDrop(i, e)}
                    onDragEnd={onThumbDragEnd}
                    onClick={() => setActiveIdx(i)}
                    title="Drag to reorder"
                    style={{
                      flexShrink: 0, width: 72, height: 54, borderRadius: 8, overflow: 'hidden',
                      cursor: thumbDragFrom !== null ? 'grabbing' : 'grab',
                      border: i === activeIdx ? '2px solid var(--accent,#cc0000)' : thumbDragOver === i && thumbDragFrom !== i ? '2px dashed var(--accent,#cc0000)' : '2px solid transparent',
                      opacity: thumbDragFrom === i ? 0.35 : i === activeIdx ? 1 : 0.65,
                      transition: 'opacity .15s, border-color .15s',
                      background: '#000',
                      transform: thumbDragOver === i && thumbDragFrom !== i ? 'scale(1.08)' : 'scale(1)',
                    }}
                  >
                    <StorageImage url={img.url} alt={img.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
                  </div>
                ))}
              </div>
              {images.length > 1 && !orderChanged && (
                <p style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', margin: '4px 0 0' }}>Drag thumbnails to reorder</p>
              )}
            </div>
          )}

          {/* Empty state / drop zone hint */}
          {camMode === 'off' && !loading && images.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--muted)', fontSize: 13, border: '2px dashed var(--line)', borderRadius: 12 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📷</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>No photos yet</div>
              <div>Drag &amp; drop images here, or use the buttons below</div>
            </div>
          )}

          {/* Upload buttons */}
          {camMode === 'off' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
              <button onClick={() => fileRef.current?.click()} disabled={uploading} style={btn}>
                <span style={{ fontSize: 22 }}>🖼️</span>
                <span>{uploading ? 'Uploading…' : 'Add Photos'}</span>
              </button>
              <button onClick={() => cameraRef.current?.click()} disabled={uploading} style={btn}>
                <span style={{ fontSize: 22 }}>📷</span>
                <span>Take Photo</span>
              </button>
              <button onClick={startWebcam} disabled={uploading} style={btn}>
                <span style={{ fontSize: 22 }}>🎥</span>
                <span>Use Webcam</span>
              </button>
              <button onClick={() => htmlRef.current?.click()} disabled={uploading} style={btn}>
                <span style={{ fontSize: 22 }}>📄</span>
                <span>Import HTML</span>
              </button>
            </div>
          )}
        </div>

        {/* Hidden file inputs */}
        <input ref={fileRef}   type="file" accept="image/*,application/pdf,.pdf,.doc,.docx" multiple style={{ display: 'none' }} onChange={e => uploadFiles(Array.from(e.target.files ?? []))} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => uploadFiles(Array.from(e.target.files ?? []))} />
        <input ref={htmlRef}   type="file" accept=".html,.htm" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadFromHtml(f); }} />
      </div>
    </div>
  );
}
