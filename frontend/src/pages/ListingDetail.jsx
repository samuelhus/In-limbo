import React, { useEffect, useState, useCallback } from 'react';
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, formatApiError } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import { cloudinaryThumb } from '@/lib/cloudinary';
import { useAuth } from '@/contexts/AuthContext';
import ApplyModal from '@/components/ApplyModal';

const APP_STATUS_KEYS = {
  open: 'listing.status_open',
  selected: 'listing.status_selected',
  not_selected: 'listing.status_not_selected',
  withdrawn: 'listing.status_withdrawn',
};

export default function ListingDetail() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const [item, setItem] = useState(null);
  const [active, setActive] = useState(0);
  const [applyOpen, setApplyOpen] = useState(false);

  const load = useCallback(() => {
    api.get(`/listings/${id}`).then(({ data }) => setItem(data)).catch(() => setItem(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (item === null) {
    return <div className="max-w-5xl mx-auto px-4 py-24 text-muted-foreground" data-testid="listing-loading">{t('common.loading')}</div>;
  }
  if (item === false) {
    return <div className="max-w-5xl mx-auto px-4 py-24" data-testid="listing-not-found">{t('listing.not_found')}</div>;
  }

  const limited = item.limited;
  const photos = item.photos || [];
  const isDonateur = user && typeof user === 'object' && user.role === 'donateur';
  const isValidated = user && typeof user === 'object' && user.status === 'validated' && !isDonateur;
  const isOwner = !!item.isOwner;
  const isAdmin = isValidated && user.role === 'admin';
  const canManage = isOwner || isAdmin;

  const sameOrg = isValidated && item.organisation && user.organisationId === item.organisation.id;
  const myApp = item.myApplication;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-12" data-testid="listing-detail-page">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
        {/* Photos */}
        <div className="md:col-span-7">
          <div className="aspect-square bg-muted overflow-hidden">
            {photos.length > 0 ? (
              <img
                src={cloudinaryThumb(photos[active], 1400, 1400)}
                alt={item.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">{t('listing.geen_foto')}</div>
            )}
          </div>
          {photos.length > 1 && (
            <div className="mt-3 grid grid-cols-5 gap-2" data-testid="listing-thumbnails">
              {photos.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  className={`aspect-square overflow-hidden border ${i === active ? 'border-foreground' : 'border-transparent'}`}
                  data-testid={`listing-thumb-${i}`}
                >
                  <img src={cloudinaryThumb(p, 200, 200)} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Meta */}
        <div className="md:col-span-5">
          <div className="flex items-center gap-3 mb-4">
            <StatusBadge status={item.status} size="lg" />
            {item.isRecurrent && (
              <span className="overline">{t('listing.recurrent')}</span>
            )}
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-6">{item.title}</h1>

          {limited && (
            <div className="border border-foreground p-6 my-8 bg-surface" data-testid="listing-limited-cta">
              <p className="overline mb-3">{t('listing.limited_view')}</p>
              <p className="text-foreground/85 leading-relaxed">
                {t('listing.loginforinfo')}
              </p>
              <div className="mt-5 flex gap-3">
                <Link to="/login" state={{ from: location.pathname }} className="btn-primary !py-2 !px-4 text-xs">{t('nav.login')}</Link>
                <Link to="/registreer" className="btn-secondary !py-2 !px-4 text-xs">{t('nav.register')}</Link>
              </div>
            </div>
          )}

          {!limited && (
            <>
              <p className="text-foreground/85 leading-relaxed whitespace-pre-wrap mb-8">{item.description}</p>

              <dl className="grid grid-cols-2 gap-y-4 gap-x-6 mb-8 text-sm" data-testid="listing-meta">
                <div>
                  <dt className="overline mb-1">{t('listing.material')}</dt>
                  <dd>{item.material}</dd>
                </div>
                <div>
                  <dt className="overline mb-1">{t('listing.weight')}</dt>
                  <dd>{item.weight} kg</dd>
                </div>
                {item.dimensions && (
                  <div className="col-span-2">
                    <dt className="overline mb-1">{t('listing.dimensions')}</dt>
                    <dd>{item.dimensions}</dd>
                  </div>
                )}
                {item.transport && (
                  <div className="col-span-2">
                    <dt className="overline mb-1">{t('listing.transport')}</dt>
                    <dd>{item.transport}</dd>
                  </div>
                )}
                {item.deadline && (
                  <div>
                    <dt className="overline mb-1">{t('listing.deadline')}</dt>
                    <dd>{new Date(item.deadline).toLocaleDateString(i18n.language === 'fr' ? 'fr-BE' : 'nl-BE')}</dd>
                  </div>
                )}
              </dl>

              {/* Technische fiches */}
              {item.documents && item.documents.length > 0 && (
                <div className="border-t border-border pt-6">
                  <p className="overline mb-3">Technische fiches</p>
                  <ul className="space-y-2">
                    {item.documents.map((url, i) => {
                      const filename = url.split('/').pop().split('?')[0];
                      return (
                        <li key={i}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm text-primary underline underline-offset-2 hover:text-primary/80 transition"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            {decodeURIComponent(filename)}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {item.organisation && item.offererFirstName && (
                <div className="border-t border-border pt-6" data-testid="listing-offerer-block">
                  <p className="text-base">
                    {t('listing.offered_by')} <span className="font-medium">{item.offererFirstName}</span> {t('listing.van')}{' '}
                    <Link
                      to={`/organisaties/${item.organisation.id}`}
                      className="industrial-link font-medium"
                      data-testid="listing-org-link"
                    >
                      {item.organisation.name}
                    </Link>
                  </p>
                </div>
              )}

              {item.offererIsDonateur && item.offererUsername && (
                <div className="border-t border-border pt-6" data-testid="listing-offerer-donateur-block">
                  <p className="text-base">
                    {t('listing.offered_by')} <span className="font-medium">{item.offererUsername}</span>{' '}
                    <span className="text-muted-foreground italic">{t('listing.geen_partner')}</span>
                  </p>
                </div>
              )}

              {item.offererEmail && (
                <div className="mt-6 border border-border p-5 bg-surface" data-testid="listing-recurrent-contact">
                  <p className="overline mb-2">{t('listing.contact_recurrent')}</p>
                  <a href={`mailto:${item.offererEmail}`} className="text-base industrial-link">{item.offererEmail}</a>
                </div>
              )}

              {/* Selected contact banner (applicant side) */}
              {!isOwner && item.selectedApplicantContact && myApp?.status === 'selected' && (
                <SelectedContactBanner contact={item.selectedApplicantContact} title={t('listing.jij_bent_gekozen')} />
              )}

              {/* Applicant flow */}
              {isValidated && !isOwner && (
                <ApplicantPanel
                  listing={item}
                  myApp={myApp}
                  sameOrg={sameOrg}
                  isAdmin={isAdmin}
                  onOpenApply={() => setApplyOpen(true)}
                  onChanged={load}
                />
              )}

              {/* Owner/admin management */}
              {canManage && (
                <OwnerPanel listing={item} isAdmin={isAdmin} onChanged={load} />
              )}
            </>
          )}
        </div>
      </div>

      {applyOpen && (
        <ApplyModal
          listing={item}
          onClose={() => setApplyOpen(false)}
          onSubmitted={() => { setApplyOpen(false); load(); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Applicant panel — shows for non-owner validated viewers
// ---------------------------------------------------------------------------
function ApplicantPanel({ listing, myApp, sameOrg, isAdmin, onOpenApply, onChanged }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const isOwnerOrAdmin = listing.isOwner || isAdmin;
  if (listing.isRecurrent) return null;
  if (listing.status === 'in_magazijn') return null;
  if (listing.status === 'gearchiveerd' && !isOwnerOrAdmin) return null;

  if (sameOrg && !myApp) {
    return (
      <div className="mt-8 border-t border-border pt-6 text-sm text-muted-foreground" data-testid="apply-disabled-same-org">
        {t('listing.eigen_org_fout')}
      </div>
    );
  }

  // Herbestemd — show appropriate message
  if (listing.status === 'herbestemd') {
    if (myApp?.status === 'selected') {
      return null; // selected applicant sees contact block instead
    }
    if (myApp?.status === 'not_selected') {
      return (
        <div className="mt-8 border-t border-border pt-6 text-sm text-foreground/75" data-testid="apply-not-selected">
          {t('listing.niet_geselecteerd_herbestemd')}
        </div>
      );
    }
    return (
      <div className="mt-8 border-t border-border pt-6 text-sm text-muted-foreground" data-testid="apply-disabled-herbestemd">
        {t('listing.reeds_herbestemd')}
      </div>
    );
  }

  // My application states
  if (myApp && myApp.status === 'open') {
    const withdraw = async () => {
      if (!window.confirm(t('listing.confirm_intrekken'))) return;
      setBusy(true);
      try {
        await api.post(`/applications/${myApp.id}/withdraw`);
        onChanged?.();
      } catch (e) { alert(formatApiError(e)); }
      finally { setBusy(false); }
    };
    return (
      <div className="mt-8 border-t border-border pt-6 space-y-3" data-testid="apply-submitted-state">
        <p className="text-sm font-medium">{t('listing.requestvalidated')}</p>
        <p className="text-xs text-muted-foreground italic">{t('listing.motivation')}: "{myApp.motivation}"</p>
        <button onClick={withdraw} disabled={busy} className="btn-secondary !py-2 text-xs" data-testid="apply-withdraw-btn">
          {t('listing.withdraw_btn')}
        </button>
      </div>
    );
  }

  if (myApp && myApp.status === 'not_selected') {
    return (
      <div className="mt-8 border-t border-border pt-6 text-sm text-foreground/75" data-testid="apply-not-selected">
        {t('listing.niet_geselecteerd')}
      </div>
    );
  }

  if (myApp && myApp.status === 'withdrawn') {
    // Can re-apply
    return (
      <div className="mt-8 border-t border-border pt-6 space-y-3" data-testid="apply-withdrawn-state">
        <p className="text-sm text-muted-foreground">{t('listing.previously_withdrawn')}</p>
        {listing.status === 'beschikbaar' && (
          <button onClick={onOpenApply} className="btn-primary" data-testid="apply-reapply-btn">
            {t('listing.apply_btn')}
          </button>
        )}
      </div>
    );
  }

  // No application yet — show apply button if available
  if (listing.status === 'beschikbaar') {
    return (
      <div className="mt-8 border-t border-border pt-6" data-testid="apply-cta-block">
        <button onClick={onOpenApply} className="btn-primary" data-testid="apply-open-modal-btn">
          {t('listing.apply_btn')}
        </button>
      </div>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Owner / admin panel
// ---------------------------------------------------------------------------
function OwnerPanel({ listing, isAdmin, onChanged }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [apps, setApps] = useState([]);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const isEditable =
    ['beschikbaar', 'gearchiveerd'].includes(listing.status) ||
    (isAdmin && listing.status === 'in_magazijn');

  const loadApps = useCallback(async () => {
    try {
      const { data } = await api.get(`/listings/${listing.id}/applications`);
      setApps(data);
    } catch (e) {
      console.warn('load apps failed', e);
    }
  }, [listing.id]);

  useEffect(() => { loadApps(); }, [loadApps, listing.status, listing.selectedApplicantId]);

  const visibleApps = apps.filter((a) => ['open', 'selected'].includes(a.status));
  const openApps = apps.filter((a) => a.status === 'open');
  const selected = apps.find((a) => a.id === listing.selectedApplicantId);
  const formatDate = (iso) => new Date(iso).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' });

  const callAction = async (path) => {
    setBusy(true);
    try {
      await api.post(path);
      onChanged?.();
    } catch (e) { alert(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const selectApplicant = async (applicationId, applicantName) => {
    if (!window.confirm(t('listing.confirm_selecteer', { name: applicantName || t('listing.deze_aanvrager') }))) return;
    setBusy(true);
    try {
      await api.post(`/listings/${listing.id}/select-applicant`, { applicationId });
      onChanged?.();
    } catch (e) { alert(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const confirmDelete = async () => {
    setBusy(true);
    setDeleteError('');
    try {
      await api.delete(`/listings/${listing.id}`);
      setDeleteOpen(false);
      navigate('/mijn-aanbiedingen');
    } catch (e) {
      setDeleteError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const canDelete = listing.status !== 'herbestemd';

  return (
    <div className="mt-10 border-t border-border pt-6" data-testid="owner-panel">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <p className="overline">{t('listing.applications')} · {visibleApps.length}</p>
        <div className="flex flex-wrap gap-2">
          {listing.status === 'beschikbaar' && (
            <button
              onClick={() => {
                if (!window.confirm(t('listing.rehome_confirm'))) return;
                callAction(`/listings/${listing.id}/mark-rehomed`);
              }}
              disabled={busy}
              className="inline-flex items-center justify-center px-4 py-2 bg-green-600 text-white text-xs font-medium tracking-wide transition-all duration-200 hover:bg-green-700 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
              data-testid="owner-mark-rehomed-btn"
            >
              {t('listing.mark_rehomed_btn')}
            </button>
          )}
          {listing.status === 'herbestemd' && (
            <button
              onClick={() => {
                if (!window.confirm(t('listing.confirm_herbestemming_ongedaan'))) return;
                callAction(`/listings/${listing.id}/unrehome`);
              }}
              disabled={busy}
              className="btn-secondary !py-2 text-xs"
              data-testid="owner-unrehome-btn"
            >
              {t('listing.unrehome_btn')}
            </button>
          )}
          {isEditable && (
            <button
              onClick={() => navigate(`/aanbieding/${listing.id}/bewerken`)}
              className="btn-secondary !py-2 text-xs"
              data-testid="owner-edit-btn"
            >
              {t('common.edit')}
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => { setDeleteError(''); setDeleteOpen(true); }}
              disabled={busy}
              data-testid="delete-listing-button"
              className="inline-flex items-center justify-center px-4 py-2 bg-red-600 text-white text-xs font-medium tracking-wide transition-all duration-200 hover:bg-red-700 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
              style={{ borderRadius: 2 }}
            >
              {t('listing.delete_listing_btn')}
            </button>
          )}
        </div>
      </div>

      {listing.status === 'herbestemd' && selected && (
        <div className="mb-6 border border-foreground bg-surface p-5" data-testid="owner-selected-block">
          <p className="overline mb-2">{t('listing.selected_recipient')}</p>
          <p className="font-medium">
            {selected.applicant.firstName} {selected.applicant.lastName}{' '}
            <span className="text-muted-foreground font-normal">
              · {selected.applicant.organisationName}
            </span>
          </p>
          {selected.applicant.email && (
            <p className="text-sm mt-2">
              <a href={`mailto:${selected.applicant.email}`} className="industrial-link">{selected.applicant.email}</a>
            </p>
          )}
          {selected.applicant.phone && (
            <p className="text-sm">
              <a href={`tel:${selected.applicant.phone}`} className="industrial-link">{selected.applicant.phone}</a>
            </p>
          )}
          <p className="text-xs text-muted-foreground italic mt-3">"{selected.motivation}"</p>
          <button
            onClick={() => {
              if (!window.confirm(t('listing.undo_rehome_confirm'))) return;
              callAction(`/listings/${listing.id}/unrehome`);
            }}
            disabled={busy}
            className="btn-secondary !py-1.5 px-3 text-xs mt-4"
            data-testid="owner-unselect-btn"
          >
            {t('listing.undo_rehome_btn')}
          </button>
        </div>
      )}

      {openApps.length === 0 && listing.status === 'beschikbaar' && (
        <p className="text-sm text-muted-foreground" data-testid="owner-no-apps">{t('listing.no_applications')}</p>
      )}

      {openApps.length > 0 && listing.status === 'beschikbaar' && (
        <ul className="divide-y divide-border border-y border-border">
          {openApps.map((a) => (
            <li key={a.id} className="py-4 grid grid-cols-1 md:grid-cols-12 gap-4" data-testid={`owner-app-${a.id}`}>
              <div className="md:col-span-8">
                <p className="font-medium">
                  {a.applicant.firstName} {a.applicant.lastName}
                  {' · '}
                  <Link
                    to={`/organisaties/${a.applicant.organisationId}`}
                    className="industrial-link text-foreground/85"
                  >
                    {a.applicant.organisationName}
                  </Link>
                </p>
                <p className="text-xs text-muted-foreground mt-1">{formatDate(a.createdAt)}</p>
                {a.applicant.email && (
                  <p className="text-sm mt-2">
                    <a href={`mailto:${a.applicant.email}`} className="industrial-link">{a.applicant.email}</a>
                  </p>
                )}
                {a.applicant.phone && (
                  <p className="text-sm">
                    <a href={`tel:${a.applicant.phone}`} className="industrial-link">{a.applicant.phone}</a>
                  </p>
                )}
                <p className="text-sm mt-2 text-foreground/80 italic">"{a.motivation}"</p>
              </div>
              <div className="md:col-span-4 md:flex md:justify-end items-start">
                <button
                  onClick={() => selectApplicant(a.id, `${a.applicant.firstName} ${a.applicant.lastName || ''}`.trim())}
                  disabled={busy}
                  className="btn-primary !py-2 text-xs"
                  data-testid={`owner-select-${a.id}`}
                >
                  {t('listing.select_rehome_btn')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {deleteOpen && (
        <DeleteConfirmModal
          busy={busy}
          error={deleteError}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation modal
// ---------------------------------------------------------------------------
function DeleteConfirmModal({ busy, error, onCancel, onConfirm }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6 animate-fade-in"
      onClick={onCancel}
      data-testid="delete-modal-overlay"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-surface p-6 sm:p-8 border-t sm:border border-border"
        data-testid="delete-modal"
      >
        <h2 className="text-2xl font-bold tracking-tight mb-3">{t('listing.delete_title')}</h2>
        <p className="text-foreground/80 leading-relaxed text-sm mb-6">
          {t('listing.delete_confirm')}
        </p>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 border border-destructive/40 px-3 py-2 mb-4" data-testid="delete-error">
            {error}
          </p>
        )}

        <div className="flex justify-between gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="btn-ghost"
            data-testid="cancel-delete-button"
          >
            Annuleren
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            data-testid="confirm-delete-button"
            className="inline-flex items-center justify-center px-5 py-2.5 bg-red-600 text-white text-sm font-medium tracking-wide transition-all duration-200 hover:bg-red-700 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
            style={{ borderRadius: 2 }}
          >
            {busy ? t('listing.verwijderen_bezig') : t('listing.definitief_verwijderen')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Jij bent gekozen!" banner
// ---------------------------------------------------------------------------
function SelectedContactBanner({ contact, title }) {
  const { t } = useTranslation();
  return (
    <div
      className="mt-8 border-l-4 border-l-green-700 border border-green-700/30 bg-green-50 p-5"
      data-testid="selected-contact-banner"
    >
      <p className="overline text-green-900 mb-2">{title}</p>
      <p className="text-foreground text-sm mb-3 leading-relaxed">
        {t('listing.geselecteerd_contact')}
        om een afspraak te maken.
      </p>
      <p className="font-semibold text-foreground">
        {contact.firstName} {contact.lastName}
        {contact.organisationName && (
          <span className="text-foreground/70 font-normal"> · {contact.organisationName}</span>
        )}
      </p>
      {contact.email && (
        <p className="text-sm mt-2">
          <a href={`mailto:${contact.email}`} className="industrial-link text-foreground" data-testid="selected-contact-email">{contact.email}</a>
        </p>
      )}
      {contact.phone && (
        <p className="text-sm">
          <a href={`tel:${contact.phone}`} className="industrial-link text-foreground" data-testid="selected-contact-phone">{contact.phone}</a>
        </p>
      )}
    </div>
  );
}
