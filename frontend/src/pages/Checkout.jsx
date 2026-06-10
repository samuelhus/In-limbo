import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api, formatApiError } from '@/lib/api';


const MATERIALS = [
  'Hout', 'Metaal', 'Plastic', 'Steen', 'Textiel',
  'Electro', 'Vloeistof', 'Papier', 'Isolatie', 'Ander',
];

function StepIndicator({ step }) {
  return (
    <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground mb-10" data-testid="checkout-steps">
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

export default function Checkout() {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [items, setItems] = useState([]);
  const [currentMaterial, setCurrentMaterial] = useState('Hout');
  const [currentWeight, setCurrentWeight] = useState('');
  const materialSelectRef = useRef(null);
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
    setItems([...items, { material: currentMaterial, weightKg: kg }]);
setCurrentWeight('');
setTimeout(() => materialSelectRef.current?.focus(), 0);
  };

  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));

  const confirmCheckout = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post('/checkout', {
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
    setConfirmedTotal(0);
    setError('');
  };

  return (
    <div className="min-h-screen bg-background" data-testid="checkout-page">
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-12">
        <p className="overline mb-3">In Limbo · {t('nav.warehouse')}</p>
        <h1 className="text-4xl font-bold tracking-tight mb-2">{t('checkout.title')}</h1>
        <p className="text-sm text-muted-foreground mb-10">
          Registreer de materialen die je vandaag meeneemt.
        </p>

        {step !== 4 && <StepIndicator step={step} />}

        {/* STEP 1: organisatie kiezen */}
        {step === 1 && (
          <section className="space-y-6" data-testid="checkout-step-1">
            <div>
              <label className="label-overline">Jouw organisatie</label>
              {selectedOrg ? (
                <div
                  className="inline-flex items-center gap-2 border border-foreground bg-surface px-4 py-2"
                  data-testid="checkout-selected-org"
                >
                  <span className="font-medium">{selectedOrg.name}</span>
                  <button
                    onClick={() => { setSelectedOrg(null); setQuery(''); }}
                    className="text-muted-foreground hover:text-foreground"
                    data-testid="checkout-clear-org"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    autoFocus
                    className="input-flat"
                    placeholder="Typ de naam van je organisatie..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    data-testid="checkout-org-search-input"
                  />
                  {suggestions.length > 0 && (
                    <ul className="mt-2 border border-border bg-surface divide-y divide-border" data-testid="checkout-org-suggestions">
                      {suggestions.map((o) => (
                        <li key={o.id}>
                          <button
                            onClick={() => { setSelectedOrg(o); setQuery(o.name); setSuggestions([]); }}
                            data-testid={`checkout-org-option-${o.id}`}
                            className="w-full text-left px-4 py-3 text-sm hover:bg-muted transition-colors"
                          >
                            <span className="font-medium">{o.name}</span>
                            <span className="text-muted-foreground ml-2 text-xs">{o.category}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {query.length >= 2 && suggestions.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-2">Geen resultaten gevonden.</p>
                  )}
                </>
              )}
            </div>
            <button
              onClick={() => setStep(2)}
              disabled={!selectedOrg}
              className="btn-primary"
              data-testid="checkout-step1-next"
            >
              Volgende →
            </button>
          </section>
        )}

        {/* STEP 2: materialen toevoegen */}
        {step === 2 && (
          <section className="space-y-6" data-testid="checkout-step-2">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-3 items-end">
              <div>
                <label className="label-overline">Materiaal</label>
                <select
                  ref={materialSelectRef}
                  className="input-flat"
                  value={currentMaterial}
                  onChange={(e) => setCurrentMaterial(e.target.value)}
                  data-testid="checkout-material-select"
                >
                  {MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="label-overline">Gewicht</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="0.0 kg"
                  className="input-flat"
                  value={currentWeight}
                  onChange={(e) => setCurrentWeight(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
                  data-testid="checkout-weight-input"
                />
              </div>
              <button
                onClick={addItem}
                disabled={!currentWeight || parseFloat(currentWeight) <= 0}
                className="btn-primary !py-3"
                data-testid="checkout-add-item-btn"
              >
                + Toevoegen
              </button>
            </div>

            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="checkout-empty-items">
                Nog niets toegevoegd.
              </p>
            ) : (
              <ul className="border-y border-border divide-y divide-border" data-testid="checkout-items-list">
                {items.map((it, i) => (
                  <li key={i} className="py-3 flex items-center justify-between" data-testid={`checkout-item-${i}`}>
                    <span className="text-sm">
                      <span className="font-medium">{it.material}</span>
                      <span className="text-muted-foreground ml-2">{it.weightKg} kg</span>
                    </span>
                    <button
                      onClick={() => removeItem(i)}
                      className="text-muted-foreground hover:text-destructive text-lg leading-none px-2"
                      data-testid={`checkout-remove-item-${i}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex justify-between">
              <button onClick={() => setStep(1)} className="btn-ghost" data-testid="checkout-step2-back">← Terug</button>
              <button
                onClick={() => setStep(3)}
                disabled={items.length === 0}
                className="btn-primary"
                data-testid="checkout-step2-next"
              >
                Uitchecken →
              </button>
            </div>
          </section>
        )}

        {/* STEP 3: bevestiging */}
        {step === 3 && (
          <section className="space-y-6" data-testid="checkout-step-3">
            <div>
              <p className="overline mb-1">Organisatie</p>
              <p className="text-lg font-medium" data-testid="checkout-summary-org">{selectedOrg.name}</p>
            </div>

            <div>
              <p className="overline mb-3">Per materiaal</p>
              <ul className="border-y border-border divide-y divide-border">
                {Object.entries(groupedByMaterial).map(([m, kg]) => (
                  <li key={m} className="py-3 flex justify-between text-sm" data-testid={`checkout-summary-mat-${m}`}>
                    <span className="font-medium">{m}</span>
                    <span>{kg.toFixed(2)} kg</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t-2 border-foreground pt-4 flex justify-between items-baseline">
              <p className="overline">Totaal</p>
              <p className="text-3xl font-bold tracking-tight" data-testid="checkout-summary-total">
                {totalKg.toFixed(2)} kg
              </p>
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/40 px-3 py-2" data-testid="checkout-error">
                {error}
              </p>
            )}

            <div className="flex justify-between">
              <button onClick={() => setStep(2)} className="btn-ghost" data-testid="checkout-step3-back">← Terug</button>
              <button
                onClick={confirmCheckout}
                disabled={busy}
                className="btn-primary"
                data-testid="checkout-confirm-btn"
              >
                {busy ? 'Bezig…' : 'Bevestig uitcheck ✓'}
              </button>
            </div>
          </section>
        )}

        {/* STEP 4: success */}
        {step === 4 && (
          <section className="space-y-6 text-center pt-6" data-testid="checkout-step-4">
            <div
              className="inline-flex items-center justify-center w-16 h-16 mx-auto text-3xl text-foreground"
              style={{ backgroundColor: '#ADEBB3' }}
            >
              ✓
            </div>
            <h2 className="text-3xl font-bold tracking-tight">Uitcheck geregistreerd!</h2>
            <p className="text-foreground/80 leading-relaxed max-w-md mx-auto">
              <span className="font-medium" data-testid="checkout-success-org">{selectedOrg.name}</span>{' '}
              heeft <span className="font-medium" data-testid="checkout-success-kg">{confirmedTotal.toFixed(2)} kg</span>{' '}
              materiaal meegenomen.
            </p>
            <p className="text-sm text-muted-foreground">
              Bedankt voor je bijdrage aan hergebruik.
            </p>
            <button
              onClick={resetAll}
              className="btn-primary"
              data-testid="checkout-restart-btn"
            >
              Nieuwe uitcheck starten
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
