import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Houdt de <title> en <meta name="description"> tags synchroon met de
 * actief gekozen taal (nl/fr). Rendert zelf niets, enkel side-effect.
 */
export default function DocumentMeta() {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    document.title = t('meta.title');

    let descriptionTag = document.querySelector('meta[name="description"]');
    if (!descriptionTag) {
      descriptionTag = document.createElement('meta');
      descriptionTag.setAttribute('name', 'description');
      document.head.appendChild(descriptionTag);
    }
    descriptionTag.setAttribute('content', t('meta.description'));

    document.documentElement.lang = i18n.language;
  }, [t, i18n.language]);

  return null;
}
