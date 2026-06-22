'use client';

import { useEffect, useRef, useState } from 'react';
import { Panel } from '@/components/Panel';
import { Badge } from '@/components/Badge';
import { fetchVehicles, saveVehicle, updateVehicle, updateVehicleServiceRecord, deleteVehicle } from '@/services/vehicleService';
import type { VehicleRecord } from '@/services/vehicleService';
import { fetchCustomers, saveCustomer } from '@/services/customerService';
import type { Customer } from '@/lib/types';
import { fetchVehicleImages, uploadVehicleImage, deleteVehicleImage, type VehicleImage } from '@/services/vehicleImageService';
import type { Vehicle } from '@/lib/types';
import { useAppDispatch } from '@/lib/store';
import { fetchShopSettings } from '@/services/shopSettingsService';

type VehicleWithId = Vehicle & { id: string };
type ViewMode = 'grid' | 'list' | 'service' | 'kanban';
type StatusFilter = 'All' | 'In Progress' | 'Completed' | 'Pending' | 'Pending Approval' | 'Archived' | 'Pending Parts' | 'Returned Job' | 'Active' | 'No open jobs';

const EMPTY_FORM = {
  customerId: '', vin: '', label: '', trim: '',
  engine: '', transmission: '', mileage: '', plate: '', status: 'Active', recommendation: '',
};

// Deterministic per-tech color from name hash
const TECH_PALETTES = [
  { bg: '#dbeafe', color: '#1e40af', border: '#bfdbfe' }, // blue
  { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' }, // green
  { bg: '#fce7f3', color: '#9d174d', border: '#fbcfe8' }, // pink
  { bg: '#fef3c7', color: '#92400e', border: '#fde68a' }, // amber
  { bg: '#ede9fe', color: '#5b21b6', border: '#ddd6fe' }, // purple
  { bg: '#ffedd5', color: '#9a3412', border: '#fed7aa' }, // orange
  { bg: '#cffafe', color: '#155e75', border: '#a5f3fc' }, // cyan
  { bg: '#f0fdf4', color: '#14532d', border: '#bbf7d0' }, // emerald
  { bg: '#fdf4ff', color: '#701a75', border: '#f5d0fe' }, // fuchsia
  { bg: '#fff7ed', color: '#7c2d12', border: '#fed7aa' }, // red-orange
];
function techColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TECH_PALETTES[hash % TECH_PALETTES.length];
}

function statusColor(status: string) {
  if (status === 'Completed') return { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' };
  if (status === 'In Progress') return { bg: '#dbeafe', color: '#1e40af', border: '#bfdbfe' };
  if (status === 'Pending') return { bg: '#fef9c3', color: '#854d0e', border: '#fef08a' };
  if (status === 'Pending Approval') return { bg: '#fdf4ff', color: '#7e22ce', border: '#e9d5ff' };
  if (status === 'Archived') return { bg: '#f3f4f6', color: '#6b7280', border: '#d1d5db' };
  if (status === 'Pending Parts') return { bg: '#ffedd5', color: '#9a3412', border: '#fed7aa' };
  if (status === 'Returned Job') return { bg: '#fef3c7', color: '#b45309', border: '#fde68a' };
  if (status === 'Active') return { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' };
  if (status === 'No open jobs') return { bg: '#f8fafc', color: '#64748b', border: '#cbd5e1' };
  return { bg: 'var(--surface-soft)', color: 'var(--muted)', border: 'var(--line)' };
}

function StatusPill({ status }: { status: string }) {
  const c = statusColor(status);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: c.bg, color: c.color, border: `1px solid ${c.border}`, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.color, display: 'inline-block' }} />
      {status || 'Unknown'}
    </span>
  );
}

// ── View Toggle Button ───────────────────────────────────────────
function ViewBtn({ mode, current, icon, label, onClick }: { mode: ViewMode; current: ViewMode; icon: string; label: string; onClick: () => void }) {
  const active = mode === current;
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
        background: active ? 'var(--accent, #cc0000)' : 'var(--surface-soft)',
        color: active ? '#fff' : 'var(--muted)',
        border: `1px solid ${active ? 'var(--accent, #cc0000)' : 'var(--line)'}`,
        borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: active ? 700 : 500,
        transition: 'all .15s',
      }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span> {label}
    </button>
  );
}

// ── Image Gallery Modal ──────────────────────────────────────────
function ImageGallery({ vehicle, onClose }: { vehicle: VehicleRecord; onClose: () => void }) {
  const [images, setImages] = useState<VehicleImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [camMode, setCamMode] = useState<'off' | 'webcam'>('off');
  const [camReady, setCamReady] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [orderChanged, setOrderChanged] = useState(false);
  const [thumbDragFrom, setThumbDragFrom] = useState<number | null>(null);
  const [thumbDragOver, setThumbDragOver] = useState<number | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const htmlRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const thumbStripRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    fetchVehicleImages(vehicle.id)
      .then(imgs => {
        // Sort by saved imageIds order if present
        if (vehicle.imageIds?.length) {
          const order = vehicle.imageIds;
          imgs.sort((a, b) => {
            const ai = order.indexOf(a.id);
            const bi = order.indexOf(b.id);
            if (ai === -1 && bi === -1) return 0;
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
          });
        }
        setImages(imgs); setActiveIdx(0);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
    return () => stopStream();
  }, [vehicle.id, vehicle.imageIds]);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); prev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      if (e.key === 'Escape')     { stopStream(); onClose(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, images.length]);

  function prev() { setActiveIdx(i => (i > 0 ? i - 1 : images.length - 1)); }
  function next() { setActiveIdx(i => (i < images.length - 1 ? i + 1 : 0)); }

  // Scroll active thumbnail into view
  useEffect(() => {
    const strip = thumbStripRef.current;
    if (!strip) return;
    const thumb = strip.children[activeIdx] as HTMLElement | undefined;
    thumb?.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
  }, [activeIdx]);

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
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
      stopStream(); setUploading(true);
      try {
        const img = await uploadVehicleImage(vehicle.id, file, 'Camera capture');
        setImages(prev => { const next = [...prev, img]; setActiveIdx(next.length - 1); return next; });
      } catch (err: unknown) { setError('Upload failed: ' + (err instanceof Error ? err.message : '')); }
      finally { setUploading(false); }
    }, 'image/jpeg', 0.92);
  }

  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(files.map(f => uploadVehicleImage(vehicle.id, f)));
      setImages(prev => { const next = [...prev, ...uploaded]; setActiveIdx(next.length - 1); return next; });
    } catch (err: unknown) { setError('Upload failed: ' + (err instanceof Error ? err.message : '')); }
    finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
      if (cameraRef.current) cameraRef.current.value = '';
    }
  }

  // Extract images from a dropped/selected HTML file and upload them
  async function uploadFromHtml(file: File) {
    setUploading(true); setError('');
    try {
      const html = await file.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const imgs = Array.from(doc.querySelectorAll('img'));
      if (!imgs.length) { setError('No images found in the HTML file.'); return; }

      let uploaded = 0;
      for (const img of imgs) {
        const src = img.getAttribute('src') || '';
        if (!src) continue;
        let blob: Blob | null = null;

        if (src.startsWith('data:image/')) {
          // base64 embedded image
          const [meta, b64] = src.split(',');
          const mime = meta.split(':')[1].split(';')[0];
          const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          blob = new Blob([bytes], { type: mime });
        } else if (src.startsWith('blob:') || src.startsWith('http')) {
          // remote or blob URL — fetch it
          try { const r = await fetch(src); if (r.ok) blob = await r.blob(); } catch { continue; }
        } else if (!src.startsWith('data:')) {
          // relative path — try fetching relative to the file's origin
          continue;
        }

        if (!blob || !blob.type.startsWith('image/')) continue;
        const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
        const f = new File([blob], `html-import-${Date.now()}-${uploaded}.${ext}`, { type: blob.type });
        const result = await uploadVehicleImage(vehicle.id, f, img.getAttribute('alt') || 'Vehicle photo');
        setImages(prev => { const next = [...prev, result]; setActiveIdx(next.length - 1); return next; });
        uploaded++;
      }

      if (uploaded === 0) setError('No uploadable images found in the HTML file (images may be remote URLs not reachable from this browser).');
    } catch (err: unknown) {
      setError('HTML import failed: ' + (err instanceof Error ? err.message : ''));
    } finally {
      setUploading(false);
      if (htmlRef.current) htmlRef.current.value = '';
    }
  }

  // Thumbnail drag-to-reorder handlers
  function onThumbDragStart(idx: number, e: React.DragEvent) {
    setThumbDragFrom(idx);
    e.dataTransfer.effectAllowed = 'move';
  }
  function onThumbDragOver(idx: number, e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setThumbDragOver(idx);
  }
  function onThumbDrop(toIdx: number, e: React.DragEvent) {
    e.preventDefault();
    if (thumbDragFrom === null || thumbDragFrom === toIdx) { setThumbDragFrom(null); setThumbDragOver(null); return; }
    setImages(prev => {
      const next = [...prev];
      const [moved] = next.splice(thumbDragFrom, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    setActiveIdx(toIdx);
    setOrderChanged(true);
    setThumbDragFrom(null);
    setThumbDragOver(null);
  }
  function onThumbDragEnd() { setThumbDragFrom(null); setThumbDragOver(null); }

  async function saveOrder() {
    if (!confirm(`Save this photo order for ${vehicle.label}?`)) return;
    setSaving(true);
    try {
      await updateVehicleServiceRecord(vehicle.id, { imageIds: images.map(i => i.id) });
      setOrderChanged(false);
    } catch (e: unknown) {
      setError('Save order failed: ' + (e instanceof Error ? e.message : ''));
    } finally { setSaving(false); }
  }

  async function handleDelete(idx: number) {
    const img = images[idx];
    if (!confirm('Remove this photo?')) return;
    try {
      await deleteVehicleImage(img.id, img.url);
      setImages(prev => {
        const next = prev.filter((_, i) => i !== idx);
        setActiveIdx(i => Math.min(i, Math.max(0, next.length - 1)));
        return next;
      });
    } catch (err: unknown) { setError('Delete failed: ' + (err instanceof Error ? err.message : '')); }
  }

  const current = images[activeIdx];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 820, maxHeight: '94vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17 }}>{vehicle.label}</h2>
            <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: 12 }}>{vehicle.plate} · {vehicle.vin}</p>
          </div>
          <button onClick={() => { stopStream(); onClose(); }} style={{ background: 'var(--surface-soft)', border: 'none', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {error && <p style={{ color: 'var(--danger)', margin: '8px 20px 0', padding: '8px 12px', background: '#fff0f0', borderRadius: 6, fontSize: 13 }}>{error}</p>}

        {/* ── Main scrollable body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

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

          {/* ── Carousel (shown when photos exist and not in webcam mode) ── */}
          {camMode === 'off' && images.length > 0 && (
            <div>
              {/* Main photo */}
              <div
                style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000', aspectRatio: '16/9' }}
                onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
                onTouchEnd={e => {
                  if (touchStartX.current === null) return;
                  const dx = e.changedTouches[0].clientX - touchStartX.current;
                  if (dx > 40) prev();
                  else if (dx < -40) next();
                  touchStartX.current = null;
                }}
              >
                {current && (
                  <img
                    key={current.id}
                    src={current.url}
                    alt={current.label}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', transition: 'opacity .15s' }}
                  />
                )}

                {/* Left arrow */}
                {images.length > 1 && (
                  <button onClick={prev} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%', width: 40, height: 40, cursor: 'pointer', color: '#fff', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.8)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.55)')}>‹</button>
                )}

                {/* Right arrow */}
                {images.length > 1 && (
                  <button onClick={next} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%', width: 40, height: 40, cursor: 'pointer', color: '#fff', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.8)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.55)')}>›</button>
                )}

                {/* Counter + delete */}
                <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 12px' }}>
                  <span style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12, padding: '3px 10px', borderRadius: 20 }}>
                    {activeIdx + 1} / {images.length}
                  </span>
                  {current?.label && (
                    <span style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 11, padding: '3px 10px', borderRadius: 20, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current.label}</span>
                  )}
                  <button onClick={() => handleDelete(activeIdx)} style={{ background: 'rgba(180,0,0,0.75)', border: 'none', borderRadius: 20, color: '#fff', fontSize: 12, padding: '4px 12px', cursor: 'pointer' }}>🗑 Delete</button>
                </div>
              </div>

              {/* Save order bar — shown when order has changed */}
              {orderChanged && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, padding: '8px 12px', background: 'rgba(204,0,0,0.07)', border: '1px solid rgba(204,0,0,0.25)', borderRadius: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--accent,#cc0000)', fontWeight: 600 }}>⇄ Photo order changed — save to keep it</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setOrderChanged(false); setImages(prev => [...prev]); }} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface-soft)', cursor: 'pointer' }}>Discard</button>
                    <button onClick={saveOrder} disabled={saving} style={{ fontSize: 12, fontWeight: 700, padding: '4px 14px', borderRadius: 6, border: 'none', background: 'var(--accent,#cc0000)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                      {saving ? 'Saving…' : '✓ Save Order'}
                    </button>
                  </div>
                </div>
              )}

              {/* Thumbnail strip — draggable to reorder */}
              <div
                ref={thumbStripRef}
                style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginTop: orderChanged ? 6 : 10, scrollbarWidth: 'thin' }}
              >
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
                    <img src={img.url} alt={img.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
                  </div>
                ))}
              </div>
              {images.length > 1 && !orderChanged && (
                <p style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', margin: '4px 0 0' }}>Drag thumbnails to reorder · changes prompt to save</p>
              )}
            </div>
          )}

          {/* Upload buttons */}
          {camMode === 'off' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                style={{ padding: '14px 8px', borderRadius: 10, border: '2px dashed var(--line)', background: 'var(--surface-soft)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 22 }}>🖼️</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{uploading ? 'Uploading…' : 'Upload Files'}</span>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>JPG, PNG, HEIC</span>
              </button>
              <button onClick={() => cameraRef.current?.click()} disabled={uploading}
                style={{ padding: '14px 8px', borderRadius: 10, border: '2px dashed var(--line)', background: 'var(--surface-soft)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 22 }}>📱</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Phone Camera</span>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>Opens device camera</span>
              </button>
              <button onClick={startWebcam} disabled={uploading}
                style={{ padding: '14px 8px', borderRadius: 10, border: '2px dashed var(--line)', background: 'var(--surface-soft)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 22 }}>📷</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Webcam</span>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>Use connected camera</span>
              </button>
              <button onClick={() => htmlRef.current?.click()} disabled={uploading}
                style={{ padding: '14px 8px', borderRadius: 10, border: '2px dashed var(--accent,#cc0000)', background: 'rgba(204,0,0,0.04)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 22 }}>📄</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent,#cc0000)' }}>HTML Import</span>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>WhatsApp / Notion</span>
              </button>
            </div>
          )}

          {/* Drag & drop zone */}
          {camMode === 'off' && (
            <div
              onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
              onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
              onDrop={e => {
                e.preventDefault(); e.stopPropagation(); setDragOver(false);
                const all: File[] = e.dataTransfer.files?.length
                  ? Array.from(e.dataTransfer.files)
                  : Array.from(e.dataTransfer.items ?? []).filter(i => i.kind === 'file').map(i => i.getAsFile()).filter((f): f is File => f !== null);
                const htmlFiles = all.filter(f => f.name.endsWith('.html') || f.type === 'text/html');
                const imgFiles  = all.filter(f => f.type.startsWith('image/'));
                if (htmlFiles.length) { htmlFiles.forEach(uploadFromHtml); return; }
                if (imgFiles.length)  { uploadFiles(imgFiles); return; }
                setError('No image or HTML files detected. Drop a JPG/PNG/HEIC photo or an HTML file containing photos.');
              }}
              onClick={() => fileRef.current?.click()}
              style={{ border: `2px dashed ${dragOver ? 'var(--accent,#cc0000)' : 'var(--line)'}`, borderRadius: 10, padding: '20px 16px', textAlign: 'center', background: dragOver ? 'rgba(204,0,0,0.06)' : 'var(--surface-soft)', color: dragOver ? 'var(--accent,#cc0000)' : 'var(--muted)', fontSize: 13, cursor: 'pointer', transition: 'all .15s', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5 }}
            >
              <span style={{ fontSize: 24 }}>{dragOver ? '📸' : '🖼️'}</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{dragOver ? 'Release to upload' : 'Drop photos or HTML file here'}</span>
              <span style={{ fontSize: 11 }}>JPG, PNG, HEIC · or WhatsApp/Notion .html export</span>
            </div>
          )}

          {loading && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>Loading photos…</p>}
          {!loading && images.length === 0 && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 10 }}>No photos yet. Use the options above to add some.</p>}
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => uploadFiles(Array.from(e.target.files ?? []))} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => uploadFiles(Array.from(e.target.files ?? []))} />
      <input ref={htmlRef} type="file" accept=".html,text/html" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadFromHtml(f); }} />
    </div>
  );
}

// ── Service Record Card ──────────────────────────────────────────
function ServiceRecordCard({ v, thumbUrl, onPhotos, enablePhotos }: {
  v: VehicleRecord; thumbUrl?: string; onPhotos: () => void; enablePhotos: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const techList = v.assignedTech ? v.assignedTech.split(';').map(t => t.trim()).filter(Boolean) : [];

  return (
    <article style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Top photo strip */}
      {enablePhotos && (
        <div onClick={onPhotos} style={{ height: 120, cursor: 'pointer', background: thumbUrl ? '#000' : 'var(--surface-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderBottom: '1px solid var(--line)', position: 'relative' }}>
          {thumbUrl
            ? <img src={thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--muted)' }}><span style={{ fontSize: 28 }}>🚗</span><span style={{ fontSize: 11 }}>Add photos</span></div>
          }
          <div style={{ position: 'absolute', bottom: 6, right: 8, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, padding: '2px 7px', borderRadius: 5 }}>📷 Photos</div>
        </div>
      )}

      <div style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.35, marginBottom: 3 }}>{v.label}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              {[v.year, v.make, v.model].filter(Boolean).join(' ') || '—'}
              {v.fuelType ? ` · ${v.fuelType}` : ''}
            </div>
          </div>
          <StatusPill status={v.status} />
        </div>

        {/* Key facts grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 12px', fontSize: 12 }}>
          <div style={{ color: 'var(--muted)' }}>Plate</div>
          <div style={{ fontWeight: 600 }}>{v.plate || '—'}</div>
          <div style={{ color: 'var(--muted)' }}>VIN</div>
          <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>{v.vin || '—'}</div>
          {v.dateReceived && <>
            <div style={{ color: 'var(--muted)' }}>Received</div>
            <div style={{ fontWeight: 600 }}>{new Date(v.dateReceived).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          </>}
        </div>

        {/* Assigned techs */}
        {techList.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {techList.map(t => {
              const c = techColor(t);
              return <span key={t} style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 600 }}>{t}</span>;
            })}
          </div>
        )}

        {/* Issues */}
        {v.issues && (
          <div style={{ background: '#fff8f0', border: '1px solid #fed7aa', borderRadius: 8, padding: '7px 10px', fontSize: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 11, color: '#92400e', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Issues</div>
            <div style={{ color: '#78350f', lineHeight: 1.5 }}>{v.issues}</div>
          </div>
        )}

        {/* Expand for more details */}
        {(v.damageIntake || v.partsNeeded || v.partsExchanged || v.issuesResolved) && (
          <>
            <button onClick={() => setExpanded(x => !x)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent, #cc0000)', fontSize: 12, fontWeight: 600, textAlign: 'left', padding: 0 }}>
              {expanded ? '▲ Hide details' : '▼ More details'}
            </button>
            {expanded && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                {v.damageIntake && (
                  <div style={{ background: '#fff0f0', border: '1px solid #fcc', borderRadius: 8, padding: '7px 10px', fontSize: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 11, color: '#991b1b', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Damage on Intake</div>
                    <div style={{ color: '#7f1d1d' }}>{v.damageIntake}</div>
                  </div>
                )}
                {v.partsNeeded && (
                  <div style={{ fontSize: 12 }}><span style={{ fontWeight: 700, color: 'var(--muted)' }}>Parts Needed: </span>{v.partsNeeded}</div>
                )}
                {v.partsExchanged && (
                  <div style={{ fontSize: 12 }}><span style={{ fontWeight: 700, color: 'var(--muted)' }}>Parts Exchanged: </span>{v.partsExchanged}</div>
                )}
                {v.issuesResolved && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{ color: '#166534', fontWeight: 700 }}>✓ Issues Resolved</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}

// ── Vehicle Edit Drawer ─────────────────────────────────────────
const STATUSES = ['In Progress', 'Pending Parts', 'Pending Approval', 'Completed', 'Returned Job', 'Active', 'No open jobs', 'Archived'];

const KANBAN_COLUMNS = [
  { status: 'Pending Approval', label: 'Pending Customer Approval', icon: '⏳', color: '#7e22ce', bg: '#fdf4ff', border: '#e9d5ff', headerBg: '#ede9fe', extraStatuses: [] as string[] },
  { status: 'In Progress',      label: 'Work In Progress',          icon: '🔧', color: '#1e40af', bg: '#dbeafe', border: '#bfdbfe', headerBg: '#dbeafe', extraStatuses: [] as string[] },
  { status: 'Pending Parts',    label: 'Pending Parts',             icon: '📦', color: '#9a3412', bg: '#ffedd5', border: '#fed7aa', headerBg: '#ffedd5', extraStatuses: [] as string[] },
  { status: 'Completed',        label: 'Completed',                 icon: '✅', color: '#166534', bg: '#dcfce7', border: '#bbf7d0', headerBg: '#dcfce7', extraStatuses: [] as string[] },
  { status: 'Returned Job',     label: 'Returned Job',              icon: '↩',  color: '#b45309', bg: '#fef9c3', border: '#fde68a', headerBg: '#fef9c3', extraStatuses: [] as string[] },
  { status: 'Active',           label: 'Active / No Open Jobs',     icon: '🟢', color: '#166534', bg: '#f0fdf4', border: '#bbf7d0', headerBg: '#f0fdf4', extraStatuses: ['No open jobs', 'Pending'] },
  { status: 'Archived',         label: 'Archived',                  icon: '🗄', color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db', headerBg: '#f3f4f6', extraStatuses: [] as string[] },
];

function VehicleDrawer({ vehicle, customers, allVehicles, onClose, onSaved, onDelete, onPhotos, onJobCard, onReturnJob, onSwitchVehicle }: {
  vehicle: VehicleRecord;
  customers: Customer[];
  allVehicles: VehicleRecord[];
  onClose: () => void;
  onSaved: (v: VehicleRecord) => void;
  onDelete: () => void;
  onPhotos: () => void;
  onJobCard: () => void;
  onReturnJob: () => void;
  onSwitchVehicle: (v: VehicleRecord) => void;
}) {
  const [f, setF] = useState({ ...vehicle });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [custSearch, setCustSearch] = useState('');
  const [showAddForCust, setShowAddForCust] = useState(false);

  // Vehicles belonging to the currently-selected customer (excluding this one)
  const custVehicles = f.customerId ? allVehicles.filter(v => v.customerId === f.customerId && v.id !== vehicle.id) : [];

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500); }
  function set(key: keyof VehicleRecord, val: unknown) { setF(prev => ({ ...prev, [key]: val })); }

  async function quickStatus(newStatus: string) {
    setSaving(true); setErr('');
    try {
      await updateVehicle(vehicle.id, {
        customerId: f.customerId, vin: f.vin, label: f.label, trim: f.trim,
        engine: f.engine, transmission: f.transmission, mileage: f.mileage,
        plate: f.plate, status: newStatus, recommendation: f.recommendation,
      });
      const updated = { ...f, status: newStatus } as VehicleRecord;
      setF(updated);
      onSaved(updated);
      notify(`Status → ${newStatus}`);
    } catch (e: unknown) {
      setErr('Update failed: ' + (e instanceof Error ? e.message : ''));
    } finally { setSaving(false); }
  }

  function handleCustSelect(customerId: string) {
    set('customerId', customerId);
    setCustSearch('');
    setShowAddForCust(false);
  }

  async function handleSave() {
    setSaving(true); setErr('');
    try {
      // Save basic vehicle fields
      await updateVehicle(vehicle.id, {
        customerId: f.customerId, vin: f.vin, label: f.label, trim: f.trim,
        engine: f.engine, transmission: f.transmission, mileage: f.mileage,
        plate: f.plate, status: f.status, recommendation: f.recommendation,
      });
      // Save service record fields
      await updateVehicleServiceRecord(vehicle.id, {
        make: f.make, model: f.model, year: f.year, fuelType: f.fuelType,
        issues: f.issues, damageIntake: f.damageIntake, issuesResolved: f.issuesResolved,
        partsExchanged: f.partsExchanged, partsNeeded: f.partsNeeded,
        flatRateLak: f.flatRateLak, assignedTech: f.assignedTech,
        dateReceived: f.dateReceived, techPayEntries: f.techPayEntries,
      });
      notify('Saved!');
      onSaved(f as VehicleRecord);
    } catch (e: unknown) {
      setErr('Save failed: ' + (e instanceof Error ? e.message : ''));
    } finally { setSaving(false); }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' };
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' };
  function row(l: string, el: React.ReactNode) {
    return (
      <div style={{ marginBottom: 12 }}>
        <span style={label}>{l}</span>
        {el}
      </div>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1100 }} />
      {/* Drawer */}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, maxWidth: '95vw', background: 'var(--surface)', boxShadow: '-4px 0 32px rgba(0,0,0,0.18)', zIndex: 1101, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {toast && <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#16a34a', color: '#fff', padding: '8px 16px', fontSize: 13, fontWeight: 600 }}>{toast}</div>}

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{f.label || 'Vehicle'}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{f.plate || 'No plate'} · {f.vin || 'No VIN'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'var(--surface-soft)', border: 'none', borderRadius: 7, width: 30, height: 30, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {/* Status badge in header area */}
        {f.status && (
          <div style={{ padding: '6px 20px', background: statusColor(f.status).bg, borderBottom: '1px solid ' + statusColor(f.status).border, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: statusColor(f.status).color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>● {f.status}</span>
            {f.status === 'Pending Approval' && <span style={{ fontSize: 11, color: '#7e22ce' }}>— Awaiting customer decision on repair</span>}
            {f.status === 'Archived' && <span style={{ fontSize: 11, color: '#6b7280' }}>— Vehicle archived for future reference</span>}
          </div>
        )}

        {/* Action buttons row 1 */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 20px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
          <button onClick={onJobCard} style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--accent,#cc0000)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>＋ Job Card</button>
          <button onClick={onReturnJob} style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid #f59e0b', background: 'rgba(245,158,11,0.08)', color: '#b45309', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>↩ Return Job</button>
          <button onClick={onPhotos}  style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>📷 Photos</button>
          <button onClick={onDelete}  style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fff0f0', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🗑 Delete</button>
        </div>

        {/* Action buttons row 2 — status shortcuts */}
        <div style={{ display: 'flex', gap: 6, padding: '0 20px 10px', borderBottom: '1px solid var(--line)', flexShrink: 0, flexWrap: 'wrap' }}>
          {f.status !== 'Pending Approval' && f.status !== 'Archived' && (
            <button disabled={saving} onClick={() => quickStatus('Pending Approval')}
              style={{ flex: 1, minWidth: '45%', padding: '6px 8px', borderRadius: 8, border: '2px solid #a855f7', background: 'rgba(168,85,247,0.08)', color: '#7e22ce', fontSize: 11, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
              ⏳ Pending Approval
            </button>
          )}
          {f.status === 'Pending Approval' && (
            <button disabled={saving} onClick={() => quickStatus('In Progress')}
              style={{ flex: 1, minWidth: '45%', padding: '6px 8px', borderRadius: 8, border: '1px solid #2196f3', background: 'rgba(33,150,243,0.08)', color: '#1e40af', fontSize: 11, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
              ✓ Approved — Resume Work
            </button>
          )}
          {f.status !== 'Pending Parts' && f.status !== 'Archived' && (
            <button disabled={saving} onClick={() => quickStatus('Pending Parts')}
              style={{ flex: 1, minWidth: '45%', padding: '6px 8px', borderRadius: 8, border: '1px solid #fed7aa', background: 'rgba(249,115,22,0.07)', color: '#9a3412', fontSize: 11, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
              📦 Pending Parts
            </button>
          )}
          {f.status === 'Pending Parts' && (
            <button disabled={saving} onClick={() => quickStatus('In Progress')}
              style={{ flex: 1, minWidth: '45%', padding: '6px 8px', borderRadius: 8, border: '1px solid #2196f3', background: 'rgba(33,150,243,0.08)', color: '#1e40af', fontSize: 11, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
              🔧 Parts In — Resume Work
            </button>
          )}
          {f.status !== 'Archived' ? (
            <button disabled={saving} onClick={() => quickStatus('Archived')}
              style={{ flex: 1, minWidth: '45%', padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db', background: 'rgba(107,114,128,0.07)', color: '#6b7280', fontSize: 11, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
              🗄 Archive Vehicle
            </button>
          ) : (
            <button disabled={saving} onClick={() => quickStatus('Active')}
              style={{ flex: 1, minWidth: '45%', padding: '6px 8px', borderRadius: 8, border: '1px solid #22c55e', background: 'rgba(34,197,94,0.08)', color: '#166534', fontSize: 11, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
              ♻ Restore from Archive
            </button>
          )}
        </div>

        {/* Form body */}
        <div style={{ flex: 1, padding: '16px 20px', overflowY: 'auto' }}>
          {err && <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fff0f0', border: '1px solid #fca5a5', borderRadius: 7, color: '#dc2626', fontSize: 12 }}>{err}</div>}

          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent,#cc0000)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Basic Info</div>

          {row('Vehicle Label', <input style={inp} value={f.label} onChange={e => set('label', e.target.value)} placeholder="2023 Ford F-150" />)}

          {/* ── Customer picker ── */}
          <div style={{ marginBottom: 12 }}>
            <span style={label}>Customer</span>
            <div style={{ position: 'relative' }}>
              <input
                value={custSearch !== '' ? custSearch : (customers.find(c => c.id === f.customerId)?.name ?? '')}
                onChange={e => { setCustSearch(e.target.value); if (!e.target.value) set('customerId', ''); }}
                onFocus={e => { setCustSearch(''); e.target.select(); }}
                placeholder="Search customers…"
                style={{ ...inp, borderColor: f.customerId ? '#22c55e' : 'var(--line)' }}
              />
              {custSearch && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', maxHeight: 200, overflowY: 'auto', marginTop: 2 }}>
                  {customers.filter(c => c.name.toLowerCase().includes(custSearch.toLowerCase())).length === 0
                    ? <div style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: 12 }}>No customers found</div>
                    : customers.filter(c => c.name.toLowerCase().includes(custSearch.toLowerCase())).map(c => {
                        const n = allVehicles.filter(v => v.customerId === c.id).length;
                        return (
                          <div key={c.id} onClick={() => handleCustSelect(c.id)}
                            style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-soft)') as unknown as void}
                            onMouseLeave={e => (e.currentTarget.style.background = '') as unknown as void}>
                            <div>
                              <div style={{ fontWeight: 600 }}>{c.name}</div>
                              {c.phone && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.phone}</div>}
                            </div>
                            {n > 0 && <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface-soft)', borderRadius: 10, padding: '2px 7px', flexShrink: 0 }}>{n} vehicle{n !== 1 ? 's' : ''}</span>}
                          </div>
                        );
                      })
                  }
                </div>
              )}
            </div>
          </div>

          {/* ── Other vehicles for this customer ── */}
          {custVehicles.length > 0 && (
            <div style={{ marginBottom: 14, background: 'rgba(33,150,243,0.04)', border: '1px solid rgba(33,150,243,0.2)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#2196f3', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid rgba(33,150,243,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>🚗 {customers.find(c => c.id === f.customerId)?.name}&apos;s Other Vehicles ({custVehicles.length})</span>
                <button type="button" onClick={() => setShowAddForCust(v => !v)}
                  style={{ fontSize: 11, fontWeight: 700, color: showAddForCust ? '#888' : '#2196f3', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  {showAddForCust ? '✕ cancel' : '+ New vehicle'}
                </button>
              </div>
              {custVehicles.map(v => (
                <div key={v.id} onClick={() => onSwitchVehicle(v)}
                  style={{ padding: '9px 12px', borderBottom: '1px solid rgba(33,150,243,0.1)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(33,150,243,0.07)') as unknown as void}
                  onMouseLeave={e => (e.currentTarget.style.background = '') as unknown as void}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{v.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{v.plate || '—'} · {v.vin || 'No VIN'}</div>
                  </div>
                  <span style={{ fontSize: 11, color: '#2196f3', fontWeight: 700, flexShrink: 0 }}>Open →</span>
                </div>
              ))}
              {showAddForCust && (
                <div style={{ padding: '10px 12px', background: 'rgba(33,150,243,0.04)', borderTop: '1px solid rgba(33,150,243,0.15)', fontSize: 12, color: 'var(--muted)' }}>
                  Save this record first, then use <strong>+ Add Vehicle</strong> from the list and select this customer — their info will auto-fill.
                </div>
              )}
            </div>
          )}

          {/* If no other vehicles, offer to add one */}
          {custVehicles.length === 0 && f.customerId && (
            <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--muted)', padding: '6px 10px', background: 'var(--surface-soft)', borderRadius: 7, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Only vehicle on file for this customer</span>
              <button type="button" onClick={() => setShowAddForCust(v => !v)}
                style={{ color: '#2196f3', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>+ Add another</button>
            </div>
          )}
          {showAddForCust && custVehicles.length === 0 && (
            <div style={{ marginBottom: 14, padding: '10px 12px', background: 'rgba(33,150,243,0.04)', border: '1px solid rgba(33,150,243,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--muted)' }}>
              Close this drawer, then click <strong>+ Add Vehicle</strong> — the customer will be pre-selected and their info auto-filled.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div><span style={label}>Year</span><input style={inp} value={f.year} onChange={e => set('year', e.target.value)} placeholder="2023" /></div>
            <div><span style={label}>Make</span><input style={inp} value={f.make} onChange={e => set('make', e.target.value)} placeholder="Ford" /></div>
            <div><span style={label}>Model</span><input style={inp} value={f.model} onChange={e => set('model', e.target.value)} placeholder="F-150" /></div>
            <div><span style={label}>Fuel Type</span><input style={inp} value={f.fuelType} onChange={e => set('fuelType', e.target.value)} placeholder="Petrol" /></div>
            <div><span style={label}>Plate</span><input style={inp} value={f.plate} onChange={e => set('plate', e.target.value)} /></div>
            <div><span style={label}>Mileage</span><input style={inp} value={f.mileage} onChange={e => set('mileage', e.target.value)} /></div>
          </div>
          {row('VIN', <input style={{ ...inp, fontFamily: 'monospace', letterSpacing: '0.06em' }} value={f.vin} onChange={e => set('vin', e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 17))} maxLength={17} />)}
          {row('Engine', <input style={inp} value={f.engine} onChange={e => set('engine', e.target.value)} />)}
          {row('Transmission', <input style={inp} value={f.transmission} onChange={e => set('transmission', e.target.value)} />)}
          {row('Status', (
            <select style={{ ...inp }} value={f.status} onChange={e => set('status', e.target.value)}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ))}
          {row('Date Received', <input type="date" style={inp} value={f.dateReceived ?? ''} onChange={e => set('dateReceived', e.target.value || null)} />)}

          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent,#cc0000)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '16px 0 10px' }}>Service Record</div>

          {row('Assigned Tech(s)', <input style={inp} value={f.assignedTech} onChange={e => set('assignedTech', e.target.value)} placeholder="Beck; Kat; Wally" />)}
          {row('Issues / Work Needed', <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={f.issues} onChange={e => set('issues', e.target.value)} />)}
          {row('Damage at Intake', <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={f.damageIntake} onChange={e => set('damageIntake', e.target.value)} />)}
          {row('Parts Needed', <textarea style={{ ...inp, minHeight: 55, resize: 'vertical' }} value={f.partsNeeded} onChange={e => set('partsNeeded', e.target.value)} />)}
          {row('Parts Exchanged', <textarea style={{ ...inp, minHeight: 55, resize: 'vertical' }} value={f.partsExchanged} onChange={e => set('partsExchanged', e.target.value)} />)}
          {row('Flat Rate (LAK)', <input type="number" style={inp} value={f.flatRateLak ?? ''} onChange={e => set('flatRateLak', e.target.value ? Number(e.target.value) : null)} />)}
          {row('Tech Pay Notes', <input style={inp} value={f.techPayEntries} onChange={e => set('techPayEntries', e.target.value)} />)}
          {row('Recommended Service', <input style={inp} value={f.recommendation} onChange={e => set('recommendation', e.target.value)} />)}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <input type="checkbox" id="issues-resolved" checked={f.issuesResolved} onChange={e => set('issuesResolved', e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
            <label htmlFor="issues-resolved" style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Issues Resolved</label>
          </div>
        </div>

        {/* Save footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--line)', flexShrink: 0, display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: 'var(--accent,#cc0000)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : '✓ Save Changes'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main View ───────────────────────────────────────────────────
export function VehiclesView() {
  const dispatch = useAppDispatch();
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ name: '', phone: '', email: '', type: 'Individual' });
  const [custSearch, setCustSearch] = useState('');
  const [savingCust, setSavingCust] = useState(false);
  const [custVehicles, setCustVehicles] = useState<VehicleRecord[]>([]); // vehicles for selected customer in add form
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [vinError, setVinError] = useState('');
  const [toast, setToast] = useState('');
  const [galleryVehicle, setGalleryVehicle] = useState<VehicleRecord | null>(null);
  const [drawerVehicle, setDrawerVehicle] = useState<VehicleRecord | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string[]>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [enableVehiclePhotos, setEnableVehiclePhotos] = useState(true);
  const [enableVehicleEdit, setEnableVehicleEdit] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [search, setSearch] = useState('');
  const [kanbanDragId, setKanbanDragId] = useState<string | null>(null);
  const [kanbanDragOver, setKanbanDragOver] = useState<string | null>(null);

  useEffect(() => {
    fetchShopSettings().then(s => {
      setEnableVehiclePhotos(s.enableVehiclePhotos ?? true);
      setEnableVehicleEdit(s.enableVehicleEdit ?? true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([fetchVehicles(), fetchCustomers()])
      .then(([v, c]) => {
        setVehicles(v as VehicleRecord[]);
        setCustomers(c);
        v.forEach(vehicle => {
          fetchVehicleImages(vehicle.id).then(imgs => {
            // Apply saved photo order so list thumbnail matches carousel first photo
            if (vehicle.imageIds?.length) {
              const order = vehicle.imageIds;
              imgs.sort((a, b) => {
                const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
                if (ai === -1 && bi === -1) return 0;
                if (ai === -1) return 1; if (bi === -1) return -1;
                return ai - bi;
              });
            }
            const urls = imgs.slice(0, 5).map(i => i.url);
            if (urls.length > 0) setThumbs(prev => ({ ...prev, [vehicle.id]: urls }));
          }).catch(() => {});
        });
      })
      .catch(err => setError('Load error: ' + (err?.message || '')))
      .finally(() => setLoading(false));
  }, []);

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  async function handleKanbanMove(vehicleId: string, newStatus: string) {
    const v = vehicles.find(x => x.id === vehicleId);
    if (!v || v.status === newStatus) return;
    try {
      await updateVehicle(v.id, {
        customerId: v.customerId, vin: v.vin, label: v.label, trim: v.trim,
        engine: v.engine, transmission: v.transmission, mileage: v.mileage,
        plate: v.plate, status: newStatus, recommendation: v.recommendation,
      });
      setVehicles(prev => prev.map(x => x.id === vehicleId ? { ...x, status: newStatus } : x));
      notify(`${v.label} → ${newStatus}`);
    } catch { notify('Status update failed'); }
  }

  async function handleDeleteVehicle(v: VehicleRecord) {
    if (!confirm(`Delete ${v.label}? This cannot be undone.`)) return;
    try {
      await deleteVehicle(v.id);
      setVehicles(prev => prev.filter(x => x.id !== v.id));
      notify(`${v.label} deleted.`);
    } catch (err) { setError('Delete failed: ' + (err instanceof Error ? err.message : '')); }
  }

  function handleCustomerSelect(customerId: string) {
    setCustSearch('');
    setShowAddCustomer(false);
    if (!customerId) { setForm(f => ({ ...f, customerId: '' })); setCustVehicles([]); return; }
    const cvs = vehicles.filter(v => v.customerId === customerId)
      .sort((a, b) => (b.dateReceived ?? '').localeCompare(a.dateReceived ?? ''));
    setCustVehicles(cvs);
    if (cvs.length === 1) {
      // Only one car — auto-fill immediately
      applyVehicleTemplate(customerId, cvs[0]);
    } else {
      // Multiple cars — set customer only, let user pick which car to pre-fill from
      setForm(f => ({ ...f, customerId, label: '', vin: '', trim: '', engine: '', transmission: '', plate: '' }));
    }
  }

  function applyVehicleTemplate(customerId: string, v: VehicleRecord) {
    setForm(f => ({
      ...f,
      customerId,
      label:        v.label,
      vin:          v.vin,
      trim:         v.trim,
      engine:       v.engine,
      transmission: v.transmission,
      plate:        v.plate,
    }));
  }

  async function handleAddCustomer() {
    if (!newCust.name.trim()) return;
    setSavingCust(true);
    try {
      const created = await saveCustomer({ name: newCust.name.trim(), phone: newCust.phone, email: newCust.email, type: newCust.type, address: '', tags: [], followUp: '', portalToken: null });
      setCustomers(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      handleCustomerSelect(created.id);
      setShowAddCustomer(false);
      setNewCust({ name: '', phone: '', email: '', type: 'Individual' });
      notify(`Customer "${created.name}" created and selected.`);
    } catch (err) { notify('Failed to create customer: ' + (err instanceof Error ? err.message : '')); }
    finally { setSavingCust(false); }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (form.vin.trim()) {
      const vin = form.vin.trim().toUpperCase();
      if (vin.length !== 17) { setVinError(`VIN must be exactly 17 characters (you entered ${vin.length}).`); setSaving(false); return; }
      if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) { setVinError('VIN can only contain letters and numbers (I, O, Q are not valid).'); setSaving(false); return; }
    }
    setVinError('');
    setSaving(true);
    try {
      if (editingId) {
        const updated = await updateVehicle(editingId, form);
        setVehicles(prev => prev.map(v => v.id === editingId ? { ...v, ...updated } : v));
        notify(`${updated.label} updated.`);
      } else {
        const newVehicle = await saveVehicle(form);
        setVehicles(prev => [{ ...newVehicle } as VehicleRecord, ...prev]);
        notify(`${newVehicle.label} saved.`);
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      setEditingId(null);
    } catch (err: unknown) {
      notify('Save failed: ' + (err instanceof Error ? err.message : ''));
    } finally { setSaving(false); }
  }

  function field(key: keyof typeof EMPTY_FORM, label: string, placeholder = '') {
    return (
      <div className="login-field">
        <label>{label}</label>
        <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} />
      </div>
    );
  }

  // Filtered + searched list
  const STATUS_FILTERS: StatusFilter[] = ['All', 'In Progress', 'Pending Approval', 'Pending Parts', 'Completed', 'Returned Job', 'Pending', 'Active', 'No open jobs', 'Archived'];
  const filtered = vehicles.filter(v => {
    // Archived vehicles hidden from "All" — must use Archived filter to see them
    if (statusFilter === 'All' && v.status === 'Archived') return false;
    const matchStatus = statusFilter === 'All' || v.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch = !q || [v.label, v.make, v.model, v.vin, v.plate, v.assignedTech, v.issues].some(f => f?.toLowerCase().includes(q));
    return matchStatus && matchSearch;
  });

  // Status counts for filter chips (All excludes archived)
  const counts: Record<string, number> = { All: vehicles.filter(v => v.status !== 'Archived').length };
  vehicles.forEach(v => { counts[v.status] = (counts[v.status] ?? 0) + 1; });

  return (
    <>
      {toast && <div className="toast toast-visible">{toast}</div>}
      {galleryVehicle && <ImageGallery vehicle={galleryVehicle} onClose={() => setGalleryVehicle(null)} />}
      {drawerVehicle && (
        <VehicleDrawer
          vehicle={drawerVehicle}
          customers={customers}
          allVehicles={vehicles}
          onClose={() => setDrawerVehicle(null)}
          onSwitchVehicle={v => setDrawerVehicle(v)}
          onSaved={updated => {
            setVehicles(prev => prev.map(v => v.id === updated.id ? updated : v));
            setDrawerVehicle(updated);
            notify(`${updated.label} updated.`);
          }}
          onDelete={() => { handleDeleteVehicle(drawerVehicle); setDrawerVehicle(null); }}
          onPhotos={() => { setGalleryVehicle(drawerVehicle); setDrawerVehicle(null); }}
          onJobCard={() => {
            const owner = customers.find(c => c.id === drawerVehicle.customerId);
            dispatch({ type: 'OPEN_NEW_JOB_CARD', prefill: { customerName: owner?.name, customerId: drawerVehicle.customerId, vehicle: drawerVehicle.label } });
            setDrawerVehicle(null);
          }}
          onReturnJob={() => {
            const owner = customers.find(c => c.id === drawerVehicle.customerId);
            dispatch({ type: 'OPEN_NEW_JOB_CARD', prefill: { customerName: owner?.name, customerId: drawerVehicle.customerId, vehicle: drawerVehicle.label, notes: `↩ RETURN JOB — Vehicle: ${drawerVehicle.label}` } });
            setDrawerVehicle(null);
          }}
        />
      )}

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        {/* View toggle */}
        <div style={{ display: 'flex', gap: 6 }}>
          <ViewBtn mode="grid"    current={viewMode} icon="⊞" label="Grid"           onClick={() => setViewMode('grid')} />
          <ViewBtn mode="list"    current={viewMode} icon="☰" label="List"           onClick={() => setViewMode('list')} />
          <ViewBtn mode="service" current={viewMode} icon="📋" label="Service Records" onClick={() => setViewMode('service')} />
          <ViewBtn mode="kanban"  current={viewMode} icon="🗂" label="Kanban"         onClick={() => setViewMode('kanban')} />
        </div>
        <button className="btn btn-primary" onClick={() => { setShowForm(v => !v); setVinError(''); setForm(EMPTY_FORM); setEditingId(null); setShowAddCustomer(false); setCustSearch(''); setCustVehicles([]); }}>
          {showForm ? 'Cancel' : '+ Add Vehicle'}
        </button>
      </div>

      {/* ── Search + Status filters (list & service views) ── */}
      {(viewMode === 'list' || viewMode === 'service') && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'center' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search vehicles, VIN, plate, tech, issues…"
            style={{ flex: 1, minWidth: 200, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-soft)', color: 'var(--text)', fontSize: 13 }}
          />
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontWeight: statusFilter === s ? 700 : 400,
                background: statusFilter === s ? (s === 'All' ? '#1a1a1a' : statusColor(s).bg) : 'var(--surface-soft)',
                color: statusFilter === s ? (s === 'All' ? '#fff' : statusColor(s).color) : 'var(--muted)',
                border: `1px solid ${statusFilter === s ? (s === 'All' ? '#1a1a1a' : statusColor(s).border) : 'var(--line)'}`,
              }}
            >
              {s} {counts[s] !== undefined ? `(${counts[s]})` : ''}
            </button>
          ))}
        </div>
      )}

      {/* ── Add / Edit Form ── */}
      {showForm && (
        <form onSubmit={handleSave} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: 20, marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: '1 / -1', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{editingId ? '✏ Edit Vehicle' : '+ Add Vehicle'}</div>
          {/* ── Customer picker with search + quick-add ── */}
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer *</label>
              <button type="button" onClick={() => { setShowAddCustomer(v => !v); setNewCust({ name: custSearch, phone: '', email: '', type: 'Individual' }); }}
                style={{ fontSize: 12, fontWeight: 700, color: '#2196f3', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {showAddCustomer ? '✕ Cancel' : '+ New Customer'}
              </button>
            </div>

            {/* Search + dropdown */}
            {!showAddCustomer && (
              <div style={{ position: 'relative' }}>
                <input
                  value={custSearch || (form.customerId ? (customers.find(c => c.id === form.customerId)?.name ?? '') : '')}
                  onChange={e => { setCustSearch(e.target.value); if (!e.target.value) setForm(f => ({ ...f, customerId: '' })); }}
                  onFocus={e => { setCustSearch(''); e.target.select(); }}
                  placeholder="Search customers…"
                  required={!form.customerId}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${form.customerId ? '#22c55e' : 'var(--line)'}`, background: 'var(--surface-soft)', color: 'var(--text)', boxSizing: 'border-box', fontSize: 14 }}
                />
                {custSearch && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxHeight: 220, overflowY: 'auto', marginTop: 2 }}>
                    {customers.filter(c => c.name.toLowerCase().includes(custSearch.toLowerCase())).length === 0 ? (
                      <div style={{ padding: '12px 14px', color: 'var(--muted)', fontSize: 13 }}>
                        No match — <button type="button" onClick={() => { setShowAddCustomer(true); setNewCust({ name: custSearch, phone: '', email: '', type: 'Individual' }); setCustSearch(''); }}
                          style={{ color: '#2196f3', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>Create "{custSearch}" as new customer →</button>
                      </div>
                    ) : customers.filter(c => c.name.toLowerCase().includes(custSearch.toLowerCase())).map(c => {
                      const custVehicles = vehicles.filter(v => v.customerId === c.id);
                      return (
                        <div key={c.id} onClick={() => handleCustomerSelect(c.id)}
                          style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-soft)') as unknown as void}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent') as unknown as void}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                            {(c.phone || c.email) && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.phone}{c.phone && c.email ? ' · ' : ''}{c.email}</div>}
                          </div>
                          {custVehicles.length > 0 && <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface-soft)', borderRadius: 10, padding: '2px 8px', flexShrink: 0 }}>{custVehicles.length} vehicle{custVehicles.length !== 1 ? 's' : ''}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {form.customerId && !custSearch && (
                  <div style={{ marginTop: 4, fontSize: 11, color: '#22c55e', fontWeight: 600 }}>✓ Customer selected</div>
                )}
              </div>
            )}

            {/* Inline new-customer mini-form */}
            {showAddCustomer && (
              <div style={{ background: 'rgba(33,150,243,0.04)', border: '1px solid rgba(33,150,243,0.25)', borderRadius: 10, padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 700, color: '#2196f3', marginBottom: 2 }}>➕ New Customer</div>
                <div className="login-field" style={{ gridColumn: '1 / -1' }}>
                  <label>Name *</label>
                  <input value={newCust.name} onChange={e => setNewCust(n => ({ ...n, name: e.target.value }))} placeholder="Company or person name" autoFocus />
                </div>
                <div className="login-field">
                  <label>Phone</label>
                  <input value={newCust.phone} onChange={e => setNewCust(n => ({ ...n, phone: e.target.value }))} placeholder="+66 81 234 5678" />
                </div>
                <div className="login-field">
                  <label>Email</label>
                  <input value={newCust.email} onChange={e => setNewCust(n => ({ ...n, email: e.target.value }))} placeholder="email@example.com" type="email" />
                </div>
                <div className="login-field">
                  <label>Type</label>
                  <select value={newCust.type} onChange={e => setNewCust(n => ({ ...n, type: e.target.value }))} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px', background: 'var(--surface-soft)', color: 'var(--text)' }}>
                    <option>Individual</option><option>Business</option><option>Fleet</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8, gridColumn: '1 / -1', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn" onClick={() => setShowAddCustomer(false)}>Cancel</button>
                  <button type="button" className="btn btn-primary" disabled={savingCust || !newCust.name.trim()} onClick={handleAddCustomer}>{savingCust ? 'Saving…' : 'Create & Select'}</button>
                </div>
              </div>
            )}
          </div>
          {/* ── Existing vehicle picker (shown when customer has multiple cars) ── */}
          {custVehicles.length > 0 && form.customerId && (
            <div style={{ gridColumn: '1 / -1', background: 'rgba(33,150,243,0.04)', border: '1px solid rgba(33,150,243,0.25)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', background: 'rgba(33,150,243,0.08)', borderBottom: '1px solid rgba(33,150,243,0.15)', fontSize: 11, fontWeight: 800, color: '#2196f3', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                🚗 {customers.find(c => c.id === form.customerId)?.name} has {custVehicles.length} vehicle{custVehicles.length !== 1 ? 's' : ''} on file — select to pre-fill, or fill in manually below
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 1, background: 'rgba(33,150,243,0.1)' }}>
                {custVehicles.map(v => {
                  const isSelected = form.label === v.label && form.vin === v.vin;
                  return (
                    <div key={v.id} onClick={() => applyVehicleTemplate(form.customerId, v)}
                      style={{ padding: '10px 14px', cursor: 'pointer', background: isSelected ? 'rgba(33,150,243,0.12)' : 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 3, borderLeft: isSelected ? '3px solid #2196f3' : '3px solid transparent', transition: 'all .12s' }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(33,150,243,0.06)'; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface)'; }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: isSelected ? '#2196f3' : 'var(--text)' }}>{v.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 8 }}>
                        {v.plate && <span>🔢 {v.plate}</span>}
                        {v.vin && <span style={{ fontFamily: 'monospace' }}>{v.vin.slice(0, 8)}…</span>}
                      </div>
                      {v.status && <span style={{ fontSize: 10, fontWeight: 700, color: '#2196f3', alignSelf: 'flex-start', marginTop: 2 }}>{isSelected ? '✓ Selected' : 'Click to pre-fill →'}</span>}
                    </div>
                  );
                })}
                <div onClick={() => setForm(f => ({ ...f, label: '', vin: '', trim: '', engine: '', transmission: '', plate: '' }))}
                  style={{ padding: '10px 14px', cursor: 'pointer', background: (!form.label && !form.vin) ? 'rgba(76,175,80,0.08)' : 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'center', borderLeft: (!form.label && !form.vin) ? '3px solid #4caf50' : '3px solid transparent', transition: 'all .12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(76,175,80,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = (!form.label && !form.vin) ? 'rgba(76,175,80,0.08)' : 'var(--surface)'}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#4caf50' }}>＋ New vehicle</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>Fill in the fields below manually</div>
                </div>
              </div>
            </div>
          )}

          {field('label', 'Vehicle (Year Make Model) *', '2023 Ford F-150')}
          <div className="login-field">
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>VIN</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: form.vin.length === 17 ? '#22c55e' : form.vin.length > 0 ? '#f59e0b' : 'var(--muted)' }}>{form.vin.length}/17</span>
            </label>
            <input value={form.vin} onChange={e => { const v = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 17); setForm(f => ({ ...f, vin: v })); if (vinError) setVinError(''); }} placeholder="1FTFW1E85PFA24680" maxLength={17} style={{ borderColor: vinError ? '#ef4444' : form.vin.length === 17 ? '#22c55e' : undefined, fontFamily: 'monospace', letterSpacing: '0.08em' }} />
            {vinError && <div style={{ marginTop: 4, fontSize: 12, color: '#ef4444', fontWeight: 600 }}>⚠ {vinError}</div>}
            {!vinError && form.vin.length > 0 && form.vin.length < 17 && <div style={{ marginTop: 4, fontSize: 11, color: '#f59e0b' }}>{17 - form.vin.length} more needed</div>}
            {!vinError && form.vin.length === 17 && <div style={{ marginTop: 4, fontSize: 11, color: '#22c55e', fontWeight: 600 }}>✓ Valid length</div>}
          </div>
          {field('trim', 'Trim', 'XL SuperCrew 4WD')}
          {field('engine', 'Engine', '3.5L EcoBoost')}
          {field('transmission', 'Transmission', '10-speed automatic')}
          {field('mileage', 'Mileage', '48,000')}
          {field('plate', 'Plate', 'ABC-1234')}
          <div className="login-field" style={{ gridColumn: '1 / -1' }}>
            <label>Recommended Service</label>
            <input value={form.recommendation} onChange={e => setForm(f => ({ ...f, recommendation: e.target.value }))} placeholder="e.g. Oil change due at 50k" />
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); setShowAddCustomer(false); setCustSearch(''); setCustVehicles([]); }}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Update Vehicle' : 'Save Vehicle'}</button>
          </div>
        </form>
      )}

      {loading && <p style={{ color: 'var(--muted)', padding: 16 }}>Loading vehicles…</p>}
      {error && <p style={{ color: 'var(--danger)', padding: 16 }}>{error}</p>}
      {!loading && vehicles.length === 0 && <p style={{ color: 'var(--muted)', padding: 16 }}>No vehicles yet. Add your first one above.</p>}

      {/* ══════════════════════════════════════════════════ */}
      {/* GRID VIEW                                         */}
      {/* ══════════════════════════════════════════════════ */}
      {viewMode === 'grid' && vehicles.length > 0 && (
        <>
          <div className="grid cols-3">
            {vehicles.map(v => (
              <article key={v.id} className="card vehicle-card" style={{ overflow: 'hidden', padding: 0 }}>
                {enableVehiclePhotos && (() => {
                  const photos = thumbs[v.id] ?? [];
                  const count = photos.length;
                  return (
                    <div onClick={() => setGalleryVehicle(v)} style={{ height: 160, cursor: 'pointer', position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--line)', display: 'flex', background: '#000' }}>
                      {count === 0 && <div style={{ flex: 1, background: 'var(--surface-soft)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--muted)' }}><span style={{ fontSize: 32 }}>🚗</span><span style={{ fontSize: 12 }}>Add photos</span></div>}
                      {count === 1 && <img src={photos[0]} alt="" style={{ flex: 1, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                      {count === 2 && (<><img src={photos[0]} alt="" style={{ flex: 1, height: '100%', objectFit: 'cover', display: 'block', borderRight: '2px solid #000' }} /><img src={photos[1]} alt="" style={{ flex: 1, height: '100%', objectFit: 'cover', display: 'block' }} /></>)}
                      {count >= 3 && (<>
                        <img src={photos[0]} alt="" style={{ width: '62%', height: '100%', objectFit: 'cover', display: 'block', flexShrink: 0, borderRight: '2px solid #000' }} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {photos.slice(1, 5).map((url, i, arr) => (
                            <div key={i} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                              <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              {i === arr.length - 1 && count > 5 && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>+{count - 4} more</div>}
                            </div>
                          ))}
                        </div>
                      </>)}
                      <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 11, padding: '3px 8px', borderRadius: 6, pointerEvents: 'none' }}>📷 {count > 0 ? `${count} photo${count !== 1 ? 's' : ''}` : 'Photos'}</div>
                    </div>
                  );
                })()}
                <div style={{ padding: 14 }}>
                  <div className="vehicle-title">
                    <div><strong>{v.label}</strong><span className="meta">{v.trim}</span></div>
                    <Badge text={v.status || 'No open jobs'} />
                  </div>
                  <div className="kv" style={{ marginTop: 10 }}>
                    <div><span>VIN</span><strong style={{ fontSize: 11 }}>{v.vin || '—'}</strong></div>
                    <div><span>Mileage</span><strong>{v.mileage || '—'}</strong></div>
                    <div><span>Engine</span><strong>{v.engine || '—'}</strong></div>
                    <div><span>Plate</span><strong>{v.plate || '—'}</strong></div>
                  </div>
                  {v.recommendation && <div className="empty-note" style={{ marginTop: 10 }}>Recommended: {v.recommendation}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button className="btn btn-primary" style={{ flex: 1, fontSize: 13 }} onClick={() => {
                      const owner = customers.find(c => c.id === v.customerId);
                      dispatch({ type: 'OPEN_NEW_JOB_CARD', prefill: { customerName: owner?.name, customerId: v.customerId, vehicle: v.label } });
                    }}>＋ Job Card</button>
                    {enableVehiclePhotos && <button className="btn" style={{ fontSize: 13 }} onClick={() => setGalleryVehicle(v)}>📷 Photos</button>}
                    {enableVehicleEdit && <button className="btn" style={{ fontSize: 13 }} onClick={() => {
                      setEditingId(v.id);
                      setForm({ customerId: v.customerId, vin: v.vin, label: v.label, trim: v.trim, engine: v.engine, transmission: v.transmission, mileage: v.mileage, plate: v.plate, status: v.status || 'Active', recommendation: v.recommendation });
                      setVinError('');
                      setShowForm(true);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}>✏ Edit</button>}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <Panel title="Vehicle Service History" hint="Ownership, job cards, repair orders, diagnostics, and recommendations">
            <table>
              <thead>
                <tr><th>Vehicle</th><th>Transmission</th><th>Status</th><th>Recommendation</th><th>Action</th></tr>
              </thead>
              <tbody>
                {vehicles.map(v => (
                  <tr key={v.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {enableVehiclePhotos && ((thumbs[v.id]?.[0])
                          ? <img src={thumbs[v.id][0]} alt="" style={{ width: 40, height: 32, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)', cursor: 'pointer' }} onClick={() => setGalleryVehicle(v)} />
                          : <div style={{ width: 40, height: 32, borderRadius: 6, background: 'var(--surface-soft)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', fontSize: 16, cursor: 'pointer' }} onClick={() => setGalleryVehicle(v)}>🚗</div>
                        )}
                        <div><strong>{v.label}</strong><div className="meta">{v.plate}</div></div>
                      </div>
                    </td>
                    <td>{v.transmission}</td>
                    <td><Badge text={v.status || 'No open jobs'} /></td>
                    <td>{v.recommendation}</td>
                    <td>
                      <div className="row-actions">
                        {enableVehiclePhotos && <button className="mini-btn" onClick={() => setGalleryVehicle(v)}>📷 Photos</button>}
                        <button className="mini-btn" style={{ color: '#ef4444' }} onClick={() => handleDeleteVehicle(v)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* LIST VIEW                                         */}
      {/* ══════════════════════════════════════════════════ */}
      {viewMode === 'list' && filtered.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
            {filtered.length} vehicle{filtered.length !== 1 ? 's' : ''} {statusFilter !== 'All' ? `· ${statusFilter}` : ''}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--line)', background: 'var(--surface-soft)' }}>
                {['Vehicle', 'Year · Make · Model', 'VIN', 'Plate', 'Fuel', 'Status', 'Assigned Tech', 'Received', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 12px', fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id} onClick={() => setDrawerVehicle(v)} style={{ borderBottom: '1px solid var(--line)', cursor: 'pointer', transition: 'background .1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-soft)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {enableVehiclePhotos && (
                        thumbs[v.id]?.[0]
                          ? <img src={thumbs[v.id][0]} alt="" style={{ width: 36, height: 28, objectFit: 'cover', borderRadius: 5, border: '1px solid var(--line)', cursor: 'pointer', flexShrink: 0 }} onClick={e => { e.stopPropagation(); setGalleryVehicle(v); }} />
                          : <div style={{ width: 36, height: 28, borderRadius: 5, background: 'var(--surface-soft)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', fontSize: 14, cursor: 'pointer', flexShrink: 0 }} onClick={e => { e.stopPropagation(); setGalleryVehicle(v); }}>🚗</div>
                      )}
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{v.label}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: 12 }}>{[v.year, v.make, v.model].filter(Boolean).join(' ') || '—'}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 11 }}>{v.vin || '—'}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{v.plate || '—'}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: 12 }}>{v.fuelType || '—'}</td>
                  <td style={{ padding: '10px 12px' }}><StatusPill status={v.status} /></td>
                  <td style={{ padding: '10px 12px', fontSize: 12 }}>
                    {v.assignedTech
                      ? v.assignedTech.split(';').map(t => t.trim()).filter(Boolean).map(t => {
                          const c = techColor(t);
                          return <span key={t} style={{ display: 'inline-block', background: c.bg, color: c.color, border: `1px solid ${c.border}`, borderRadius: 20, padding: '1px 7px', fontSize: 11, fontWeight: 600, marginRight: 3, marginBottom: 2 }}>{t}</span>;
                        })
                      : <span style={{ color: 'var(--muted)' }}>—</span>
                    }
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {v.dateReceived ? new Date(v.dateReceived).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </td>
                  <td style={{ padding: '10px 12px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {enableVehiclePhotos && <button className="mini-btn" onClick={() => setGalleryVehicle(v)}>📷</button>}
                      <button className="mini-btn" style={{ color: '#ef4444' }} onClick={() => handleDeleteVehicle(v)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {viewMode === 'list' && filtered.length === 0 && !loading && (
        <p style={{ color: 'var(--muted)', padding: 20, textAlign: 'center' }}>No vehicles match your filters.</p>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* KANBAN VIEW                                        */}
      {/* ══════════════════════════════════════════════════ */}
      {viewMode === 'kanban' && (
        <div style={{ overflowX: 'auto', paddingBottom: 12 }}>
          <div style={{ display: 'flex', gap: 14, minWidth: 'max-content', alignItems: 'flex-start' }}>
            {KANBAN_COLUMNS.map(col => {
              const colVehicles = vehicles.filter(v => v.status === col.status || col.extraStatuses.includes(v.status));
              const isDropTarget = kanbanDragOver === col.status;
              return (
                <div
                  key={col.status}
                  onDragOver={e => { e.preventDefault(); setKanbanDragOver(col.status); }}
                  onDragLeave={() => setKanbanDragOver(null)}
                  onDrop={e => {
                    e.preventDefault();
                    if (kanbanDragId) handleKanbanMove(kanbanDragId, col.status);
                    setKanbanDragId(null); setKanbanDragOver(null);
                  }}
                  style={{
                    width: 240, minHeight: 200, borderRadius: 12, overflow: 'hidden',
                    border: isDropTarget ? `2px solid ${col.color}` : `2px solid ${col.border}`,
                    background: isDropTarget ? col.bg : 'var(--surface)',
                    transition: 'border-color .15s, background .15s',
                    boxShadow: isDropTarget ? `0 0 0 3px ${col.border}` : 'none',
                    flexShrink: 0,
                  }}
                >
                  {/* Column header */}
                  <div style={{ background: col.headerBg, borderBottom: `1px solid ${col.border}`, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{col.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 12, color: col.color, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 }}>{col.label}</div>
                    </div>
                    <span style={{ background: col.color, color: '#fff', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{colVehicles.length}</span>
                  </div>

                  {/* Cards */}
                  <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {colVehicles.length === 0 && (
                      <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                        {isDropTarget ? '📥 Drop here' : 'No vehicles'}
                      </div>
                    )}
                    {colVehicles.map(v => {
                      const owner = customers.find(c => c.id === v.customerId);
                      const thumb = thumbs[v.id]?.[0];
                      return (
                        <div
                          key={v.id}
                          draggable
                          onDragStart={() => setKanbanDragId(v.id)}
                          onDragEnd={() => { setKanbanDragId(null); setKanbanDragOver(null); }}
                          style={{
                            background: kanbanDragId === v.id ? 'rgba(0,0,0,0.04)' : 'var(--surface)',
                            border: `1px solid ${col.border}`,
                            borderRadius: 10, overflow: 'hidden', cursor: 'grab',
                            opacity: kanbanDragId === v.id ? 0.4 : 1,
                            transition: 'opacity .15s, box-shadow .15s',
                            boxShadow: kanbanDragId !== v.id ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                          }}
                        >
                          {/* Thumbnail */}
                          {enableVehiclePhotos && (
                            <div
                              onClick={() => setGalleryVehicle(v)}
                              style={{ height: 80, background: thumb ? '#000' : col.bg, cursor: 'pointer', overflow: 'hidden', borderBottom: `1px solid ${col.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
                            >
                              {thumb
                                ? <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : <span style={{ fontSize: 26, opacity: 0.4 }}>🚗</span>
                              }
                              <div style={{ position: 'absolute', bottom: 4, right: 6, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 5 }}>📷</div>
                            </div>
                          )}

                          {/* Card body */}
                          <div style={{ padding: '8px 10px' }}>
                            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2, lineHeight: 1.3 }}>{v.label}</div>
                            {owner && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>👤 {owner.name}</div>}
                            {v.plate && <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>🔢 {v.plate}</div>}
                            {v.assignedTech && (
                              <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                {v.assignedTech.split(';').map(t => t.trim()).filter(Boolean).map(t => {
                                  const c = techColor(t);
                                  return <span key={t} style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, borderRadius: 20, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>{t}</span>;
                                })}
                              </div>
                            )}

                            {/* Linked feature actions */}
                            <div style={{ marginTop: 8, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                              <button
                                onClick={() => setDrawerVehicle(v)}
                                style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: `1px solid ${col.border}`, background: col.bg, color: col.color, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                Open →
                              </button>
                              <button
                                onClick={() => {
                                  dispatch({ type: 'OPEN_NEW_JOB_CARD', prefill: { customerName: owner?.name, customerId: v.customerId, vehicle: v.label } });
                                }}
                                style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--accent,#cc0000)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                + Job
                              </button>
                            </div>

                            {/* Move to column dropdown */}
                            <select
                              value=""
                              onChange={e => { if (e.target.value) handleKanbanMove(v.id, e.target.value); }}
                              onClick={e => e.stopPropagation()}
                              style={{ marginTop: 6, width: '100%', padding: '4px 6px', borderRadius: 6, border: `1px solid ${col.border}`, background: 'var(--surface-soft)', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}
                            >
                              <option value="">Move to…</option>
                              {KANBAN_COLUMNS.filter(c => c.status !== col.status).map(c => (
                                <option key={c.status} value={c.status}>{c.icon} {c.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}

                    {/* Drop hint when dragging */}
                    {kanbanDragId && kanbanDragOver !== col.status && (
                      <div style={{ border: `2px dashed ${col.border}`, borderRadius: 8, padding: '14px 0', textAlign: 'center', fontSize: 11, color: col.color, opacity: 0.6 }}>
                        Drop here to move
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>Drag cards between columns to change status · or use the "Move to…" dropdown on each card</p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* SERVICE RECORDS VIEW                              */}
      {/* ══════════════════════════════════════════════════ */}
      {viewMode === 'service' && (
        <>
          {/* Summary bar */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            {(['In Progress', 'Pending', 'Pending Approval', 'Pending Parts', 'Active', 'Completed', 'Returned Job', 'No open jobs', 'Archived'] as StatusFilter[]).filter(s => counts[s]).map(s => {
              const c = statusColor(s);
              return (
                <div key={s} onClick={() => { setStatusFilter(s); setViewMode('list'); }} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: '10px 18px', minWidth: 110, cursor: 'pointer', transition: 'opacity .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >
                  <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{counts[s] ?? 0}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: c.color, opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s}</div>
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && !loading && (
            <p style={{ color: 'var(--muted)', padding: 20, textAlign: 'center' }}>No records match your filters.</p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {filtered.map(v => (
              <ServiceRecordCard
                key={v.id}
                v={v}
                thumbUrl={thumbs[v.id]?.[0]}
                onPhotos={() => setGalleryVehicle(v)}
                enablePhotos={enableVehiclePhotos}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
