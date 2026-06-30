import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, formatApiError } from '@/lib/api';
import { uploadToCloudinary, uploadPdfToCloudinary, cloudinaryThumb } from '@/lib/cloudinary';
import { useAuth } from '@/contexts/AuthContext';

const MATERIALS = [
  'Hout', 'Metaal', 'Plastic', 'Steen', 'Textiel',
  'Electro', 'Vloeistof', 'Papier', 'Isolatie', 'Ander',
];

const MATERIAL_LABEL_KEYS = {
  Hout: 'listing.material_hout',
  Metaal: 'listing.material_metaal',
  Plastic: 'listing.material_plastic',
  Steen: 'listing.material_steen',
  Textiel: 'listing.material_textiel',
  Electro: 'listing.material_electro',
  Vloeistof: 'listing.material_vloeistof',
  Papier: 'listing.material_papier',
  Isolatie: 'listing.material_isolatie',
  Ander: 'listing.material_ander',
};

const STEP_KEYS = [
  'listing.wizard_step_photos',
  'listing.wizard_step_title',
  'listing.wizard_step_description',
  'listing.wizard_step_deadline',
  'listing.wizard_step_weight',
  'listing.wizard_step_material',
  'listing.wizard_step_dimensions',
  'listing.wizard_step_transport',
  'listing.wizard_step_confirm',
];

export default function ListingWizard({ editMode = false }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: listingId } = useParams();
  const { user } = useAuth();
  const isAdmin = user && user.role === 'admin';
  const isDonateur = user && user.role === 'donateur';
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [loadingListing, setLoadingListing] = useState(editMode);

  const [data, setData] = useState({
    photos: [], title: '', description: '', weight: '',
    material: 'Hout', deadline: '', isRecurrent: false,
    dimensions: '', transport: '', placeInWarehouse: false,
    technicalFiles: [],
  });

  useEffect(() => {
    if (!editMode || !listingId) return;
    api.get(`/listings/${listingId}`)
      .then(({ data: listing }) => {
        // Permission + status guard
        const isOwner = listing.isOwner;
        const editable = ['beschikbaar', 'gearchiveerd'].includes(listing.status)
          || (isAdmin && listing.status === 'in_magazijn');
        if (!editable || (!isOwner && !isAdmin)) {
          navigate(`/aanbieding/${listingId}`);
          return;
        }
        setData({
          photos: listing.photos || [],
          title: listing.title || '',
          description: listing.description || '',
          weight: listing.weight?.toString() || '',
          material: listing.material || 'Hout',
          deadline: listing.deadline || '',
          isRecurrent: listing.isRecurrent || false,
          dimensions: listing.dimensions || '',
          transport: listing.transport || '',
          placeInWarehouse: listing.placeInWarehouse || (listing.status === 'in_magazijn'),
          technicalFiles: listing.technicalFiles || [],
        });
        setLoadingListing(false);
      })
      .catch(() => navigate(`/aanbieding/${listingId}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, listingId]);

  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');

  const onFilesPicked = async (e) => {
    setUploadErr('');
    const files = Array.from(e.target.files || []);
    const room = 5 - data.photos.length;
    const toUpload = files.slice(0, room);
    if (files.length > room) {
      setUploadErr(t('listing.wizard_upload_max', { count: files.length - room }));
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
      setUploadErr(err.message || t('listing.wizard_upload_failed'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removePhoto = (idx) => {
    setData((d) => ({ ...d, photos: d.photos.filter((_, i) => i !== idx) }));
  };

  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfErr, setPdfErr] = useState('');

  const onPdfPicked = async (e) => {
    setPdfErr('');
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setPdfErr('Bestand is te groot (max. 10 MB).');
      return;
    }
    if (data.technicalFiles.length >= 3) {
      setPdfErr('Maximum 3 PDF bestanden.');
      return;
    }
    setUploadingPdf(true);
    try {
      const url = await uploadPdfToCloudinary(file);
      setData((d) => ({ ...d, technicalFiles: [...d.technicalFiles, url] }));
    } catch (err) {
      setPdfErr(err.message || 'PDF upload mislukt.');
    } finally {
      setUploadingPdf(false);
      e.target.value = '';
    }
  };

  const removePdf = (idx) => {
    setData((d) => ({ ...d, technicalFiles: d.technicalFiles.filter((_, i) => i !== idx) }));
  };

  const next = () => {
    setStep((s) => {
      // Admin magazijn shortcut in create mode: jump from step 4 to step 9
      if (s === 4 && isAdmin && data.placeInWarehouse && !editMode) {
        return STEP_KEYS.length; // 9
      }
      return Math.min(STEP_KEYS.length, s + 1);
    });
  };
  const back = () => {
    setStep((s) => {
      // Mirror the skip when going back from the confirm step
      if (s === STEP_KEYS.length && isAdmin && data.placeInWarehouse && !editMode) {
        return 4;
      }
      return Math.max(1, s - 1);
    });
  };

  const canNext = () => {
    switch (step) {
      case 1: return data.photos.length >= 1;
      case 2: return data.title.trim().length > 0 && data.title.length <= 35;
      case 3: return data.description.trim().length > 0 && data.description.length <= 400;
      case 4: return data.isRecurrent || !!data.deadline || (isAdmin && data.placeInWarehouse);
      case 5: return parseFloat(data.weight) > 0 || (isAdmin && data.placeInWarehouse);
      case 6: return MATERIALS.includes(data.material);
      default: return true;
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const warehouseShortcut = isAdmin && data.placeInWarehouse;
      const parsedWeight = parseFloat(data.weight);
      const hasWeight = !isNaN(parsedWeight) && parsedWeight > 0;
      const payload = {
        title: data.title.trim(),
        description: data.description.trim(),
        weight: hasWeight ? parsedWeight : (warehouseShortcut ? 0 : parsedWeight),
        material: hasWeight ? data.material : (warehouseShortcut ? 'Ander' : data.material),
        photos: data.photos,
        technicalFiles: data.technicalFiles,
        deadline: data.isRecurrent ? null : (data.deadline || null),
        isRecurrent: data.isRecurrent,
        dimensions: data.dimensions || null,
        transport: data.transport || null,
      };
      if (editMode) {
        if (isAdmin) payload.placeInWarehouse = data.placeInWarehouse;
        await api.patch(`/listings/${listingId}`, payload);
        navigate(`/aanbieding/${listingId}`);
      } else {
        payload.placeInWarehouse = isAdmin ? data.placeInWarehouse : false;
        const { data: created } = await api.post('/listings', payload);
        navigate(`/aanbieding/${created.id}`);
      }
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingListing) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-muted-foreground" data-testid="wizard-loading">
        {t('listing.wizard_loading')}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-16" data-testid="wizard-page">
      <p className="overline mb-3">{editMode ? t('listing.wizard_edit_title') : t('listing.wizard_title')}</p>
      <h1 className="text-4xl font-bold tracking-tight mb-2">{t(STEP_KEYS[step - 1])}</h1>

      {/* Progress */}
      <div className="flex items-center gap-2 my-8" data-testid="wizard-progress">
        {STEP_KEYS.map((_, i) => (
          <div
            key={i}
            className={`h-px flex-1 transition-all ${i + 1 <= step ? 'bg-foreground h-0.5' : 'bg-border'}`}
          />
        ))}
        <span className="overline ml-3">{step}/{STEP_KEYS.length}</span>
      </div>

      {/* STEP 1: Photos */}
      {step === 1 && (
        <section className="space-y-6" data-testid="wizard-step-photos">
          <p className="text-foreground/75">
            {t('listing.wizard_photos_intro')}
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
                  {t('listing.wizard_remove_photo')}
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
                {uploading ? t('listing.wizard_uploading') : t('listing.wizard_add_photo')}
              </label>
            )}
          </div>
          {uploadErr && <p className="text-sm text-destructive" data-testid="wizard-upload-error">{uploadErr}</p>}

          <div className="border-t border-border pt-6 space-y-3">
            <p className="overline">TECHNISCHE FICHES <span className="text-muted-foreground normal-case font-normal">({t('common.optional')})</span></p>
            <p className="text-sm text-foreground/75">Voeg maximaal 3 PDF bestanden toe (max. 10 MB per bestand).</p>
            <ul className="space-y-2">
              {data.technicalFiles.map((url, i) => {
                const filename = decodeURIComponent(url.split('/').pop().split('?')[0]) || `fiche-${i + 1}.pdf`;
                return (
                  <li key={i} className="flex items-center justify-between bg-muted px-3 py-2 text-sm">
                    <a href={url} target="_blank" rel="noopener noreferrer" className="industrial-link truncate max-w-xs">{filename}</a>
                    <button onClick={() => removePdf(i)} className="text-muted-foreground hover:text-foreground ml-4 shrink-0">Verwijder</button>
                  </li>
                );
              })}
            </ul>
            {data.technicalFiles.length < 3 && (
              <label className="inline-flex items-center gap-2 border border-border px-4 py-2 text-sm cursor-pointer hover:border-foreground transition-colors">
                <input type="file" accept="application/pdf" onChange={onPdfPicked} className="hidden" />
                {uploadingPdf ? 'Uploaden…' : '+ PDF toevoegen'}
              </label>
            )}
            {pdfErr && <p className="text-sm text-destructive">{pdfErr}</p>}
          </div>
        </section>
      )}

      {/* STEP 2: Title */}
      {step === 2 && (
        <section className="space-y-3" data-testid="wizard-step-title">
          <label className="label-overline">{t('listing.wizard_title_label')}</label>
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
          <label className="label-overline">{t('listing.wizard_description_label')}</label>
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

      {/* STEP 4: Deadline (+ admin magazijn-toggle) */}
      {step === 4 && (
        <section className="space-y-4" data-testid="wizard-step-deadline">
          {!isDonateur && (
            <label className="flex items-center gap-3 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={data.isRecurrent}
                onChange={(e) => setData({
                  ...data,
                  isRecurrent: e.target.checked,
                  deadline: e.target.checked ? '' : data.deadline,
                  placeInWarehouse: e.target.checked ? false : data.placeInWarehouse,
                })}
                data-testid="wizard-recurrent-toggle"
              />
              <span className="text-sm">{t('listing.wizard_recurrent_checkbox')}</span>
            </label>
          )}
          {!data.isRecurrent && !(isAdmin && data.placeInWarehouse) && (
            <div>
              <label className="label-overline">{t('listing.wizard_deadline_label')}</label>
              <input
                type="date"
                className="input-flat"
                data-testid="wizard-deadline-input"
                value={data.deadline}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setData({ ...data, deadline: e.target.value })}
              />
              {isDonateur && (
                <p className="text-xs text-muted-foreground mt-2" data-testid="wizard-donateur-recurrent-hint">
                  {t('listing.wizard_donateur_recurrent_hint')}
                </p>
              )}
            </div>
          )}
          {data.isRecurrent && !isDonateur && (
            <p className="text-sm text-foreground/75 leading-relaxed border-l-2 border-border pl-4">
              {t('listing.wizard_recurrent_email_hint')}
            </p>
          )}

          {isAdmin && (
            <div className="mt-6 border-t border-border pt-4" data-testid="wizard-admin-magazijn-block">
              <p className="overline mb-2">{t('listing.wizard_admin_option')}</p>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.placeInWarehouse}
                  onChange={(e) => setData({
                    ...data,
                    placeInWarehouse: e.target.checked,
                    deadline: e.target.checked ? '' : data.deadline,
                    isRecurrent: e.target.checked ? false : data.isRecurrent,
                  })}
                  data-testid="wizard-place-in-warehouse-toggle"
                />
                <span className="text-sm">{t('listing.wizard_admin_warehouse_hint')}</span>
              </label>
              <p className="text-xs text-muted-foreground mt-2">
                {t('listing.wizard_warehouse_hint_prefix')} <em>{t('listing.status_in_magazijn')}</em> {t('listing.wizard_warehouse_hint_middle')} <em>{t('listing.status_beschikbaar')}</em>.
                {!editMode && ` ${t('listing.wizard_warehouse_hint_skip')}`}
              </p>
            </div>
          )}
        </section>
      )}

      {/* STEP 5: Weight */}
      {step === 5 && (
        <section className="space-y-3" data-testid="wizard-step-weight">
          <label className="label-overline">{t('listing.wizard_weight_label')}</label>
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

      {/* STEP 6: Material */}
      {step === 6 && (
        <section className="space-y-3" data-testid="wizard-step-material">
          <label className="label-overline">{t('listing.wizard_material_field_label')}</label>
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
                {t(MATERIAL_LABEL_KEYS[m])}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* STEP 7: Dimensions */}
      {step === 7 && (
        <section className="space-y-3" data-testid="wizard-step-dimensions">
          <label className="label-overline">{t('listing.wizard_step_dimensions')} <span className="text-muted-foreground normal-case">({t('common.optional')})</span></label>
          <input
            className="input-flat"
            data-testid="wizard-dimensions-input"
            placeholder={t('listing.wizard_dimensions_placeholder')}
            value={data.dimensions}
            onChange={(e) => setData({ ...data, dimensions: e.target.value })}
          />
        </section>
      )}

      {/* STEP 8: Transport */}
      {step === 8 && (
        <section className="space-y-3" data-testid="wizard-step-transport">
          <label className="label-overline">{t('listing.wizard_step_transport')} <span className="text-muted-foreground normal-case">({t('common.optional')})</span></label>
          <textarea
            rows={3}
            className="input-flat"
            data-testid="wizard-transport-input"
            placeholder={t('listing.wizard_transport_placeholder')}
            value={data.transport}
            onChange={(e) => setData({ ...data, transport: e.target.value })}
          />
        </section>
      )}

      {/* STEP 9: Confirm */}
      {step === 9 && (
        <section className="space-y-4" data-testid="wizard-step-confirm">
          <h2 className="text-2xl font-semibold mb-4">{t('listing.wizard_step_confirm')}</h2>
          <dl className="border-t border-border divide-y divide-border" data-testid="wizard-summary">
            <Row label={t('listing.wizard_step_photos')} value={t('listing.wizard_summary_photos_count', { count: data.photos.length })} />
            <Row label={t('listing.wizard_step_title')} value={data.title} />
            <Row label={t('listing.wizard_step_description')} value={data.description} />
            <Row label={t('listing.wizard_step_deadline')} value={data.isRecurrent ? t('listing.wizard_recurrent_no_deadline') : data.deadline} />
            {data.weight && parseFloat(data.weight) > 0 && (
              <Row label={t('listing.wizard_step_weight')} value={`${data.weight} kg`} />
            )}
            {data.material && parseFloat(data.weight) > 0 && (
              <Row label={t('listing.wizard_step_material')} value={data.material} />
            )}
            {data.dimensions && <Row label={t('listing.wizard_step_dimensions')} value={data.dimensions} />}
            {data.transport && <Row label={t('listing.wizard_step_transport')} value={data.transport} />}
            {data.technicalFiles.length > 0 && (
              <Row label={t('listing.technical_files')} value={`${data.technicalFiles.length} PDF${data.technicalFiles.length > 1 ? "'s" : ''}`} />
            )}
            {isAdmin && data.placeInWarehouse && (
              <Row
                label={t('nav.warehouse')}
                value={editMode ? t('listing.wizard_warehouse_stays') : t('listing.wizard_warehouse_direct')}
              />
            )}
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
          ← {t('common.back')}
        </button>
        {step < STEP_KEYS.length && (
          <button
            onClick={next}
            disabled={!canNext()}
            className="btn-primary"
            data-testid="wizard-next-btn"
          >
            {t('common.next')} →
          </button>
        )}
        {step === STEP_KEYS.length && (
          <button
            onClick={submit}
            disabled={submitting}
            className="btn-primary"
            data-testid="wizard-submit-btn"
          >
            {submitting
              ? t('common.saving')
              : (editMode ? t('listing.wizard_save_edit') : t('listing.wizard_publish'))}
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
