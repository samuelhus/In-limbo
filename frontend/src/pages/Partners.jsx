import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';

const CATEGORY_ORDER = [
  'beeldende_kunsten', 'educatie', 'jeugdwerk', 'podiumkunsten',
  'sociaal_werk', 'sport', 'noodopvang', 'ander',
];

export default function Partners() {
  const { t } = useTranslation();
  const [orgs, setOrgs] = useState([]);

  useEffect(() => {
    api.get('/organisations', { params: { validated_only: true } })
      .then(({ data }) =>
        setOrgs(data.filter((o) => o.status === 'validated' || o.status === 'active'))
      )
      .catch(() => {});
  }, []);

  const grouped = orgs.reduce((acc, o) => {
    const c = o.category || 'ander';
    (acc[c] = acc[c] || []).push(o);
    return acc;
  }, {});

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-12" data-testid="partners-page">
      <p className="overline mb-2">{t('partners.overline')}</p>
      <h1 className="text-5xl font-bold tracking-tight mb-12">{t('partners.title')}</h1>

      {CATEGORY_ORDER.map((cat) => {
        const catOrgs = grouped[cat];
        if (!catOrgs?.length) return null;
        return (
          <div key={cat} className="mb-12 border-t border-border pt-8" data-testid={`partner-category-${cat}`}>
            <p className="overline mb-4">{t(`org_categories.${cat}`)}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {catOrgs.map((org) => (
                <Link
                  key={org.id}
                  to={`/organisaties/${org.id}`}
                  data-testid={`partner-link-${org.id}`}
                  className="border border-border px-4 py-3 text-sm hover:bg-muted transition-colors"
                >
                  {org.name}
                </Link>
              ))}
            </div>
          </div>
        );
      })}

      {orgs.length === 0 && (
        <p className="text-muted-foreground">{t('partners.empty')}</p>
      )}
    </div>
  );
}
