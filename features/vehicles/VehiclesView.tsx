'use client';

import { useEffect, useRef, useState } from 'react';
import { Panel } from '@/components/Panel';
import { Badge } from '@/components/Badge';
import { fetchVehicles, saveVehicle, updateVehicle, fetchCustomerNames } from '@/services/vehicleService';
import { fetchVehicleImages, uploadVehicleImage, deleteVehicleImage, type VehicleImage } from '@/services/vehicleImageService';
import type { Vehicle } from '@/lib/types';
import { useAppDispatch } from '@/lib/store';
import { fetchShopSettings } from '@/services/shopSettingsService';

type VehicleWithId = Vehicle & { id: string };

const EMPTY_FORM = {
  customerId: '', vin: '', label: '', trim: '',
  engine: '', transmission: '', mileage: '', plate: '', status: 'Active', recommendation: '',
};

// ── Image Gallery Modal ──────────────────────────────────────────
function ImageGallery({ vehicle, onClose }: { vehicle: VehicleWithId; onClose: () => void }) {
  const [images, setImages] = useState<VehicleImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [camMode, setCamMode] = useState<'off' | 'webcam'>('off');
  const [camReady, setCamReady] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    fetchVehicleImages(vehicle.id)
      .then(setImages)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
    return () => stopStream();
  }, [vehicle.id]);

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
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCamReady(true);
      }
    } catch {
      setError('Camera access denied. Check browser permissions.');
      setCamMode('off');
    }
  }

  async function captureWebcam() {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    canvas.toBlob(async blob => {
      if (!blob) return;
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
      stopStream();
      setUploading(true);
      try {
        const img = await uploadVehicleImage(vehicle.id, file, 'Camera capture');
        setImages(prev => [...prev, img]);
      } catch (err: unknown) {
        setError('Upload failed: ' + (err instanceof Error ? err.message : ''));
      } finally { setUploading(false); }
    }, 'image/jpeg', 0.92);
  }

  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(files.map(f => uploadVehicleImage(vehicle.id, f)));
      setImages(prev => [...prev, ...uploaded]);
    } catch (err: unknown) {
      setError('Upload failed: ' + (err instanceof Error ? err.message : ''));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
      if (cameraRef.current) cameraRef.current.value = '';
    }
  }

  async function handleDelete(img: VehicleImage) {
    if (!confirm('Remove this photo?')) return;
    try {
      await deleteVehicleImage(img.id, img.url);
      setImages(prev => prev.filter(i => i.id !== img.id));
    } catch (err: unknown) {
      setError('Delete failed: ' + (err instanceof Error ? err.message : ''));
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 780, maxHeight: '92vh', overflow: 'auto', padding: 28 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>{vehicle.label}</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>{vehicle.plate} · {vehicle.vin}</p>
          </div>
          <button onClick={() => { stopStream(); onClose(); }} style={{ background: 'var(--surface-soft)', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {error && <p style={{ color: 'var(--danger)', marginBottom: 12, padding: '8px 12px', background: '#fff0f0', borderRadius: 6 }}>{error}</p>}

        {/* ── Webcam view ── */}
        {camMode === 'webcam' && (
          <div style={{ marginBottom: 20, borderRadius: 10, overflow: 'hidden', border: '2px solid var(--accent)', background: '#000' }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', maxHeight: 340, display: 'block', objectFit: 'cover' }} />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <div style={{ display: 'flex', gap: 10, padding: 12, background: 'var(--surface-soft)', justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={captureWebcam} disabled={!camReady || uploading} style={{ fontSize: 15 }}>
                📸 {uploading ? 'Saving…' : 'Capture Photo'}
              </button>
              <button className="btn" onClick={stopStream}>Cancel</button>
            </div>
          </div>
        )}

        {/* ── Upload buttons ── */}
        {camMode === 'off' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
            {/* Upload from file */}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{ padding: '16px 10px', borderRadius: 10, border: '2px dashed var(--line)', background: 'var(--surface-soft)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
            >
              <span style={{ fontSize: 26 }}>🖼️</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{uploading ? 'Uploading…' : 'Upload Files'}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>JPG, PNG, HEIC</span>
            </button>

            {/* Phone / tablet camera */}
            <button
              onClick={() => cameraRef.current?.click()}
              disabled={uploading}
              style={{ padding: '16px 10px', borderRadius: 10, border: '2px dashed var(--line)', background: 'var(--surface-soft)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
            >
              <span style={{ fontSize: 26 }}>📱</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Phone Camera</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Opens device camera</span>
            </button>

            {/* Webcam */}
            <button
              onClick={startWebcam}
              disabled={uploading}
              style={{ padding: '16px 10px', borderRadius: 10, border: '2px dashed var(--line)', background: 'var(--surface-soft)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
            >
              <span style={{ fontSize: 26 }}>📷</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Webcam</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Use connected camera</span>
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
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
              } else if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
                files = Array.from(e.dataTransfer.items)
                  .filter(i => i.kind === 'file' && i.type.startsWith('image/'))
                  .map(i => i.getAsFile())
                  .filter((f): f is File => f !== null);
              }
              if (files.length === 0) {
                setError('No image files detected. Drag image files from File Explorer, not from a browser tab.');
                return;
              }
              uploadFiles(files);
            }}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? 'var(--accent,#cc0000)' : 'var(--line)'}`,
              borderRadius: 10,
              padding: '28px 18px',
              textAlign: 'center',
              marginBottom: 20,
              background: dragOver ? 'rgba(204,0,0,0.06)' : 'var(--surface-soft)',
              color: dragOver ? 'var(--accent,#cc0000)' : 'var(--muted)',
              fontSize: 13,
              cursor: 'pointer',
              transition: 'border-color .15s, background .15s, color .15s',
              minHeight: 80,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <span style={{ fontSize: 28 }}>{dragOver ? '📸' : '🖼️'}</span>
            <span style={{ fontWeight: 600 }}>{dragOver ? 'Release to upload' : 'Drop photos here or click to browse'}</span>
            <span style={{ fontSize: 11 }}>JPG, PNG, HEIC — multiple files at once</span>
          </div>
        )}

        {/* Hidden inputs */}
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => uploadFiles(Array.from(e.target.files ?? []))} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => uploadFiles(Array.from(e.target.files ?? []))} />

        {/* Thumbnails */}
        {loading && <p style={{ color: 'var(--muted)' }}>Loading photos…</p>}
        {!loading && images.length === 0 && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>No photos yet. Use the options above to add some.</p>}
        {images.length > 0 && (
          <>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>{images.length} photo{images.length !== 1 ? 's' : ''}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
              {images.map(img => (
                <div key={img.id} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)', background: '#000', aspectRatio: '4/3' }}>
                  <img src={img.url} alt={img.label} style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in', display: 'block' }} onClick={() => setLightbox(img.url)} />
                  <button onClick={() => handleDelete(img)} style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.65)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', padding: '3px 7px', fontSize: 12 }}>✕</button>
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 11, padding: '4px 8px' }}>{img.label}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          <img src={lightbox} alt="Full size" style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}

// ── Main View ───────────────────────────────────────────────────
export function VehiclesView() {
  const dispatch = useAppDispatch();
  const [vehicles, setVehicles] = useState<VehicleWithId[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [vinError, setVinError] = useState('');
  const [toast, setToast] = useState('');
  const [galleryVehicle, setGalleryVehicle] = useState<VehicleWithId | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string[]>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [enableVehiclePhotos, setEnableVehiclePhotos] = useState(true);
  const [enableVehicleEdit, setEnableVehicleEdit] = useState(true);

  useEffect(() => {
    fetchShopSettings().then(s => {
      setEnableVehiclePhotos(s.enableVehiclePhotos ?? true);
      setEnableVehicleEdit(s.enableVehicleEdit ?? true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([fetchVehicles(), fetchCustomerNames()])
      .then(([v, c]) => {
        setVehicles(v);
        setCustomers(c);
        // Load up to 5 thumbnails per vehicle
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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    // VIN validation — must be exactly 17 alphanumeric characters if provided
    if (form.vin.trim()) {
      const vin = form.vin.trim().toUpperCase();
      if (vin.length !== 17) {
        setVinError(`VIN must be exactly 17 characters (you entered ${vin.length}).`);
        setSaving(false);
        return;
      }
      if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) {
        setVinError('VIN can only contain letters and numbers (I, O, Q are not valid VIN characters).');
        setSaving(false);
        return;
      }
    }
    setVinError('');
    setSaving(true);
    try {
      if (editingId) {
        const updated = await updateVehicle(editingId, form);
        setVehicles(prev => prev.map(v => v.id === editingId ? updated : v));
        notify(`${updated.label} updated.`);
      } else {
        const newVehicle = await saveVehicle(form);
        setVehicles(prev => [newVehicle, ...prev]);
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

  return (
    <>
      {toast && <div className="toast toast-visible">{toast}</div>}
      {galleryVehicle && <ImageGallery vehicle={galleryVehicle} onClose={() => setGalleryVehicle(null)} />}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => { setShowForm(v => !v); setVinError(''); setForm(EMPTY_FORM); setEditingId(null); }}>
          {showForm ? 'Cancel' : '+ Add Vehicle'}
        </button>
      </div>

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
              <span style={{ fontSize: 11, fontWeight: 600, color: form.vin.length === 17 ? '#22c55e' : form.vin.length > 0 ? '#f59e0b' : 'var(--muted)' }}>
                {form.vin.length}/17
              </span>
            </label>
            <input
              value={form.vin}
              onChange={e => {
                const v = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 17);
                setForm(f => ({ ...f, vin: v }));
                if (vinError) setVinError('');
              }}
              placeholder="1FTFW1E85PFA24680"
              maxLength={17}
              style={{ borderColor: vinError ? '#ef4444' : form.vin.length === 17 ? '#22c55e' : undefined, fontFamily: 'monospace', letterSpacing: '0.08em' }}
            />
            {vinError && <div style={{ marginTop: 4, fontSize: 12, color: '#ef4444', fontWeight: 600 }}>⚠ {vinError}</div>}
            {!vinError && form.vin.length > 0 && form.vin.length < 17 && (
              <div style={{ marginTop: 4, fontSize: 11, color: '#f59e0b' }}>{17 - form.vin.length} more character{17 - form.vin.length !== 1 ? 's' : ''} needed</div>
            )}
            {!vinError && form.vin.length === 17 && (
              <div style={{ marginTop: 4, fontSize: 11, color: '#22c55e', fontWeight: 600 }}>✓ Valid length</div>
            )}
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

      {vehicles.length > 0 && (
        <>
          <div className="grid cols-3">
            {vehicles.map(v => (
              <article key={v.id} className="card vehicle-card" style={{ overflow: 'hidden', padding: 0 }}>
                {/* Photo strip — up to 5 photos in a grid */}
                {enableVehiclePhotos && (() => {
                  const photos = thumbs[v.id] ?? [];
                  const count = photos.length;
                  return (
                    <div
                      onClick={() => setGalleryVehicle(v)}
                      style={{ height: 160, cursor: 'pointer', position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--line)', display: 'flex', background: '#000' }}
                    >
                      {count === 0 && (
                        <div style={{ flex: 1, background: 'var(--surface-soft)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--muted)' }}>
                          <span style={{ fontSize: 32 }}>🚗</span>
                          <span style={{ fontSize: 12 }}>Add photos</span>
                        </div>
                      )}

                      {count === 1 && (
                        <img src={photos[0]} alt="Vehicle photo" style={{ flex: 1, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      )}

                      {count === 2 && (<>
                        <img src={photos[0]} alt="Vehicle photo" style={{ flex: 1, height: '100%', objectFit: 'cover', display: 'block', borderRight: '2px solid #000' }} />
                        <img src={photos[1]} alt="Vehicle photo" style={{ flex: 1, height: '100%', objectFit: 'cover', display: 'block' }} />
                      </>)}

                      {count >= 3 && (
                        <>
                          {/* Main hero — left 62% */}
                          <img src={photos[0]} alt="Vehicle photo" style={{ width: '62%', height: '100%', objectFit: 'cover', display: 'block', flexShrink: 0, borderRight: '2px solid #000' }} />
                          {/* Right column — up to 4 stacked */}
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {photos.slice(1, 5).map((url, i, arr) => (
                              <div key={i} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                                <img src={url} alt="Vehicle photo" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                {/* "+N more" overlay on last visible slot if there are more than 5 */}
                                {i === arr.length - 1 && count > 5 && (
                                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>
                                    +{count - 4} more
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {/* Photo count badge */}
                      <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 11, padding: '3px 8px', borderRadius: 6, pointerEvents: 'none' }}>
                        📷 {count > 0 ? `${count} photo${count !== 1 ? 's' : ''}` : 'Photos'}
                      </div>
                    </div>
                  );
                })() }

                {/* Card body */}
                <div style={{ padding: 14 }}>
                  <div className="vehicle-title">
                    <div>
                      <strong>{v.label}</strong>
                      <span className="meta">{v.trim}</span>
                    </div>
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
                <tr><th>Vehicle</th><th>Transmission</th><th>Status</th><th>Recommendation</th>{enableVehiclePhotos && <th>Photos</th>}</tr>
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
                    {enableVehiclePhotos && <td><button className="mini-btn" onClick={() => setGalleryVehicle(v)}>📷 Photos</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}
    </>
  );
}
