import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatApiError } from '@/lib/api';
import { uploadToCloudinary, cloudinaryThumb } from '@/lib/cloudinary';
import { useAuth } from '@/contexts/AuthContext';

const MATERIALS = [
  'Hout', 'Metaal', 'Plastic', 'Steen', 'Textiel',
  'Electro', 'Vloeistof', 'Papier', 'Isolatie', 'Ander',
];

const STEPS = [
  'Foto\'s', 'Titel', 'Beschrijving', 'Gewicht',
  'Materiaal', 'Deadline', 'Afmetingen', 'Transport', 'Bevestigen',
];

export default function ListingWizard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user && user.role === 'admin';
  const isDonnateur = user && user.role === 'donnateur';
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [data, setData] = useState({
    photos: [], title: '', description: '', weight: '',
    material: 'Hout', deadline: '', isRecurrent: false,
    dimensions: '', transport: '', placeInWarehouse: false,
  });

  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');

  const onFilesPicked = async (e) => {
    setUploadErr('');
    const files = Array.from(e.target.files || []);
    const room = 5 - data.photos.length;
    const toUpload = files.slice(0, room);
    if (files.length > room) {
      setUploadErr(`Maximaal 5 foto's per aanbieding. ${files.length - room} foto('s) overgeslagen.`);
    }
    setUploading(true);
    try {
      const urls = [];
      for (const f of toUpload) {
        const url = await uploadToCloudinary(f);
        urls.push(url);
      }
      setData((d) => ({ ...d, photos: [...d.photos, ...urls] }));
    } catch (err) {
      setUploadErr(err.message || 'Upload mislukt');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removePhoto = (idx) => {
    setData((d) => ({ ...d, photos: d.photos.filter((_, i) => i !== idx) }));
  };

  const next = () => setStep((s) => Math.min(STEPS.length, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  const canNext = () => {
    switch (step) {
      case 1: return data.photos.length >= 1;
      case 2: return data.title.trim().length > 0 && data.title.length <= 35;
      case 3: return data.description.trim().length > 0 && data.description.length <= 400;
      case 4: return parseFloat(data.weight) > 0;
      case 5: return MATERIALS.includes(data.material);
      case 6: return data.isRecurrent || !!data.deadline;
      default: return true;
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        title: data.title.trim(),
        description: data.description.trim(),
        weight: parseFloat(data.weight),
        material: data.material,
        photos: data.photos,
        deadline: data.isRecurrent ? null : data.deadline,
        isRecurrent: data.isRecurrent,
        dimensions: data.dimensions || null,
        transport: data.transport || null,
        placeInWarehouse: isAdmin ? data.placeInWarehouse : false,
      };
      const { data: created } = await api.post('/listings', payload);
      navigate(`/aanbieding/${created.id}`);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-16" data-testid="wizard-page">
      <p className="overline mb-3">Nieuwe aanbieding</p>
      <h1 className="text-4xl font-bold tracking-tight mb-2">{STEPS[step - 1]}</h1>

      {/* Progress */}
      <div className="flex items-center gap-2 my-8" data-testid="wizard-progress">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-px flex-1 transition-all ${i + 1 <= step ? 'bg-foreground h-0.5' : 'bg-border'}`}
          />
        ))}
        <span className="overline ml-3">{step}/{STEPS.length}</span>
      </div>

      {/* STEP 1: Photos */}
      {step === 1 && (
        <section className="space-y-6" data-testid="wizard-step-photos">
          <p className="text-foreground/75">
            Voeg tot 5 foto's toe. Grote foto's worden automatisch verkleind vóór upload.
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {data.photos.map((url, i) => (
              <div key={i} className="aspect-square relative bg-muted overflow-hidden group">
                <img src={cloudinaryThumb(url, 400, 400)} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => removePhoto(i)}
                  className="absolute top-1 right-1 bg-background/90 px-2 py-0.5 text-xs opacity-0 group-hover:opacity-100 transition"
                  data-testid={`wizard-remove-photo-${i}`}
                >
                  Verwijder
                </button>
              </div>
            ))}
            {data.photos.length < 5 && (
              <label className="aspect-square border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-foreground transition-colors text-center text-xs text-muted-foreground p-2">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={onFilesPicked}
                  className="hidden"
                  data-testid="wizard-photo-input"
                />
                {uploading ? 'Uploaden…' : '+ Foto toevoegen'}
              </label>
            )}
          </div>
          {uploadErr && <p className="text-sm text-destructive" data-testid="wizard-upload-error">{uploadErr}</p>}
        </section>
      )}

      {/* STEP 2: Title */}
      {step === 2 && (
        <section className="space-y-3" data-testid="wizard-step-title">
          <label className="label-overline">Titel (max 35 tekens)</label>
          <input
            className="input-flat text-lg"
            data-testid="wizard-title-input"
            value={data.title}
            maxLength={35}
            onChange={(e) => setData({ ...data, title: e.target.value })}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">{data.title.length} / 35</p>
        </section>
      )}

      {/* STEP 3: Description */}
      {step === 3 && (
        <section className="space-y-3" data-testid="wizard-step-description">
          <label className="label-overline">Beschrijving (max 400 tekens)</label>
          <textarea
            rows={6}
            className="input-flat"
            data-testid="wizard-description-input"
            value={data.description}
            maxLength={400}
            onChange={(e) => setData({ ...data, description: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">{data.description.length} / 400</p>
        </section>
      )}

      {/* STEP 4: Weight */}
      {step === 4 && (
        <section className="space-y-3" data-testid="wizard-step-weight">
          <label className="label-overline">Gewicht in kilogram</label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            className="input-flat text-lg"
            data-testid="wizard-weight-input"
            value={data.weight}
            onChange={(e) => setData({ ...data, weight: e.target.value })}
            autoFocus
          />
        </section>
      )}

      {/* STEP 5: Material */}
      {step === 5 && (
        <section className="space-y-3" data-testid="wizard-step-material">
          <label className="label-overline">Hoofdmateriaal</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {MATERIALS.map((m) => (
              <button
                key={m}
                onClick={() => setData({ ...data, material: m })}
                data-testid={`wizard-material-${m}`}
                className={`px-4 py-3 border transition-all text-sm ${
                  data.material === m
                    ? 'bg-foreground text-background border-foreground'
                    : 'border-border bg-surface hover:border-foreground'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* STEP 6: Deadline */}
      {step === 6 && (
        <section className="space-y-4" data-testid="wizard-step-deadline">
          {!isDonnateur && (
            <label className="flex items-center gap-3 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={data.isRecurrent}
                onChange={(e) => setData({ ...data, isRecurrent: e.target.checked, deadline: e.target.checked ? '' : data.deadline })}
                data-testid="wizard-recurrent-toggle"
              />
              <span className="text-sm">Dit is een terugkerende aanbieding (geen deadline)</span>
            </label>
          )}
          {!data.isRecurrent && (
            <div>
              <label className="label-overline">Deadline</label>
              <input
                type="date"
                className="input-flat"
                data-testid="wizard-deadline-input"
                value={data.deadline}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setData({ ...data, deadline: e.target.value })}
              />
              {isDonnateur && (
                <p className="text-xs text-muted-foreground mt-2" data-testid="wizard-donnateur-recurrent-hint">
                  Recurrente aanbiedingen zijn voorbehouden aan In Limbo-partners.
                </p>
              )}
            </div>
          )}
          {data.isRecurrent && !isDonnateur && (
            <p className="text-sm text-foreground/75 leading-relaxed border-l-2 border-border pl-4">
              Bij recurrente aanbiedingen wordt jouw e-mailadres zichtbaar voor andere
              gevalideerde gebruikers op de detailpagina, zodat ze rechtstreeks contact
              kunnen opnemen.
            </p>
          )}

          {isAdmin && (
            <div className="mt-6 border-t border-border pt-4" data-testid="wizard-admin-magazijn-block">
              <p className="overline mb-2">Admin-optie</p>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.placeInWarehouse}
                  onChange={(e) => setData({ ...data, placeInWarehouse: e.target.checked })}
                  data-testid="wizard-place-in-warehouse-toggle"
                />
                <span className="text-sm">Plaats direct in magazijn (status: In magazijn)</span>
              </label>
              <p className="text-xs text-muted-foreground mt-2">
                Aanbieding wordt onmiddellijk gemarkeerd als <em>In magazijn</em> in plaats van <em>Beschikbaar</em>.
              </p>
            </div>
          )}
        </section>
      )}

      {/* STEP 7: Dimensions */}
      {step === 7 && (
        <section className="space-y-3" data-testid="wizard-step-dimensions">
          <label className="label-overline">Afmetingen <span className="text-muted-foreground normal-case">(optioneel)</span></label>
          <input
            className="input-flat"
            data-testid="wizard-dimensions-input"
            placeholder="bv. 240 x 80 x 4 cm"
            value={data.dimensions}
            onChange={(e) => setData({ ...data, dimensions: e.target.value })}
          />
        </section>
      )}

      {/* STEP 8: Transport */}
      {step === 8 && (
        <section className="space-y-3" data-testid="wizard-step-transport">
          <label className="label-overline">Transport <span className="text-muted-foreground normal-case">(optioneel)</span></label>
          <textarea
            rows={3}
            className="input-flat"
            data-testid="wizard-transport-input"
            placeholder="bv. Op te halen in Molenbeek met bestelwagen"
            value={data.transport}
            onChange={(e) => setData({ ...data, transport: e.target.value })}
          />
        </section>
      )}

      {/* STEP 9: Confirm */}
      {step === 9 && (
        <section className="space-y-4" data-testid="wizard-step-confirm">
          <h2 className="text-2xl font-semibold mb-4">Samenvatting</h2>
          <dl className="border-t border-border divide-y divide-border" data-testid="wizard-summary">
            <Row label="Foto's" value={`${data.photos.length} foto(s)`} />
            <Row label="Titel" value={data.title} />
            <Row label="Beschrijving" value={data.description} />
            <Row label="Gewicht" value={`${data.weight} kg`} />
            <Row label="Materiaal" value={data.material} />
            <Row label="Deadline" value={data.isRecurrent ? 'Recurrent — geen deadline' : data.deadline} />
            {isAdmin && data.placeInWarehouse && <Row label="Magazijn" value="Direct in magazijn plaatsen" />}
            {data.dimensions && <Row label="Afmetingen" value={data.dimensions} />}
            {data.transport && <Row label="Transport" value={data.transport} />}
          </dl>
          {error && <p className="text-sm text-destructive" data-testid="wizard-submit-error">{error}</p>}
        </section>
      )}

      {/* Nav */}
      <div className="mt-12 flex justify-between border-t border-border pt-6">
        <button
          onClick={back}
          disabled={step === 1}
          className="btn-ghost disabled:opacity-30"
          data-testid="wizard-back-btn"
        >
          ← Terug
        </button>
        {step < STEPS.length && (
          <button
            onClick={next}
            disabled={!canNext()}
            className="btn-primary"
            data-testid="wizard-next-btn"
          >
            Volgende →
          </button>
        )}
        {step === STEPS.length && (
          <button
            onClick={submit}
            disabled={submitting}
            className="btn-primary"
            data-testid="wizard-submit-btn"
          >
            {submitting ? 'Aanmaken…' : 'Aanbieding plaatsen ✓'}
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start gap-6 py-3">
      <dt className="overline w-32 shrink-0 pt-0.5">{label}</dt>
      <dd className="text-foreground/85 break-words">{value || '—'}</dd>
    </div>
  );
}
