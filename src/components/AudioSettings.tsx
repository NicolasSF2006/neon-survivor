import { useEffect, useRef, useState } from 'react';
import type { AudioManager } from '../audio/AudioManager';
import type { AudioPreferences } from '../audio/preferences';

export function AudioSettings({ audio, preferences }: { audio?: AudioManager; preferences: AudioPreferences }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (open) element?.showModal();
    else element?.close();
    return () => { if (element?.open) element.close(); };
  }, [open]);

  return <>
    <button type="button" className="audio-settings-button" aria-label={preferences.muted ? 'Configurações de áudio — silenciado' : 'Configurações de áudio'} aria-haspopup="dialog" disabled={!audio}
      onClick={() => { audio?.interfaceSound(); setOpen(true); }}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z" />
        {preferences.muted ? <path d="m16 9 5 6m0-6-5 6" /> : <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />}</svg>
    </button>
    <dialog ref={dialog} className="audio-dialog" aria-labelledby="audio-title" onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onKeyDown={event => event.stopPropagation()}>
      <div className="audio-heading"><h2 id="audio-title">ÁUDIO</h2>
        <button type="button" className="audio-close" aria-label="Fechar configurações de áudio" onClick={() => { audio?.interfaceSound(); setOpen(false); }}>×</button>
      </div>
      <label htmlFor="music-volume">Música <output htmlFor="music-volume">{Math.round(preferences.music * 100)}%</output></label>
      <input id="music-volume" type="range" min="0" max="100" step="1" value={Math.round(preferences.music * 100)} onChange={event => audio?.setMusicVolume(Number(event.target.value) / 100)} />
      <label htmlFor="effects-volume">Efeitos <output htmlFor="effects-volume">{Math.round(preferences.effects * 100)}%</output></label>
      <input id="effects-volume" type="range" min="0" max="100" step="1" value={Math.round(preferences.effects * 100)} onChange={event => audio?.setEffectsVolume(Number(event.target.value) / 100)} onPointerUp={() => audio?.interfaceSound()} />
    </dialog>
  </>;
}
