import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { api, formatApiError } from '@/lib/api';

const ORG_CATEGORIES = [
  'Beeldende kunsten', 'Jeugdwerk', 'Podiumkunsten', 'Squat',
  'Sociaal werk', 'Sport', 'Educatie', 'Ander',
];

function StepIndicator({ step, max }) {
  return (
    <div className="flex items-center gap-2 mb-10" data-testid="register-step-indicator">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className={`h-px flex-1 transition-all ${
            i + 1 <= step ? 'bg-foreground h-0.5' : 'bg-border'
          }`}
        />
      ))}
      <span className="overline ml-3">{step} / {max}</span>
    </div>
  );
}

export default function Register() {
  const { registerNewOrg, registerExistingOrg } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Step 1: terms → Step 2: pick path → Step 3: user info → Step 4: org info or pick org
  const [step, setStep] = useState(1);
  const [path, setPath] = useState(null); // 'new' | 'existing'
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [user, setUser] = useState({
    firstName: '', lastName: '', email: '', phone: '', password: '',
  });
  const [org, setOrg] = useState({
    orgName: '', orgDescription: '', orgCategory: 'Beeldende kunsten',
    orgAddress: '', orgWebsite: '',
  });
  const [orgQuery, setOrgQuery] = useState('');
  const [orgResults, setOrgResults] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState(null);

  // Search existing orgs
  useEffect(() => {
    if (path !== 'existing') return;
    if (orgQuery.length < 2) { setOrgResults([]); return; }
    let cancel = false;
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/organisations', { params: { q: orgQuery } });
        if (!cancel) setOrgResults(data);
      } catch {/* ignore */}
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [orgQuery, path]);

  const next = () => setStep((s) => s + 1);
  const back = () => setStep((s) => Math.max(1, s - 1));

  const submit = async () => {
    setError('');
    setSubmitting(true);
    let res;
    if (path === 'new') {
      res = await registerNewOrg({
        ...user, ...org, acceptedTerms: true,
      });
    } else {
      res = await registerExistingOrg({
        ...user, organisationId: selectedOrgId, acceptedTerms: true,
      });
    }
    setSubmitting(false);
    if (!res.ok) { setError(res.error); return; }
    navigate('/wachtkamer');
  };

  const canNextStep1 = terms;
  const canNextStep2 = path !== null;
  const canNextStep3 =
    user.firstName && user.lastName && user.email && user.password.length >= 6;
  const canSubmit =
    path === 'new'
      ? org.orgName && org.orgDescription && org.orgCategory
      : !!selectedOrgId;

  return (
    <div className="max-w-2xl mx-auto px-4 py-16" data-testid="register-page">
      <p className="overline mb-4">{t('auth.register_title')}</p>
      <h1 className="text-4xl font-bold tracking-tight mb-10">
        {t('nav.join_member')} in—limbo.
      </h1>

      <StepIndicator step={step} max={4} />

      {/* STEP 1: Terms */}
      {step === 1 && (
        <section className="space-y-6" data-testid="register-step-1">
          <h2 className="text-2xl font-semibold">Voorwaarden</h2>
          <div className="border-t border-border pt-6 space-y-3 text-sm text-foreground/80 leading-relaxed">
            <p>
              In Limbo is een platform voor socio-culturele organisaties in
              Brussel. Door je te registreren ga je akkoord dat:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Je organisatie actief is binnen de socio-culturele sector.</li>
              <li>Aanbiedingen waarheidsgetrouw worden beschreven.</li>
              <li>Je account wordt gevalideerd door een beheerder vóór gebruik.</li>
              <li>Materiaal kosteloos wordt doorgegeven, tenzij anders aangegeven.</li>
            </ul>
          </div>
          <label className="flex items-start gap-3 cursor-pointer" data-testid="register-terms-label">
            <input
              type="checkbox"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
              data-testid="register-terms-checkbox"
              className="mt-1"
            />
            <span className="text-sm">Ik aanvaard de voorwaarden.</span>
          </label>
          <div className="flex justify-between">
            <Link to="/" className="btn-ghost" data-testid="register-cancel">← Annuleren</Link>
            <button onClick={next} disabled={!canNextStep1} className="btn-primary" data-testid="register-step1-next">
              Volgende →
            </button>
          </div>
        </section>
      )}

      {/* STEP 2: Choose path */}
      {step === 2 && (
        <section className="space-y-6" data-testid="register-step-2">
          <h2 className="text-2xl font-semibold">Hoe sluit je je aan?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => setPath('new')}
              data-testid="register-path-new"
              className={`text-left p-6 border transition-all hover:-translate-y-0.5 ${
                path === 'new' ? 'border-foreground bg-foreground text-background' : 'border-border bg-surface'
              }`}
            >
              <p className="overline mb-3">Optie A</p>
              <p className="text-lg font-medium">Nieuwe organisatie</p>
              <p className={`mt-2 text-sm ${path === 'new' ? 'text-background/80' : 'text-muted-foreground'}`}>
                Mijn organisatie staat nog niet op in—limbo.
              </p>
            </button>
            <button
              onClick={() => setPath('existing')}
              data-testid="register-path-existing"
              className={`text-left p-6 border transition-all hover:-translate-y-0.5 ${
                path === 'existing' ? 'border-foreground bg-foreground text-background' : 'border-border bg-surface'
              }`}
            >
              <p className="overline mb-3">Optie B</p>
              <p className="text-lg font-medium">Bestaande organisatie</p>
              <p className={`mt-2 text-sm ${path === 'existing' ? 'text-background/80' : 'text-muted-foreground'}`}>
                Ik sluit me aan bij een organisatie die al lid is.
              </p>
            </button>
          </div>
          <div className="flex justify-between">
            <button onClick={back} className="btn-ghost" data-testid="register-step2-back">← Terug</button>
            <button onClick={next} disabled={!canNextStep2} className="btn-primary" data-testid="register-step2-next">
              Volgende →
            </button>
          </div>
        </section>
      )}

      {/* STEP 3: Personal details */}
      {step === 3 && (
        <section className="space-y-6" data-testid="register-step-3">
          <h2 className="text-2xl font-semibold">Jouw gegevens</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-overline">Voornaam</label>
              <input className="input-flat" data-testid="register-firstname" value={user.firstName}
                onChange={(e) => setUser({...user, firstName: e.target.value})} />
            </div>
            <div>
              <label className="label-overline">Achternaam</label>
              <input className="input-flat" data-testid="register-lastname" value={user.lastName}
                onChange={(e) => setUser({...user, lastName: e.target.value})} />
            </div>
          </div>
          <div>
            <label className="label-overline">E-mailadres</label>
            <input type="email" className="input-flat" data-testid="register-email" value={user.email}
              onChange={(e) => setUser({...user, email: e.target.value})} />
          </div>
          <div>
            <label className="label-overline">Telefoon <span className="text-muted-foreground normal-case">(optioneel)</span></label>
            <input className="input-flat" data-testid="register-phone" value={user.phone}
              onChange={(e) => setUser({...user, phone: e.target.value})} />
          </div>
          <div>
            <label className="label-overline">Wachtwoord <span className="text-muted-foreground normal-case">(min. 6 tekens)</span></label>
            <input type="password" className="input-flat" data-testid="register-password" value={user.password}
              onChange={(e) => setUser({...user, password: e.target.value})} />
          </div>
          <div className="flex justify-between">
            <button onClick={back} className="btn-ghost" data-testid="register-step3-back">← Terug</button>
            <button onClick={next} disabled={!canNextStep3} className="btn-primary" data-testid="register-step3-next">
              Volgende →
            </button>
          </div>
        </section>
      )}

      {/* STEP 4: Org info OR pick org */}
      {step === 4 && path === 'new' && (
        <section className="space-y-6" data-testid="register-step-4-new">
          <h2 className="text-2xl font-semibold">Jouw organisatie</h2>
          <div>
            <label className="label-overline">Naam organisatie</label>
            <input className="input-flat" data-testid="register-org-name" value={org.orgName}
              onChange={(e) => setOrg({...org, orgName: e.target.value})} />
          </div>
          <div>
            <label className="label-overline">Beschrijving</label>
            <textarea rows={4} className="input-flat" data-testid="register-org-description" value={org.orgDescription}
              onChange={(e) => setOrg({...org, orgDescription: e.target.value})} />
          </div>
          <div>
            <label className="label-overline">Categorie</label>
            <select className="input-flat" data-testid="register-org-category" value={org.orgCategory}
              onChange={(e) => setOrg({...org, orgCategory: e.target.value})}>
              {ORG_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-overline">Adres <span className="text-muted-foreground normal-case">(optioneel)</span></label>
              <input className="input-flat" data-testid="register-org-address" value={org.orgAddress}
                onChange={(e) => setOrg({...org, orgAddress: e.target.value})} />
            </div>
            <div>
              <label className="label-overline">Website <span className="text-muted-foreground normal-case">(optioneel)</span></label>
              <input className="input-flat" data-testid="register-org-website" value={org.orgWebsite}
                onChange={(e) => setOrg({...org, orgWebsite: e.target.value})} />
            </div>
          </div>
          {error && (
            <p data-testid="register-error" className="text-sm text-destructive bg-destructive/10 border border-destructive/40 px-3 py-2">{error}</p>
          )}
          <div className="flex justify-between">
            <button onClick={back} className="btn-ghost" data-testid="register-step4-back">← Terug</button>
            <button onClick={submit} disabled={!canSubmit || submitting} className="btn-primary" data-testid="register-submit">
              {submitting ? 'Versturen…' : 'Registratie versturen'}
            </button>
          </div>
        </section>
      )}

      {step === 4 && path === 'existing' && (
        <section className="space-y-6" data-testid="register-step-4-existing">
          <h2 className="text-2xl font-semibold">Selecteer je organisatie</h2>
          <p className="text-sm text-muted-foreground">
            Typ minstens 2 letters. Alleen gevalideerde organisaties verschijnen.
          </p>
          <input
            className="input-flat"
            data-testid="register-org-search"
            placeholder="Organisatie zoeken…"
            value={orgQuery}
            onChange={(e) => { setOrgQuery(e.target.value); setSelectedOrgId(null); }}
          />
          {orgQuery.length >= 2 && (
            <ul className="border border-border divide-y divide-border max-h-64 overflow-y-auto bg-surface" data-testid="register-org-results">
              {orgResults.length === 0 && (
                <li className="px-4 py-3 text-sm text-muted-foreground">Geen resultaten.</li>
              )}
              {orgResults.map((o) => (
                <li key={o.id}>
                  <button
                    onClick={() => setSelectedOrgId(o.id)}
                    data-testid={`register-org-result-${o.id}`}
                    className={`w-full text-left px-4 py-3 hover:bg-muted transition-colors ${
                      selectedOrgId === o.id ? 'bg-foreground text-background hover:bg-foreground' : ''
                    }`}
                  >
                    <span className="font-medium">{o.name}</span>
                    <span className={`block text-xs ${selectedOrgId === o.id ? 'text-background/70' : 'text-muted-foreground'}`}>{o.category}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p data-testid="register-error" className="text-sm text-destructive bg-destructive/10 border border-destructive/40 px-3 py-2">{error}</p>
          )}
          <div className="flex justify-between">
            <button onClick={back} className="btn-ghost" data-testid="register-step4-back">← Terug</button>
            <button onClick={submit} disabled={!canSubmit || submitting} className="btn-primary" data-testid="register-submit">
              {submitting ? 'Versturen…' : 'Registratie versturen'}
            </button>
          </div>
        </section>
      )}

      <p className="mt-10 text-sm text-muted-foreground">
        Al een account?{' '}
        <Link to="/login" className="industrial-link text-foreground" data-testid="register-to-login">Inloggen</Link>
      </p>
    </div>
  );
}
