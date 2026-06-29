import React, { useState, useEffect, useRef } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { api, formatApiError } from '@/lib/api';


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

function StepIndicator({ step }) {
  return (
    <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground mb-10" data-testid="checkin-steps">
      {[1, 2, 3].map((i) => (
        <React.Fragment key={i}>
          <span
            className={`w-7 h-7 inline-flex items-center justify-center border ${
              i <= step ? 'border-foreground bg-foreground text-background' : 'border-border'
            }`}
          >
            {i}
          </span>
          {i < 3 && <span className="flex-1 h-px bg-border max-w-[40px]" />}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function Checkin() {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [items, setItems] = useState([]);
  const [currentMaterial, setCurrentMaterial] = useState('Hout');
  const [currentWeight, setCurrentWeight] = useState('');
  const [currentDescription, setCurrentDescription] = useState('');
  const materialSelectRef = useRef(null);
  const weightInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmedTotal, setConfirmedTotal] = useState(0);

  useEffect(() => {
    if (selectedOrg || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    api.get('/organisations/search', { params: { q: query.trim() } })
      .then(({ data }) => { if (!cancelled) setSuggestions(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [query, selectedOrg]);

  useEffect(() => {
    if (step === 2) setTimeout(() => materialSelectRef.current?.focus(), 0);
  }, [step]);

  const totalKg = items.reduce((s, i) => s + i.weightKg, 0);

  const groupedByMaterial = items.reduce((acc, i) => {
    acc[i.material] = (acc[i.material] || 0) + i.weightKg;
    return acc;
  }, {});

  const addItem = () => {
    const kg = parseFloat(currentWeight);
    if (!currentMaterial || isNaN(kg) || kg <= 0) return;
    const desc = currentDescription.trim();
    setItems([...items, { material: currentMaterial, weightKg: kg, description: desc || null }]);
    setCurrentWeight('');
    setCurrentDescription('');
    setTimeout(() => materialSelectRef.current?.focus(), 0);
  };

  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));

  const confirmCheckin = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post('/checkin', {
        organisationId: selectedOrg.id,
        items: items,
      });
      setConfirmedTotal(data.totalWeightKg);
      setStep(4);
    } catch (e) {
      setError(formatApiError(e) || 'Er liep iets mis. Probeer opnieuw.');
    } finally {
      setBusy(false);
    }
  };

  const resetAll = () => {
    setStep(1);
    setQuery('');
    setSuggestions([]);
    setSelectedOrg(null);
    setItems([]);
    setCurrentMaterial('Hout');
    setCurrentWeight('');
    setCurrentDescription('');
    setConfirmedTotal(0);
    setError('');
  };

  return (
    <div className="min-h-screen bg-background" data-testid="checkin-page">
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-12">
        <p className="overline mb-3">In Limbo · {t('nav.warehouse')}</p>
        <h1 className="text-4xl font-bold tracking-tight mb-2">{t('checkin.title')}</h1>
        <p className="text-sm text-muted-foreground mb-10">
          {t('checkin.subtitle')}
        </p>

        {step !== 4 && <StepIndicator step={step} />}

        {/* STEP 1: organisatie kiezen */}
        {step === 1 && (
          <section className="space-y-6" data-testid="checkin-step-1">
            <div>
              <label className="label-overline">{t('checkin.find_org')}</label>
              {selectedOrg ? (
                <div
                  className="inline-flex items-center gap-2 border border-foreground bg-surface px-4 py-2"
                  data-testid="checkin-selected-org"
                >
                  <span className="font-medium">{selectedOrg.name}</span>
                  <button
                    onClick={() => { setSelectedOrg(null); setQuery(''); }}
                    className="text-muted-foreground hover:text-foreground w-8 h-8 inline-flex items-center justify-center text-xl -mr-1"
                    data-testid="checkin-clear-org"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    className="input-flat"
                    placeholder={t('checkin.type_org_name')}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    data-testid="checkin-org-search-input"
                  />
                  {suggestions.length > 0 && (
                    <ul className="mt-2 border border-border bg-surface divide-y divide-border" data-testid="checkin-org-suggestions">
                      {suggestions.map((o) => (
                        <li key={o.id}>
                          <button
                            onClick={() => { setSelectedOrg(o); setQuery(o.name); setSuggestions([]); }}
                            data-testid={`checkin-org-option-${o.id}`}
                            className="w-full text-left px-4 py-4 text-sm hover:bg-muted active:bg-muted transition-colors"
                          >
                            <span className="font-medium">{o.name}</span>
                            <span className="text-muted-foreground ml-2 text-xs">{t(`org_categories.${o.category}`)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {query.length >= 2 && suggestions.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-2">{t('checkin.no_results')}</p>
                  )}
                </>
              )}
            </div>
            <button
              onClick={() => setStep(2)}
              disabled={!selectedOrg}
              className="btn-primary"
              data-testid="checkin-step1-next"
            >
              {t('common.next')} →
            </button>
          </section>
        )}

        {/* STEP 2: materialen toevoegen */}
        {step === 2 && (
          <section className="space-y-6" data-testid="checkin-step-2">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-3 items-end">
              <div>
                <label className="label-overline">{t('checkin.material_label')}</label>
                <select
                  ref={materialSelectRef}
                  className="input-flat"
                  value={currentMaterial}
                  onChange={(e) => {
                    setCurrentMaterial(e.target.value);
                    weightInputRef.current?.focus();
                  }}
                  data-testid="checkin-material-select"
                >
                  {MATERIALS.map((m) => <option key={m} value={m}>{t(MATERIAL_LABEL_KEYS[m])}</option>)}
                </select>
              </div>
              <div>
                <label className="label-overline">{t('checkin.weight_label')}</label>
                <input
                  ref={weightInputRef}
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0.1"
                  placeholder={t('checkin.weight_placeholder')}
                  className="input-flat"
                  value={currentWeight}
                  onChange={(e) => setCurrentWeight(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
                  data-testid="checkin-weight-input"
                />
              </div>
              <button
                onClick={addItem}
                disabled={!currentWeight || parseFloat(currentWeight) <= 0}
                className="btn-primary !py-3"
                data-testid="checkin-add-item-btn"
              >
                {t('checkin.add_btn')}
              </button>
            </div>

            <input
              type="text"
              placeholder={t('checkin.description_optional')}
              className="input-flat"
              value={currentDescription}
              onChange={(e) => setCurrentDescription(e.target.value)}
              maxLength={200}
              data-testid="checkin-description-input"
            />

            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="checkin-empty-items">
                {t('checkin.empty_items')}
              </p>
            ) : (
              <ul className="border-y border-border divide-y divide-border" data-testid="checkin-items-list">
                {items.map((it, i) => (
                  <li key={i} className="py-3 flex items-start justify-between gap-3" data-testid={`checkin-item-${i}`}>
                    <div className="text-sm">
                      <span className="font-medium">{t(MATERIAL_LABEL_KEYS[it.material])}</span>
                      <span className="text-muted-foreground ml-2">{it.weightKg} kg</span>
                      {it.description && (
                        <p className="text-xs text-muted-foreground italic mt-0.5">{it.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => removeItem(i)}
                      className="text-muted-foreground hover:text-destructive text-xl leading-none w-10 h-10 inline-flex items-center justify-center -mr-2"
                      data-testid={`checkin-remove-item-${i}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex justify-between">
              <button onClick={() => setStep(1)} className="btn-ghost" data-testid="checkin-step2-back">← {t('common.back')}</button>
              <button
                onClick={() => setStep(3)}
                disabled={items.length === 0}
                className="btn-primary"
                data-testid="checkin-step2-next"
              >
                {t('checkin.checkin_btn')}
              </button>
            </div>
          </section>
        )}

        {/* STEP 3: bevestiging */}
        {step === 3 && (
          <section className="space-y-6" data-testid="checkin-step-3">
            <div>
              <p className="overline mb-1">{t('checkin.summary_org')}</p>
              <p className="text-lg font-medium" data-testid="checkin-summary-org">{selectedOrg.name}</p>
            </div>

            <div>
              <p className="overline mb-3">{t('checkin.per_material')}</p>
              <ul className="border-y border-border divide-y divide-border">
                {Object.entries(groupedByMaterial).map(([m, kg]) => (
                  <li key={m} className="py-3 flex justify-between text-sm" data-testid={`checkin-summary-mat-${m}`}>
                    <span className="font-medium">{t(MATERIAL_LABEL_KEYS[m])}</span>
                    <span>{kg.toFixed(2)} kg</span>
                  </li>
                ))}
              </ul>
            </div>

            {items.some((i) => i.description) && (
              <div>
                <p className="overline mb-3">{t('checkin.notes')}</p>
                <ul className="border-y border-border divide-y divide-border">
                  {items.filter((i) => i.description).map((it, i) => (
                    <li key={i} className="py-2 text-sm" data-testid={`checkin-summary-note-${i}`}>
                      <span className="font-medium">{t(MATERIAL_LABEL_KEYS[it.material])}</span>{' '}
                      <span className="text-muted-foreground">({it.weightKg} kg)</span>
                      <p className="text-xs italic mt-0.5">{it.description}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t-2 border-foreground pt-4 flex justify-between items-baseline">
              <p className="overline">{t('checkin.total')}</p>
              <p className="text-3xl font-bold tracking-tight" data-testid="checkin-summary-total">
                {totalKg.toFixed(2)} kg
              </p>
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/40 px-3 py-2" data-testid="checkin-error">
                {error}
              </p>
            )}

            <div className="flex justify-between">
              <button onClick={() => setStep(2)} className="btn-ghost" data-testid="checkin-step3-back">← {t('common.back')}</button>
              <button
                onClick={confirmCheckin}
                disabled={busy}
                className="btn-primary"
                data-testid="checkin-confirm-btn"
              >
                {busy ? t('checkin.in_progress') : t('checkin.confirm_btn')}
              </button>
            </div>
          </section>
        )}

        {/* STEP 4: success */}
        {step === 4 && (
          <section className="space-y-6 text-center pt-6" data-testid="checkin-step-4">
            <div
              className="inline-flex items-center justify-center w-16 h-16 mx-auto text-3xl text-foreground"
              style={{ backgroundColor: '#ADEBB3' }}
            >
              ✓
            </div>
            <h2 className="text-3xl font-bold tracking-tight">{t('checkin.success_title')}</h2>
            <p className="text-foreground/80 leading-relaxed max-w-md mx-auto">
              <Trans
                i18nKey="checkin.success_body"
                values={{ org: selectedOrg.name, kg: confirmedTotal.toFixed(2) }}
              >
                <span className="font-medium" data-testid="checkin-success-org" />
                {' heeft '}
                <span className="font-medium" data-testid="checkin-success-kg" />
                {' materiaal gedoneerd aan het magazijn.'}
              </Trans>
            </p>
            <p className="text-sm text-muted-foreground">
              {t('checkin.success_thanks')}
            </p>
            <button
              onClick={resetAll}
              className="btn-primary"
              data-testid="checkin-restart-btn"
            >
              {t('checkin.restart_btn')}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
