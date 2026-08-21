import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// PRD_Schat_of_Schroot.md §4.1: aan/uit-knop naast het info-icoon, standaard
// aan. Zie hooks/useGameSounds.js voor de eigenlijke geluidsgeneratie.
export default function SoundToggle({ enabled, onToggle }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={enabled}
      aria-label={enabled ? t('game.sound.on_label') : t('game.sound.off_label')}
      data-testid="game-sound-toggle"
      className="inline-flex items-center justify-center w-8 h-8 text-foreground/70 hover:text-foreground transition-colors"
    >
      {enabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
    </button>
  );
}
