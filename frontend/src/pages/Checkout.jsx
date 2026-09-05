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
  const weightInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmedTotal, setConfirmedTotal] = useState(0);

  // Enkel relevant voor organisaties met studentCheckout aan (zie admin).
  const [checkoutBy, setCheckoutBy] = useState(null); // null | 'student' | 'user'
  const [studentEmail, setStudentEmail] = useState('');
  const [orgUsers, setOrgUsers] = useState([]);
  const [pickedUserId, setPickedUserId] = useState('');

  useEffect(() => {
    if (selectedOrg || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    api.get('/organisations/search', { params: { q: query.trim(), includeInactive: true } })
      .then(({ data }) => { if (!cancelled) setSuggestions(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [query, selectedOrg]);

  useEffect(() => {
    if (!selectedOrg?.studentCheckout) {
      setOrgUsers([]);
      return;
    }
    let cancelled = false;
    api.get(`/organisations/${selectedOrg.id}/checkout-users`)
      .then(({ data }) => { if (!cancelled) setOrgUsers(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedOrg]);

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
        ...(checkoutBy === 'student' ? { checkoutBy: 'student', studentEmail: studentEmail.trim() } : {}),
        ...(checkoutBy === 'user' ? { checkoutBy: 'user', pickedUserId } : {}),
      });
      setConfirmedTotal(data.totalWeightKg);
      setStep(4);
    } catch (e) {
      setError(formatApiError(e) || 'Er liep iets mis. Probeer opnieuw.');
    } finally {
      setBusy(false);
    }
  };

  const clearOrg = () => {
    setSelectedOrg(null);
    setQuery('');
    setCheckoutBy(null);
    setStudentEmail('');
    setPickedUserId('');
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
    setCheckoutBy(null);
    setStudentEmail('');
    setPickedUserId('');
  };

  // Voor organisaties met studentCheckout aan moet de keuze afgerond zijn
  // vóór er verdergegaan kan worden: student -> geldig e-mailadres, bestaande
  // gebruiker -> een gekozen gebruiker.
  const studentFlowResolved = !selectedOrg?.studentCheckout
    || (checkoutBy === 'student' && /\S+@\S+\.\S+/.test(studentEmail.trim()))
    || (checkoutBy === 'user' && !!pickedUserId);

  return (
    <div className="min-h-screen bg-background" data-testid="checkout-page">
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-12">
        <p className="overline mb-3">In Limbo · {t('nav.warehouse')}</p>
        <h1 className="text-4xl font-bold tracking-tight mb-2">{t('checkout.title')}</h1>
        <p className="text-sm text-muted-foreground mb-10">
          {t('checkout.subtitle')}
        </p>

        {step !== 4 && <StepIndicator step={step} />}

        {/* STEP 1: organisatie kiezen */}
        {step === 1 && (
          <section className="space-y-6" data-testid="checkout-step-1">
            <div>
              <label className="label-overline" htmlFor="checkout-org-search-input">{t('checkout.find_org')}</label>
              {selectedOrg ? (
                <div
                  className="inline-flex items-center gap-2 border border-foreground bg-surface px-4 py-2"
                  data-testid="checkout-selected-org"
                >
                  <span className="font-medium">{selectedOrg.name}</span>
                  {selectedOrg.status === 'inactive' && (
                    <span
                      className="text-xs uppercase tracking-wide bg-muted text-muted-foreground px-2 py-0.5"
                      data-testid="checkout-selected-org-inactive-badge"
                    >
                      {t('checkout.inactive_org_badge')}
                    </span>
                  )}
                  <button
                    onClick={clearOrg}
                    className="text-muted-foreground hover:text-foreground w-8 h-8 inline-flex items-center justify-center text-xl -mr-1"
                    data-testid="checkout-clear-org"
                  >
                    ×
                  </button>
                </div>
              ) : null}
              {!selectedOrg && (
                <>
                  <input
                    id="checkout-org-search-input"
                    type="text"
                    className="input-flat"
                    placeholder={t('checkout.type_org_name')}
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
                            className="w-full text-left px-4 py-4 text-sm hover:bg-muted active:bg-muted transition-colors"
                          >
                            <span className="font-medium">{o.name}</span>
                            <span className="text-muted-foreground ml-2 text-xs">{t(`org_categories.${o.category}`)}</span>
                            {o.status === 'inactive' && (
                              <span
                                className="ml-2 text-xs uppercase tracking-wide bg-muted text-muted-foreground px-2 py-0.5"
                                data-testid={`checkout-org-option-${o.id}-inactive-badge`}
                              >
                                {t('checkout.inactive_org_badge')}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {query.length >= 2 && suggestions.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-2">{t('checkout.no_results')}</p>
                  )}
                </>
              )}
            </div>

            {selectedOrg?.studentCheckout && (
              <div data-testid="checkout-student-flow">
                <label className="label-overline">{t('checkout.checkout_by_label')}</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCheckoutBy('student')}
                    className={`px-4 py-2 text-sm border ${checkoutBy === 'student' ? 'bg-foreground text-background border-foreground' : 'border-border text-foreground/70'}`}
                    data-testid="checkout-by-student"
                  >
                    {t('checkout.checkout_by_student')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckoutBy('user')}
                    className={`px-4 py-2 text-sm border ${checkoutBy === 'user' ? 'bg-foreground text-background border-foreground' : 'border-border text-foreground/70'}`}
                    data-testid="checkout-by-user"
                  >
                    {t('checkout.checkout_by_user')}
                  </button>
                </div>

                {checkoutBy === 'student' && (
                  <div className="mt-4">
                    <label className="label-overline" htmlFor="checkout-student-email-input">{t('checkout.student_email_label')}</label>
                    <input
                      id="checkout-student-email-input"
                      type="email"
                      className="input-flat"
                      placeholder={t('checkout.student_email_placeholder')}
                      value={studentEmail}
                      onChange={(e) => setStudentEmail(e.target.value)}
                      data-testid="checkout-student-email-input"
                    />
                  </div>
                )}

                {checkoutBy === 'user' && (
                  <div className="mt-4">
                    <label className="label-overline" htmlFor="checkout-pick-user-select">{t('checkout.pick_user_label')}</label>
                    <select
                      id="checkout-pick-user-select"
                      className="input-flat"
                      value={pickedUserId}
                      onChange={(e) => setPickedUserId(e.target.value)}
                      data-testid="checkout-pick-user-select"
                    >
                      <option value="">{t('checkout.pick_user_placeholder')}</option>
                      {orgUsers.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                    {orgUsers.length === 0 && (
                      <p className="text-xs text-muted-foreground mt-2">{t('checkout.no_org_users')}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setStep(2)}
              disabled={!selectedOrg || !studentFlowResolved}
              className="btn-primary"
              data-testid="checkout-step1-next"
            >
              {t('common.next')} →
            </button>
          </section>
        )}

        {/* STEP 2: materialen toevoegen */}
        {step === 2 && (
          <section className="space-y-6" data-testid="checkout-step-2">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-3 items-end">
              <div>
                <label className="label-overline" htmlFor="checkout-material-select">{t('checkout.material_label')}</label>
                <select
                  id="checkout-material-select"
                  ref={materialSelectRef}
                  className="input-flat"
                  value={currentMaterial}
                  onChange={(e) => {
                    setCurrentMaterial(e.target.value);
                    weightInputRef.current?.focus();
                  }}
                  data-testid="checkout-material-select"
                >
                  {MATERIALS.map((m) => <option key={m} value={m}>{t(MATERIAL_LABEL_KEYS[m])}</option>)}
                </select>
              </div>
              <div>
                <label className="label-overline" htmlFor="checkout-weight-input">{t('checkout.weight_label')}</label>
                <input
                  id="checkout-weight-input"
                  ref={weightInputRef}
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0.1"
                  placeholder={t('checkout.weight_placeholder')}
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
                {t('checkout.add_btn')}
              </button>
            </div>

            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="checkout-empty-items">
                {t('checkout.empty_items')}
              </p>
            ) : (
              <ul className="border-y border-border divide-y divide-border" data-testid="checkout-items-list">
                {items.map((it, i) => (
                  <li key={i} className="py-3 flex items-center justify-between" data-testid={`checkout-item-${i}`}>
                    <span className="text-sm">
                      <span className="font-medium">{t(MATERIAL_LABEL_KEYS[it.material])}</span>
                      <span className="text-muted-foreground ml-2">{it.weightKg} kg</span>
                    </span>
                    <button
                      onClick={() => removeItem(i)}
                      className="text-muted-foreground hover:text-destructive text-xl leading-none w-10 h-10 inline-flex items-center justify-center -mr-2"
                      data-testid={`checkout-remove-item-${i}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex justify-between">
              <button onClick={() => setStep(1)} className="btn-ghost" data-testid="checkout-step2-back">← {t('common.back')}</button>
              <button
                onClick={() => setStep(3)}
                disabled={items.length === 0}
                className="btn-primary"
                data-testid="checkout-step2-next"
              >
                {t('checkout.checkout_btn')}
              </button>
            </div>
          </section>
        )}

        {/* STEP 3: bevestiging */}
        {step === 3 && (
          <section className="space-y-6" data-testid="checkout-step-3">
            <div>
              <p className="overline mb-1">{t('checkout.summary_org')}</p>
              <p className="text-lg font-medium" data-testid="checkout-summary-org">{selectedOrg.name}</p>
              {checkoutBy === 'student' && (
                <p className="text-sm text-muted-foreground mt-1" data-testid="checkout-summary-student">
                  {t('checkout.checkout_by_student')}: {studentEmail.trim()}
                </p>
              )}
              {checkoutBy === 'user' && pickedUserId && (
                <p className="text-sm text-muted-foreground mt-1" data-testid="checkout-summary-picked-user">
                  {orgUsers.find((u) => u.id === pickedUserId)?.name}
                </p>
              )}
            </div>

            <div>
              <p className="overline mb-3">{t('checkout.per_material')}</p>
              <ul className="border-y border-border divide-y divide-border">
                {Object.entries(groupedByMaterial).map(([m, kg]) => (
                  <li key={m} className="py-3 flex justify-between text-sm" data-testid={`checkout-summary-mat-${m}`}>
                    <span className="font-medium">{t(MATERIAL_LABEL_KEYS[m])}</span>
                    <span>{kg.toFixed(2)} kg</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t-2 border-foreground pt-4 flex justify-between items-baseline">
              <p className="overline">{t('checkout.total')}</p>
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
              <button onClick={() => setStep(2)} className="btn-ghost" data-testid="checkout-step3-back">← {t('common.back')}</button>
              <button
                onClick={confirmCheckout}
                disabled={busy}
                className="btn-primary"
                data-testid="checkout-confirm-btn"
              >
                {busy ? t('checkout.in_progress') : t('checkout.confirm_btn')}
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
            <h2 className="text-3xl font-bold tracking-tight">{t('checkout.success_title')}</h2>
            <p className="text-foreground/80 leading-relaxed max-w-md mx-auto">
              <Trans
                i18nKey="checkout.success_body"
                values={{ org: selectedOrg.name, kg: confirmedTotal.toFixed(2) }}
              >
                <span className="font-medium" data-testid="checkout-success-org" />
                {' heeft '}
                <span className="font-medium" data-testid="checkout-success-kg" />
                {' materiaal meegenomen.'}
              </Trans>
            </p>
            <p className="text-sm text-muted-foreground">
              {t('checkin.success_thanks')}
            </p>
            <button
              onClick={resetAll}
              className="btn-primary"
              data-testid="checkout-restart-btn"
            >
              {t('checkout.restart_btn')}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
