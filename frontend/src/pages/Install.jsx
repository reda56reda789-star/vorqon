// Install page (/install) — the always-reachable install path. The
// header "Install app" button lands here whenever the browser has not
// offered a native beforeinstallprompt (iOS, Firefox, prompt already
// dismissed/used, in-app webviews…), so every visitor can still install
// VORQON by following the steps for their device. When a native prompt
// IS available, this page offers it directly via a prominent button.
// The section matching the visitor's device is highlighted. When the
// app is already running installed (standalone display mode, or the
// appinstalled event fired), the page simply says so.
import { useTranslation } from 'react-i18next';
import { usePwaInstall, isAndroid } from '../lib/pwa.js';

export default function Install() {
  const { t } = useTranslation();
  const pwa = usePwaInstall();

  const platform = pwa.ios ? 'ios' : isAndroid() ? 'android' : 'desktop';

  const sections = [
    {
      id: 'android',
      title: t('installAndroidTitle'),
      steps: [t('installAndroid1'), t('installAndroid2'), t('installAndroid3')],
    },
    {
      id: 'ios',
      title: t('installIphoneTitle'),
      steps: [t('installIos1'), t('installIos2'), t('installIos3')],
    },
    {
      id: 'desktop',
      title: t('installDesktopTitle'),
      steps: [t('installDesktop1'), t('installDesktop2'), t('installDesktop3')],
    },
  ];

  return (
    <main className="container page">
      <h1>{t('installTitle')}</h1>

      {pwa.standalone || pwa.installed ? (
        <section className="panel install-done">
          <img src="/icons/icon-192.png" alt="" className="install-page-icon" />
          <p className="install-done-text">{t('installAlreadyInstalled')}</p>
        </section>
      ) : (
        <>
          <p className="install-intro">{t('installIntro')}</p>

          {pwa.canPrompt && (
            <section className="panel install-now-panel">
              <img src="/icons/icon-192.png" alt="" className="install-page-icon" />
              <button
                type="button"
                className="install-now-btn"
                onClick={() => void pwa.promptInstall()}
              >
                {t('installNow')}
              </button>
            </section>
          )}

          <div className="install-sections">
            {sections.map((s) => (
              <section
                key={s.id}
                className={`panel install-section${platform === s.id ? ' is-current' : ''}`}
              >
                <h2 className="install-section-title">
                  {s.title}
                  {platform === s.id && (
                    <span className="install-device-badge">{t('installYourDevice')}</span>
                  )}
                </h2>
                <ol className="install-steps">
                  {s.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
