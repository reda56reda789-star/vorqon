// VORQON installable-app (PWA) state — mirrors the Muse artifact store's
// install layer: captures Chrome's `beforeinstallprompt` so the in-app
// install button can fire the browser's real prompt, tracks installed /
// standalone state, and detects iOS (which has no native prompt and needs
// Share → Add to Home Screen instructions instead).
import { useEffect, useState } from 'react';

let deferredPrompt = null;
let installedFlag = false;
const listeners = new Set();

function emit() {
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installedFlag = true;
    deferredPrompt = null;
    emit();
  });
}

export function isStandaloneNow() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
  } catch { /* ignore */ }
  return window.navigator && window.navigator.standalone === true;
}

export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iphone|ipad|ipod/i.test(ua)) return true;
  // iPadOS 13+ reports as Macintosh but has touch points.
  return /macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
}

export function isAndroid() {
  if (typeof navigator === 'undefined') return false;
  return /android/i.test(navigator.userAgent || '');
}

/** Ask the install banner to (re)appear with the iOS help expanded. */
export function showInstallHelp() {
  try {
    localStorage.removeItem('vorqon-pwa-dismissed');
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('vorqon:install-help'));
}

export function usePwaInstall() {
  const [, setTick] = useState(0);
  const [standalone, setStandalone] = useState(isStandaloneNow);

  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    listeners.add(bump);
    let mq = null;
    const onMq = () => setStandalone(isStandaloneNow());
    try {
      mq = window.matchMedia('(display-mode: standalone)');
      if (mq.addEventListener) mq.addEventListener('change', onMq);
    } catch { mq = null; }
    return () => {
      listeners.delete(bump);
      try {
        if (mq && mq.removeEventListener) mq.removeEventListener('change', onMq);
      } catch { /* ignore */ }
    };
  }, []);

  return {
    canPrompt: deferredPrompt !== null,
    installed: installedFlag,
    standalone,
    ios: isIOS(),
    promptInstall: async () => {
      if (!deferredPrompt) return false;
      const ev = deferredPrompt;
      try {
        await ev.prompt();
        const choice = await ev.userChoice;
        deferredPrompt = null;
        if (choice.outcome === 'accepted') installedFlag = true;
        emit();
        return choice.outcome === 'accepted';
      } catch {
        return false;
      }
    },
  };
}
