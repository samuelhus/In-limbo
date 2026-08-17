import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, formatApiError } from '@/lib/api';
import { uploadToCloudinary, cloudinaryThumb } from '@/lib/cloudinary';
import { useAuth } from '@/contexts/AuthContext';
import { MATERIAL_CATEGORIES } from '@/lib/materialCategories';

const PROJECT_TYPES = ['verbouwing', 'workshop', 'kunst', 'scenografie', 'voorstelling', 'infrastructuur', 'ander'];

function todayPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// Sub-stappen binnen de materiaalselectie (§4 stap 2)
const MAT_STEP_GRID = 'grid';       // raster met 28 hoofdcategorieën
const MAT_STEP_SUBCAT = 'subcat';   // lijst subcategorieën (indien aanwezig)
const MAT_STEP_NOTE = 'note';       // opmerking-veld

export default function SearchRequestWizard({ adminMode = false, editMode = false }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('fr') ? 'fr' : 'nl';
  const navigate = useNavigate();
  const { id: searchRequestId } = useParams();
  const { user } = useAuth();

  const [step, setStep] = useState(adminMode ? 0 : 1); // stap 0 = admin org-keuze (enkel adminMode)
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [loadingExisting, setLoadingExisting] = useState(editMode);

  const [data, setData] = useState({
    projectName: '', location: '', projectType: '', shortDescription: '',
    deadline: '', photos: [], materials: [],
  });

  // Admin-only: namens welke org/gebruiker
  const [orgQuery, setOrgQuery] = useState('');
  const [orgResults, setOrgResults] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [orgUsers, setOrgUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');

  // Materiaal-sub-flow state
  const [matSubStep, setMatSubStep] = useState(MAT_STEP_GRID);
  const [matMainCat, setMatMainCat] = useState(null);
  const [matSubCat, setMatSubCat] = useState(null);
  const [matNote, setMatNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const stepContentRef = React.useRef(null);

  // Bij elke overgang binnen de materiaal-substap (raster -> subcategorie -> notitie
  // en terug) naar het begin van de inhoud scrollen — anders sta je, als je een
  // categorie onderaan het raster koos, plots (te ver naar beneden gescrold) middenin
  // de volgende substap.
  useEffect(() => {
    stepContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [matSubStep]);
  useEffect(() => {
    stepContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [step]);

  useEffect(() => {
    if (!editMode || !searchRequestId) return;
    const url = adminMode ? `/admin/search-requests/${searchRequestId}` : `/search-requests/${searchRequestId}`;
    api.get(url)
      .then(({ data: sr }) => {
        setData({
          projectName: sr.projectName || '',
          location: sr.location || '',
          projectType: sr.projectType || '',
          shortDescription: sr.shortDescription || '',
          deadline: sr.deadline || '',
          photos: sr.photos || [],
          materials: sr.materials || [],
        });
        setLoadingExisting(false);
      })
      .catch(() => navigate(adminMode ? '/admin' : '/mijn-zoekertjes'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, searchRequestId]);

  // Admin: organisatie-zoeken (debounce)
  useEffect(() => {
    if (!adminMode || orgQuery.trim().length < 2) { setOrgResults([]); return; }
    const t = setTimeout(() => {
      api.get('/organisations/search', { params: { q: orgQuery.trim() } })
        .then(({ data }) => setOrgResults(data))
        .catch(() => setOrgResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [orgQuery, adminMode]);

  const pickOrg = (org) => {
    setSelectedOrg(org);
    setOrgQuery(org.name);
    setOrgResults([]);
    setSelectedUserId('');
    setOrgUsers([]);
  };

  const onFilesPicked = async (e) => {
    const files = Array.from(e.target.files || []);
    const room = 5 - data.photos.length;
    const toUpload = files.slice(0, room);
    setUploading(true);
    try {
      const urls = [];
      for (const f of toUpload) urls.push(await uploadToCloudinary(f));
      setData((d) => ({ ...d, photos: [...d.photos, ...urls] }));
    } catch (err) {
      setError(err.message || t('search_request.upload_failed'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };
  const removePhoto = (idx) => setData((d) => ({ ...d, photos: d.photos.filter((_, i) => i !== idx) }));

  // --- Materiaal sub-flow handlers ---
  const openMainCat = (cat) => {
    setMatMainCat(cat);
    setMatSubCat(null);
    setMatNote('');
    if (cat.subcategories.length > 0) {
      setMatSubStep(MAT_STEP_SUBCAT);
    } else {
      setMatSubCat(cat.key); // geen subcats: hoofdcategorie is meteen de keuze
      setMatSubStep(MAT_STEP_NOTE);
    }
  };
  const pickSubCat = (subKey) => {
    setMatSubCat(subKey);
    setMatSubStep(MAT_STEP_NOTE);
  };
  const confirmMaterial = () => {
    setData((d) => ({
      ...d,
      materials: [...d.materials, {
        hoofdcategorie: matMainCat.key,
        subcategorie: matSubCat,
        opmerking: matNote.trim() || null,
      }],
    }));
    setMatSubStep(MAT_STEP_GRID);
    setMatMainCat(null);
    setMatSubCat(null);
    setMatNote('');
  };
  const removeMaterial = (idx) => setData((d) => ({ ...d, materials: d.materials.filter((_, i) => i !== idx) }));
  const cancelMaterialSubFlow = () => {
    setMatSubStep(MAT_STEP_GRID);
    setMatMainCat(null);
    setMatSubCat(null);
    setMatNote('');
  };

  const catLabel = (cat) => (lang === 'fr' ? cat.fr : cat.nl);
  const subLabel = (sub) => (lang === 'fr' ? sub.fr : sub.nl);
  const findCat = (key) => MATERIAL_CATEGORIES.find((c) => c.key === key);

  const minDeadline = isoDate(todayPlus(1));
  const maxDeadline = isoDate(todayPlus(365));

  const canNext = () => {
    if (adminMode && step === 0) return !!selectedOrg;
    if (step === 1) return true; // introscherm
    if (step === 2) {
      if (adminMode) return true; // admin: alles optioneel
      return data.projectName.trim().length > 0 && !!data.projectType && !!data.deadline;
    }
    if (step === 3) return adminMode || data.materials.length >= 1;
    return true;
  };

  const next = () => setStep((s) => s + 1);
  const back = () => {
    // Zit je in de materiaal-substap (subcategorie of notitie), dan brengt "Terug"
    // je terug naar het categorieraster — niet naar de vorige wizard-stap (projectgegevens).
    if (step === 3 && matSubStep !== MAT_STEP_GRID) {
      cancelMaterialSubFlow();
      return;
    }
    setStep((s) => Math.max(adminMode ? 0 : 1, s - 1));
  };

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        projectName: data.projectName.trim() || null,
        location: data.location.trim() || null,
        projectType: data.projectType || null,
        shortDescription: data.shortDescription.trim() || null,
        deadline: data.deadline || null,
        photos: data.photos,
        materials: data.materials,
      };
      if (editMode) {
        const url = adminMode ? `/admin/search-requests/${searchRequestId}` : `/search-requests/${searchRequestId}`;
        // Admin PATCH-endpoint bestaat niet apart — hergebruikt hetzelfde als user, admin mag alles
        await api.patch(`/search-requests/${searchRequestId}`, payload);
        navigate(adminMode ? `/admin` : `/mijn-zoekertjes`);
      } else if (adminMode) {
        await api.post('/admin/search-requests', {
          ...payload,
          organisationId: selectedOrg.id,
          createdByUserId: selectedUserId || null,
        });
        navigate('/admin');
      } else {
        await api.post('/search-requests', payload);
        navigate('/mijn-zoekertjes');
      }
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingExisting) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-muted-foreground" data-testid="search-request-wizard-loading">
        {t('common.loading')}
      </div>
    );
  }

  const TOTAL_STEPS = adminMode ? 4 : 3; // (admin: 0..3) / (user: 1..3)
  const stepIndex = adminMode ? step + 1 : step; // 1-based voor de progressbalk

  return (
    <div className="max-w-3xl mx-auto px-4 py-16" data-testid="search-request-wizard-page">
      <div ref={stepContentRef} />
      <p className="overline mb-3">
        {editMode ? t('search_request.wizard_edit_title') : t('search_request.wizard_title')}
      </p>
      <h1 className="text-4xl font-bold tracking-tight mb-2">
        {step === 0 && t('search_request.wizard_step_org')}
        {step === 1 && t('search_request.wizard_step_intro')}
        {step === 2 && t('search_request.wizard_step_project')}
        {step === 3 && t('search_request.wizard_step_materials')}
        {step === 4 && t('search_request.wizard_step_confirm')}
      </h1>

      <div className="flex items-center gap-2 my-8" data-testid="wizard-progress">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div key={i} className={`h-px flex-1 transition-all ${i + 1 <= stepIndex ? 'bg-foreground h-0.5' : 'bg-border'}`} />
        ))}
        <span className="overline ml-3">{stepIndex}/{TOTAL_STEPS}</span>
      </div>

      {/* STEP 0 (admin only): organisatie + gebruiker kiezen */}
      {adminMode && step === 0 && (
        <section className="space-y-6" data-testid="wizard-step-org">
          <div className="space-y-2 relative">
            <label className="label-overline">{t('search_request.admin_org_label')}</label>
            <input
              className="input-flat"
              value={orgQuery}
              onChange={(e) => { setOrgQuery(e.target.value); setSelectedOrg(null); }}
              placeholder={t('search_request.admin_org_placeholder')}
              data-testid="wizard-org-search-input"
              autoFocus
            />
            {orgResults.length > 0 && !selectedOrg && (
              <ul className="absolute z-10 w-full bg-background border border-border shadow-lg max-h-64 overflow-y-auto">
                {orgResults.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => pickOrg(o)}
                      className="block w-full text-left px-4 py-3 text-sm hover:bg-[#ADEBB3]"
                      data-testid={`wizard-org-option-${o.id}`}
                    >
                      {o.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {selectedOrg && (
            <div className="space-y-2">
              <label className="label-overline">
                {t('search_request.admin_user_label')} <span className="text-muted-foreground normal-case">({t('common.optional')})</span>
              </label>
              <UserPicker organisationId={selectedOrg.id} value={selectedUserId} onChange={setSelectedUserId} />
            </div>
          )}
        </section>
      )}

      {/* STEP 1: Introscherm */}
      {step === 1 && (
        <section data-testid="wizard-step-intro">
          <p className="text-foreground/80 leading-relaxed whitespace-pre-line border-l-2 border-border pl-4">
            {t('search_request.intro_text')}
          </p>
        </section>
      )}

      {/* STEP 2: Projectgegevens */}
      {step === 2 && (
        <section className="space-y-6" data-testid="wizard-step-project">
          <div className="space-y-2">
            <label className="label-overline">
              {t('search_request.field_project_name')} {!adminMode && <span className="text-destructive">*</span>}
            </label>
            <input
              className="input-flat"
              maxLength={100}
              value={data.projectName}
              onChange={(e) => setData({ ...data, projectName: e.target.value })}
              data-testid="wizard-project-name-input"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <label className="label-overline">
              {t('search_request.field_location')} <span className="text-muted-foreground normal-case">({t('common.optional')})</span>
            </label>
            <input
              className="input-flat"
              maxLength={200}
              value={data.location}
              onChange={(e) => setData({ ...data, location: e.target.value })}
              data-testid="wizard-location-input"
            />
          </div>
          <div className="space-y-2">
            <label className="label-overline">
              {t('search_request.field_project_type')} {!adminMode && <span className="text-destructive">*</span>}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PROJECT_TYPES.map((pt) => (
                <button
                  key={pt}
                  type="button"
                  onClick={() => setData({ ...data, projectType: pt })}
                  data-testid={`wizard-project-type-${pt}`}
                  className={`px-4 py-3 border transition-all text-sm ${
                    data.projectType === pt
                      ? 'bg-foreground text-background border-foreground'
                      : 'border-border bg-surface hover:border-foreground'
                  }`}
                >
                  {t(`search_request.project_type_${pt}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="label-overline">
              {t('search_request.field_short_description')} <span className="text-muted-foreground normal-case">({t('common.optional')})</span>
            </label>
            <textarea
              rows={3}
              maxLength={500}
              className="input-flat"
              value={data.shortDescription}
              onChange={(e) => setData({ ...data, shortDescription: e.target.value })}
              data-testid="wizard-short-description-input"
            />
          </div>
          <div className="space-y-2">
            <label className="label-overline">
              {t('search_request.field_deadline')} {!adminMode && <span className="text-destructive">*</span>}
              <span className="text-muted-foreground normal-case"> ({t('search_request.deadline_hint')})</span>
            </label>
            <input
              type="date"
              className="input-flat"
              min={minDeadline}
              max={maxDeadline}
              value={data.deadline}
              onChange={(e) => setData({ ...data, deadline: e.target.value })}
              data-testid="wizard-deadline-input"
            />
          </div>
          <div className="space-y-2">
            <label className="label-overline">
              {t('search_request.field_photos')} <span className="text-muted-foreground normal-case">({t('common.optional')}, max 5)</span>
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              {data.photos.map((url, i) => (
                <div key={i} className="aspect-square relative bg-muted overflow-hidden group">
                  <img src={cloudinaryThumb(url, 400, 400)} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-1 right-1 bg-background/90 px-2 py-0.5 text-xs opacity-0 group-hover:opacity-100 transition"
                    data-testid={`wizard-remove-photo-${i}`}
                  >
                    {t('common.remove')}
                  </button>
                </div>
              ))}
            </div>
            {data.photos.length < 5 && (
              <input type="file" accept="image/*" multiple onChange={onFilesPicked} disabled={uploading} data-testid="wizard-photo-input" className="text-sm" />
            )}
            {uploading && <p className="text-xs text-muted-foreground">{t('common.uploading')}</p>}
          </div>
        </section>
      )}

      {/* STEP 3: Materiaalselectie (herhaalbare sub-flow) */}
      {step === 3 && (
        <section className="space-y-6" data-testid="wizard-step-materials">
          {data.materials.length > 0 && (
            <ul className="divide-y divide-border border-y border-border" data-testid="wizard-materials-list">
              {data.materials.map((m, i) => {
                const cat = findCat(m.hoofdcategorie);
                const sub = cat?.subcategories.find((s) => s.key === m.subcategorie);
                const label = sub ? subLabel(sub) : (cat ? catLabel(cat) : m.subcategorie);
                return (
                  <li key={i} className="py-3 flex items-start justify-between gap-4" data-testid={`wizard-material-row-${i}`}>
                    <div>
                      <p className="font-medium text-sm">{cat ? catLabel(cat) : m.hoofdcategorie}: {label}</p>
                      {m.opmerking && <p className="text-xs text-muted-foreground mt-0.5">{m.opmerking}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeMaterial(i)}
                      className="text-xs text-muted-foreground hover:text-destructive shrink-0"
                      data-testid={`wizard-remove-material-${i}`}
                    >
                      ✕ {t('common.remove')}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {matSubStep === MAT_STEP_GRID && (
            <div>
              <p className="label-overline mb-3">{t('search_request.material_grid_label')}</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {MATERIAL_CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => openMainCat(cat)}
                    data-testid={`wizard-category-${cat.key}`}
                    className="flex flex-col items-center gap-2 p-4 border border-border bg-surface hover:border-foreground transition-colors text-center"
                  >
                    <img src={cat.icon} alt="" className="w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] object-contain" loading="lazy" />
                    <span className="text-xs leading-tight">{catLabel(cat)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {matSubStep === MAT_STEP_SUBCAT && matMainCat && (
            <div data-testid="wizard-subcat-step">
              <button type="button" onClick={cancelMaterialSubFlow} className="text-sm text-muted-foreground hover:underline mb-4">
                ← {t('common.back')}
              </button>
              <p className="label-overline mb-3">{catLabel(matMainCat)}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => pickSubCat(matMainCat.key)}
                  data-testid={`wizard-subcat-${matMainCat.key}-general`}
                  className="px-4 py-3 border border-border bg-surface hover:border-foreground text-sm text-left"
                >
                  {catLabel(matMainCat)} <span className="text-muted-foreground">({t('search_request.general_option')})</span>
                </button>
                {matMainCat.subcategories.map((sub) => (
                  <button
                    key={sub.key}
                    type="button"
                    onClick={() => pickSubCat(sub.key)}
                    data-testid={`wizard-subcat-${sub.key}`}
                    className="px-4 py-3 border border-border bg-surface hover:border-foreground text-sm text-left"
                  >
                    {subLabel(sub)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {matSubStep === MAT_STEP_NOTE && matMainCat && (
            <div data-testid="wizard-note-step" className="space-y-4">
              <button
                type="button"
                onClick={() => setMatSubStep(matMainCat.subcategories.length > 0 ? MAT_STEP_SUBCAT : MAT_STEP_GRID)}
                className="text-sm text-muted-foreground hover:underline"
              >
                ← {t('common.back')}
              </button>
              <p className="label-overline">
                {catLabel(matMainCat)}
                {matSubCat && matSubCat !== matMainCat.key && (
                  <>: {subLabel(matMainCat.subcategories.find((s) => s.key === matSubCat))}</>
                )}
              </p>
              <textarea
                rows={3}
                maxLength={500}
                className="input-flat"
                placeholder={t('search_request.note_placeholder')}
                value={matNote}
                onChange={(e) => setMatNote(e.target.value)}
                data-testid="wizard-note-input"
                autoFocus
              />
              <button type="button" onClick={confirmMaterial} className="btn-primary" data-testid="wizard-confirm-material-btn">
                {t('search_request.add_material')}
              </button>
            </div>
          )}
        </section>
      )}

      {/* STEP 4: Bevestiging */}
      {step === 4 && (
        <section className="space-y-4" data-testid="wizard-step-confirm">
          <dl className="border-t border-border divide-y divide-border" data-testid="wizard-summary">
            {adminMode && <Row label={t('search_request.admin_org_label')} value={selectedOrg?.name} />}
            <Row label={t('search_request.field_project_name')} value={data.projectName || '—'} />
            {data.location && <Row label={t('search_request.field_location')} value={data.location} />}
            <Row label={t('search_request.field_project_type')} value={data.projectType ? t(`search_request.project_type_${data.projectType}`) : '—'} />
            {data.shortDescription && <Row label={t('search_request.field_short_description')} value={data.shortDescription} />}
            <Row label={t('search_request.field_deadline')} value={data.deadline || (adminMode ? t('search_request.deadline_auto_hint') : '—')} />
            <Row label={t('search_request.field_photos')} value={t('search_request.summary_photos_count', { count: data.photos.length })} />
          </dl>
          {data.materials.length > 0 && (
            <div>
              <p className="label-overline mb-2">{t('search_request.field_materials')}</p>
              <ul className="divide-y divide-border border-y border-border">
                {data.materials.map((m, i) => {
                  const cat = findCat(m.hoofdcategorie);
                  const sub = cat?.subcategories.find((s) => s.key === m.subcategorie);
                  return (
                    <li key={i} className="py-3">
                      <p className="text-sm font-medium">{cat ? catLabel(cat) : m.hoofdcategorie}{sub ? `: ${subLabel(sub)}` : ''}</p>
                      {m.opmerking && <p className="text-xs text-muted-foreground mt-0.5">{m.opmerking}</p>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {error && <p className="text-sm text-destructive" data-testid="wizard-submit-error">{error}</p>}
        </section>
      )}

      <div className="mt-12 flex justify-between border-t border-border pt-6">
        <button onClick={back} disabled={step === (adminMode ? 0 : 1)} className="btn-secondary disabled:opacity-30" data-testid="wizard-back-btn">
          ← {t('common.back')}
        </button>
        {step < 4 && (
          <button onClick={next} disabled={!canNext()} className="btn-primary" data-testid="wizard-next-btn">
            {t('common.next')} →
          </button>
        )}
        {step === 4 && (
          <button onClick={submit} disabled={submitting} className="btn-primary" data-testid="wizard-submit-btn">
            {submitting ? t('common.saving') : (editMode ? t('search_request.wizard_save_edit') : t('search_request.wizard_publish'))}
          </button>
        )}
      </div>
    </div>
  );
}

function UserPicker({ organisationId, value, onChange }) {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  useEffect(() => {
    api.get('/admin/users', { params: { organisation_id: organisationId, limit: 50 } })
      .then(({ data }) => setUsers(data.items || []))
      .catch(() => setUsers([]));
  }, [organisationId]);
  return (
    <select className="input-flat" value={value} onChange={(e) => onChange(e.target.value)} data-testid="wizard-user-select">
      <option value="">{t('search_request.admin_user_none')}</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</option>
      ))}
    </select>
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
