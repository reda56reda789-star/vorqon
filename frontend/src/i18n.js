// i18n — Arabic is the default (ar, RTL). English is fully supported (en, LTR).
// Switching language also switches document.dir automatically.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './i18n/ar.json';
import en from './i18n/en.json';

const saved = localStorage.getItem('vorqon-lang');
const lang = saved === 'en' || saved === 'ar' ? saved : 'ar';

i18n.use(initReactI18next).init({
  resources: { ar: { translation: ar }, en: { translation: en } },
  lng: lang,
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
});

document.documentElement.lang = i18n.language;
document.documentElement.dir = i18n.language === 'ar' ? 'rtl' : 'ltr';
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr';
  localStorage.setItem('vorqon-lang', lng);
});

export default i18n;
