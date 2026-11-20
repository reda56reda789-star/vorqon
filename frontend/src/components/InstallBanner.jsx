// Dismissible PWA install banner, shown below the header — mirrors the
// Muse artifact store's install banner. Appears only when the app can
// actually be installed: Chrome/Edge offered a native prompt, or the
// visitor is on iOS (manual Share → Add to Home Screen steps instead).
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePwaInstall } from '../lib/pwa.js';

const DISMISS_KEY = 'vorqon-pwa-dismissed';

export default function InstallBanner() {
  const { t } = useTranslation();
  const pwa = usePwaInstall();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [showHelp, setShowHelp] = useState(false);

  // The header "Mobile app" button asks the banner to come back with the
  // iOS instructions expanded (e.g. after an earlier dismissal).
  useEffect(() => {
    const onHelp = () => {
      setDismissed(false);
      setShowHelp(true);
    };
    window.addEventListener('vorqon:install-help', onHelp);
    return () => window.removeEventListener('vorqon:install-help', onHelp);
  }, []);

  if (pwa.standalone || pwa.installed || dismissed) return null;
  if (!pwa.canPrompt && !pwa.ios) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch { /* ignore */ }
  };

  const onInstall = () => {
    if (pwa.canPrompt) {
      void pwa.promptInstall();
    } else {
      setShowHelp((v) => !v);
    }
  };

  return (
    <div className="install-banner" role="region" aria-label={t('installApp')}>
      <div className="install-banner-main">
        <img src="/icons/icon-192.png" alt="" className="install-banner-icon" />
        <p className="install-banner-text">{t('installBanner')}</p>
        <button type="button" className="install-banner-btn" onClick={onInstall}>
          {t('installNow')}
        </button>
        <button type="button" className="install-banner-close" onClick={dismiss} aria-label={t('installDismiss')}>
          ✕
        </button>
      </div>
      {showHelp && pwa.ios && !pwa.canPrompt && (
        <ol className="install-banner-steps">
          <li>{t('installIos1')}</li>
          <li>{t('installIos2')}</li>
          <li>{t('installIos3')}</li>
        </ol>
      )}
    </div>
  );
}
