import React from 'react';

export default function InstallPrompt() {
  const [deferred, setDeferred] = React.useState<any>(null);
  const [installed, setInstalled] = React.useState(false);

  React.useEffect(() => {
    function onBeforeInstall(e: any) {
      e.preventDefault();
      setDeferred(e);
    }
    function onInstalled() { setInstalled(true); }
    window.addEventListener('beforeinstallprompt', onBeforeInstall as any);
    window.addEventListener('appinstalled', onInstalled as any);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall as any);
      window.removeEventListener('appinstalled', onInstalled as any);
    };
  }, []);

  if (installed) return <span className="text-sm opacity-60">Terpasang</span>;
  if (!deferred) return null;

  return (
    <button
      onClick={() => deferred && deferred.prompt()}
      className="px-3 py-1.5 rounded-xl bg-brand hover:bg-brand-600 text-slate-900 font-semibold"
    >Pasang PWA</button>
  );
}
