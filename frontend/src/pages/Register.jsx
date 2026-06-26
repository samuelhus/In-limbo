import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { api, formatApiError } from '@/lib/api';
import InfoHint from '@/components/InfoHint';

const ORG_CATEGORY_KEYS = [
  'beeldende_kunsten', 'jeugdwerk', 'podiumkunsten', 'noodopvang',
  'sociaal_werk', 'sport', 'educatie', 'ander',
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

  const [step, setStep] = useState(1);
  const [path, setPath] = useState(null);
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [user, setUser] = useState({
    firstName: '', lastName: '', email: '', phone: '', password: '',
  });
  const [org, setOrg] = useState({
    orgName: '', orgDescription: '', orgCategory: 'beeldende_kunsten',
    orgAddress: '', orgWebsite: '', orgVisibleOnPartnerPage: true,
  });
  const [orgQuery, setOrgQuery] = useState('');
  const [orgResults, setOrgResults] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState(null);

  useEffect(() => {
    if (path !== 'existing') return;
    if (orgQuery.length < 2) { setOrgResults([]); return; }
    let cancel = false;
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/organisations', { params: { q: orgQuery } });
        if (!cancel) setOrgResults(data);
      } catch {/* ignore */}
    }, 250);
    return () => { cancel = true; clearTimeout(timer); };
  }, [orgQuery, path]);

  const next = () => setStep((s) => s + 1);
  const back = () => setStep((s) => Math.max(1, s - 1));

  const submit = async () => {
    setError('');
    setSubmitting(true);
    let res;
    if (path === 'new') {
      res = await registerNewOrg({ ...user, ...org, acceptedTerms: true });
    } else {
      res = await registerExistingOrg({ ...user, organisationId: selectedOrgId, acceptedTerms: true });
    }
    setSubmitting(false);
    if (!res.ok) { setError(res.error); return; }
    navigate('/wachtkamer');
  };

  const canNextStep1 = terms;
  const canNextStep2 = path !== null;
  const canNextStep3 = user.firstName && user.lastName && user.email && user.password.length >= 8;
  const canSubmit = path === 'new'
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
          <h2 className="text-2xl font-semibold">{t('register.terms_title')}</h2>
          <div className="border-t border-border pt-6 space-y-3 text-sm text-foreground/80 leading-relaxed">
            <p>{t('register.terms_intro')}</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>{t('register.terms_1')}</li>
              <li>{t('register.terms_2')}</li>
              <li>{t('register.terms_3')}</li>
              <li>{t('register.terms_4')}</li>
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
            <span className="text-sm">{t('register.terms_accept')}</span>
          </label>
          <div className="flex justify-between">
            <Link to="/" className="btn-ghost" data-testid="register-cancel">← {t('common.cancel')}</Link>
            <button onClick={next} disabled={!canNextStep1} className="btn-primary" data-testid="register-step1-next">
              {t('common.volgende')}
            </button>
          </div>
        </section>
      )}

      {/* STEP 2: Choose path */}
      {step === 2 && (
        <section className="space-y-6" data-testid="register-step-2">
          <h2 className="text-2xl font-semibold">{t('register.path_title')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => setPath('new')}
              data-testid="register-path-new"
              className={`text-left p-6 border transition-all hover:-translate-y-0.5 ${
                path === 'new' ? 'border-foreground bg-foreground text-background' : 'border-border bg-surface'
              }`}
            >
              <p className="overline mb-3">{t('register.option_a')}</p>
              <p className="text-lg font-medium">{t('register.new_org')}</p>
              <p className={`mt-2 text-sm ${path === 'new' ? 'text-background/80' : 'text-muted-foreground'}`}>
                {t('register.new_org_desc')}
              </p>
            </button>
            <button
              onClick={() => setPath('existing')}
              data-testid="register-path-existing"
              className={`text-left p-6 border transition-all hover:-translate-y-0.5 ${
                path === 'existing' ? 'border-foreground bg-foreground text-background' : 'border-border bg-surface'
              }`}
            >
              <p className="overline mb-3">{t('register.option_b')}</p>
              <p className="text-lg font-medium">{t('register.existing_org')}</p>
              <p className={`mt-2 text-sm ${path === 'existing' ? 'text-background/80' : 'text-muted-foreground'}`}>
                {t('register.existing_org_desc')}
              </p>
            </button>
          </div>
          <div className="flex justify-between">
            <button onClick={back} className="btn-ghost" data-testid="register-step2-back">← {t('common.terug')}</button>
            <button onClick={next} disabled={!canNextStep2} className="btn-primary" data-testid="register-step2-next">
              {t('common.volgende')}
            </button>
          </div>
        </section>
      )}

      {/* STEP 3: Personal details */}
      {step === 3 && (
        <section className="space-y-6" data-testid="register-step-3">
          <h2 className="text-2xl font-semibold">{t('register.personal_title')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-overline">{t('register.firstname')}</label>
              <input className="input-flat" data-testid="register-firstname" value={user.firstName}
                onChange={(e) => setUser({...user, firstName: e.target.value})} />
            </div>
            <div>
              <label className="label-overline">{t('register.lastname')}</label>
              <input className="input-flat" data-testid="register-lastname" value={user.lastName}
                onChange={(e) => setUser({...user, lastName: e.target.value})} />
            </div>
          </div>
          <div>
            <label className="label-overline">
              {t('register.email')}
              <InfoHint text={t('register.contact_hint')} testId="register-email-hint" />
            </label>
            <input type="email" className="input-flat" data-testid="register-email" value={user.email}
              onChange={(e) => setUser({...user, email: e.target.value})} />
          </div>
          <div>
            <label className="label-overline">
              {t('register.phone')} <span className="text-muted-foreground normal-case">({t('common.optioneel')})</span>
              <InfoHint text={t('register.contact_hint')} testId="register-phone-hint" />
            </label>
            <input className="input-flat" data-testid="register-phone" value={user.phone}
              onChange={(e) => setUser({...user, phone: e.target.value})} />
          </div>
          <div>
            <label className="label-overline">{t('register.password')} <span className="text-muted-foreground normal-case">({t('register.password_hint')})</span></label>
            <input type="password" className="input-flat" data-testid="register-password" value={user.password}
              onChange={(e) => setUser({...user, password: e.target.value})} />
          </div>
          <div className="flex justify-between">
            <button onClick={back} className="btn-ghost" data-testid="register-step3-back">← {t('common.terug')}</button>
            <button onClick={next} disabled={!canNextStep3} className="btn-primary" data-testid="register-step3-next">
              {t('common.volgende')}
            </button>
          </div>
        </section>
      )}

      {/* STEP 4: New org */}
      {step === 4 && path === 'new' && (
        <section className="space-y-6" data-testid="register-step-4-new">
          <h2 className="text-2xl font-semibold">{t('register.org_title')}</h2>
          <div>
            <label className="label-overline">{t('register.org_name')}</label>
            <input className="input-flat" data-testid="register-org-name" value={org.orgName}
              onChange={(e) => setOrg({...org, orgName: e.target.value})} />
          </div>
          <div>
            <label className="label-overline">{t('register.org_description')}</label>
            <textarea rows={4} className="input-flat" data-testid="register-org-description" value={org.orgDescription}
              onChange={(e) => setOrg({...org, orgDescription: e.target.value})} />
          </div>
          <div>
            <label className="label-overline">{t('register.org_category')}</label>
            <select className="input-flat" data-testid="register-org-category" value={org.orgCategory}
              onChange={(e) => setOrg({...org, orgCategory: e.target.value})}>
              {ORG_CATEGORY_KEYS.map((key) => <option key={key} value={key}>{t(`org_categories.${key}`)}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-overline">{t('register.org_address')} <span className="text-muted-foreground normal-case">({t('common.optioneel')})</span></label>
              <input className="input-flat" data-testid="register-org-address" value={org.orgAddress}
                onChange={(e) => setOrg({...org, orgAddress: e.target.value})} />
            </div>
            <div>
              <label className="label-overline">{t('register.org_website')} <span className="text-muted-foreground normal-case">({t('common.optioneel')})</span></label>
              <input className="input-flat" data-testid="register-org-website" value={org.orgWebsite}
                onChange={(e) => setOrg({...org, orgWebsite: e.target.value})} />
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer pt-2" data-testid="register-org-visible-label">
            <input
              type="checkbox"
              checked={org.orgVisibleOnPartnerPage}
              onChange={(e) => setOrg({ ...org, orgVisibleOnPartnerPage: e.target.checked })}
              data-testid="register-org-visible-checkbox"
              className="mt-1"
            />
            <span className="text-sm">
              <span className="block">{t('register.org_visible_label')}</span>
              <span className="block text-xs text-muted-foreground mt-1">{t('register.org_visible_helper')}</span>
            </span>
          </label>
          {error && (
            <p data-testid="register-error" className="text-sm text-destructive bg-destructive/10 border border-destructive/40 px-3 py-2">{error}</p>
          )}
          <div className="flex justify-between">
            <button onClick={back} className="btn-ghost" data-testid="register-step4-back">← {t('common.terug')}</button>
            <button onClick={submit} disabled={!canSubmit || submitting} className="btn-primary" data-testid="register-submit">
              {submitting ? t('register.submitting') : t('register.submit')}
            </button>
          </div>
        </section>
      )}

      {/* STEP 4: Existing org */}
      {step === 4 && path === 'existing' && (
        <section className="space-y-6" data-testid="register-step-4-existing">
          <h2 className="text-2xl font-semibold">{t('register.select_org_title')}</h2>
          <p className="text-sm text-muted-foreground">{t('register.select_org_hint')}</p>
          <input
            className="input-flat"
            data-testid="register-org-search"
            placeholder={t('register.search_org_placeholder')}
            value={orgQuery}
            onChange={(e) => { setOrgQuery(e.target.value); setSelectedOrgId(null); }}
          />
          {orgQuery.length >= 2 && (
            <ul className="border border-border divide-y divide-border max-h-64 overflow-y-auto bg-surface" data-testid="register-org-results">
              {orgResults.length === 0 && (
                <li className="px-4 py-3 text-sm text-muted-foreground">{t('common.geen_resultaten')}</li>
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
            <button onClick={back} className="btn-ghost" data-testid="register-step4-back">← {t('common.terug')}</button>
            <button onClick={submit} disabled={!canSubmit || submitting} className="btn-primary" data-testid="register-submit">
              {submitting ? t('register.submitting') : t('register.submit')}
            </button>
          </div>
        </section>
      )}

      <p className="mt-10 text-sm text-muted-foreground">
        {t('register.already_account')}{' '}
        <Link to="/login" className="industrial-link text-foreground" data-testid="register-to-login">{t('register.login_link')}</Link>
      </p>
    </div>
  );
}
