// Shared fetch-failure state for list surfaces (home lists, search
// results, checkout, admin lists). A failed fetch must never render
// as the "empty" message — during DB connection drops the lists used
// to flash "no products" for data that actually exists. Shows the
// error (or the generic loadError string) plus a retry button.
import { useTranslation } from 'react-i18next';

export default function ListError({ message, onRetry }) {
  const { t } = useTranslation();
  return (
    <section className="panel" role="alert">
      <p className="error-text" style={{ marginTop: 0 }}>{message || t('loadError')}</p>
      {onRetry && (
        <button type="button" className="btn-small" onClick={onRetry}>{t('retry')}</button>
      )}
    </section>
  );
}
