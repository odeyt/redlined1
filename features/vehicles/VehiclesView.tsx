'use client';

import { useEffect, useRef, useState } from 'react';
import { Panel } from '@/components/Panel';
import { Badge } from '@/components/Badge';
import { fetchVehicles, saveVehicle, updateVehicle, deleteVehicle, fetchCustomerNames } from '@/services/vehicleService';
import type { VehicleRecord } from '@/services/vehicleService';
import { fetchVehicleImages, uploadVehicleImage, deleteVehicleImage, type VehicleImage } from '@/services/vehicleImageService';
import type { Vehicle } from '@/lib/types';
import { useAppDispatch } from '@/lib/store';
import { fetchShopSettings } from '@/services/shopSettingsService';

type VehicleWithId = Vehicle & { id: string };
type ViewMode = 'grid' | 'list' | 'service';
type StatusFilter = 'All' | 'In Progress' | 'Completed' | 'Pending';

const EMPTY_FORM = {
  customerId: '', vin: '', label: '', trim: '',
  engine: '', transmission: '', mileage: '', plate: '', status: 'Active', recommendation: '',
};

function statusColor(status: string) {
  if (status === 'Completed') return { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' };
  if (status === 'In Progress') return { bg: '#dbeafe', color: '#1e40af', border: '#bfdbfe' };
  if (status === 'Pending') return { bg: '#fef9c3', color: '#854d0e', border: '#fef08a' };
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
function ImageGallery({ vehicle, onClose }: { vehicle: VehicleWithId; onClose: () => void }) {
  const [images, setImages] = useState<VehicleImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [camMode, setCamMode] = useState<'off' | 'webcam'>('off');
  const [camReady, setCamReady] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const thumbStripRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    fetchVehicleImages(vehicle.id)
      .then(imgs => { setImages(imgs); setActiveIdx(0); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
    return () => stopStream();
  }, [vehicle.id]);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); prev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      if (e.key === 'Escape')     { stopStream(); onClose(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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

              {/* Thumbnail strip */}
              <div
                ref={thumbStripRef}
                style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginTop: 10, scrollbarWidth: 'thin' }}
              >
                {images.map((img, i) => (
                  <div
                    key={img.id}
                    onClick={() => setActiveIdx(i)}
                    style={{ flexShrink: 0, width: 72, height: 54, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', border: i === activeIdx ? '2px solid var(--accent,#cc0000)' : '2px solid transparent', opacity: i === activeIdx ? 1 : 0.6, transition: 'opacity .15s, border-color .15s', background: '#000' }}
                  >
                    <img src={img.url} alt={img.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload buttons */}
          {camMode === 'off' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
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
                let files: File[] = [];
                if (e.dataTransfer.files?.length) files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                else if (e.dataTransfer.items?.length) files = Array.from(e.dataTransfer.items).filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile()).filter((f): f is File => f !== null);
                if (!files.length) { setError('No image files detected.'); return; }
                uploadFiles(files);
              }}
              onClick={() => fileRef.current?.click()}
              style={{ border: `2px dashed ${dragOver ? 'var(--accent,#cc0000)' : 'var(--line)'}`, borderRadius: 10, padding: '20px 16px', textAlign: 'center', background: dragOver ? 'rgba(204,0,0,0.06)' : 'var(--surface-soft)', color: dragOver ? 'var(--accent,#cc0000)' : 'var(--muted)', fontSize: 13, cursor: 'pointer', transition: 'all .15s', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5 }}
            >
              <span style={{ fontSize: 24 }}>{dragOver ? '📸' : '🖼️'}</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{dragOver ? 'Release to upload' : 'Drop photos here or click to browse'}</span>
              <span style={{ fontSize: 11 }}>JPG, PNG, HEIC — multiple files at once</span>
            </div>
          )}

          {loading && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>Loading photos…</p>}
          {!loading && images.length === 0 && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 10 }}>No photos yet. Use the options above to add some.</p>}
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => uploadFiles(Array.from(e.target.files ?? []))} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => uploadFiles(Array.from(e.target.files ?? []))} />
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
            {techList.map(t => (
              <span key={t} style={{ background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 600 }}>{t}</span>
            ))}
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

// ── Main View ───────────────────────────────────────────────────
export function VehiclesView() {
  const dispatch = useAppDispatch();
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [vinError, setVinError] = useState('');
  const [toast, setToast] = useState('');
  const [galleryVehicle, setGalleryVehicle] = useState<VehicleRecord | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string[]>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [enableVehiclePhotos, setEnableVehiclePhotos] = useState(true);
  const [enableVehicleEdit, setEnableVehicleEdit] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchShopSettings().then(s => {
      setEnableVehiclePhotos(s.enableVehiclePhotos ?? true);
      setEnableVehicleEdit(s.enableVehicleEdit ?? true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([fetchVehicles(), fetchCustomerNames()])
      .then(([v, c]) => {
        setVehicles(v as VehicleRecord[]);
        setCustomers(c);
        v.forEach(vehicle => {
          fetchVehicleImages(vehicle.id).then(imgs => {
            const urls = imgs.slice(0, 5).map(i => i.url);
            if (urls.length > 0) setThumbs(prev => ({ ...prev, [vehicle.id]: urls }));
          }).catch(() => {});
        });
      })
      .catch(err => setError('Load error: ' + (err?.message || '')))
      .finally(() => setLoading(false));
  }, []);

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  async function handleDeleteVehicle(v: VehicleRecord) {
    if (!confirm(`Delete ${v.label}? This cannot be undone.`)) return;
    try {
      await deleteVehicle(v.id);
      setVehicles(prev => prev.filter(x => x.id !== v.id));
      notify(`${v.label} deleted.`);
    } catch (err) { setError('Delete failed: ' + (err instanceof Error ? err.message : '')); }
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
  const STATUS_FILTERS: StatusFilter[] = ['All', 'In Progress', 'Completed', 'Pending'];
  const filtered = vehicles.filter(v => {
    const matchStatus = statusFilter === 'All' || v.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch = !q || [v.label, v.make, v.model, v.vin, v.plate, v.assignedTech, v.issues].some(f => f?.toLowerCase().includes(q));
    return matchStatus && matchSearch;
  });

  // Status counts for filter chips
  const counts: Record<string, number> = { All: vehicles.length };
  vehicles.forEach(v => { counts[v.status] = (counts[v.status] ?? 0) + 1; });

  return (
    <>
      {toast && <div className="toast toast-visible">{toast}</div>}
      {galleryVehicle && <ImageGallery vehicle={galleryVehicle} onClose={() => setGalleryVehicle(null)} />}

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        {/* View toggle */}
        <div style={{ display: 'flex', gap: 6 }}>
          <ViewBtn mode="grid"    current={viewMode} icon="⊞" label="Grid"           onClick={() => setViewMode('grid')} />
          <ViewBtn mode="list"    current={viewMode} icon="☰" label="List"           onClick={() => setViewMode('list')} />
          <ViewBtn mode="service" current={viewMode} icon="📋" label="Service Records" onClick={() => setViewMode('service')} />
        </div>
        <button className="btn btn-primary" onClick={() => { setShowForm(v => !v); setVinError(''); setForm(EMPTY_FORM); setEditingId(null); }}>
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
          <div className="login-field" style={{ gridColumn: '1 / -1' }}>
            <label>Customer *</label>
            <select required value={form.customerId} onChange={e => setForm(f => ({ ...f, customerId: e.target.value }))}
              style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface-soft)', color: 'var(--text)' }}>
              <option value="">Select customer…</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
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
            <button type="button" className="btn" onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); }}>Cancel</button>
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
                <tr key={v.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {enableVehiclePhotos && (
                        thumbs[v.id]?.[0]
                          ? <img src={thumbs[v.id][0]} alt="" style={{ width: 36, height: 28, objectFit: 'cover', borderRadius: 5, border: '1px solid var(--line)', cursor: 'pointer', flexShrink: 0 }} onClick={() => setGalleryVehicle(v)} />
                          : <div style={{ width: 36, height: 28, borderRadius: 5, background: 'var(--surface-soft)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', fontSize: 14, cursor: 'pointer', flexShrink: 0 }} onClick={() => setGalleryVehicle(v)}>🚗</div>
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
                      ? v.assignedTech.split(';').map(t => t.trim()).filter(Boolean).map(t => (
                        <span key={t} style={{ display: 'inline-block', background: 'var(--surface-soft)', border: '1px solid var(--line)', borderRadius: 20, padding: '1px 7px', fontSize: 11, marginRight: 3, marginBottom: 2 }}>{t}</span>
                      ))
                      : <span style={{ color: 'var(--muted)' }}>—</span>
                    }
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {v.dateReceived ? new Date(v.dateReceived).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
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
      {/* SERVICE RECORDS VIEW                              */}
      {/* ══════════════════════════════════════════════════ */}
      {viewMode === 'service' && (
        <>
          {/* Summary bar */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            {(['In Progress', 'Pending', 'Completed'] as StatusFilter[]).map(s => {
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
