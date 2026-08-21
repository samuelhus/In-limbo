import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, formatApiError } from '@/lib/api';
import { useGameAuth } from '@/contexts/GameAuthContext';
import useGameSounds from '@/hooks/useGameSounds';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import SwipeCard from './SwipeCard';
import SwipeArrows from './SwipeArrows';
import EvaluationForm from './EvaluationForm';
import ChooseBestPanel from './ChooseBestPanel';
import Scoreboard from './Scoreboard';
import Confetti from './Confetti';
import SoundToggle from './SoundToggle';
import InfoModal from './InfoModal';

// Kern van de reeks (TECHDESIGN_Schat_of_Schroot.md §3):
// 1. GET /series bij start -> lijst van max. 6 listings.
// 2. Per listing: swipe/klik links = POST /swipe (reject) -> volgende;
//    rechts = toon EvaluationForm (geen server-call, zie routes/game.py).
// 3. Na POST /evaluate: isFirstEvaluator -> volgende listing; anders ->
//    ChooseBestPanel -> POST /choose-best -> volgende listing.
// 4. Lijst leeg (of <6) bij een nieuwe /series-call -> Scoreboard.
export default function GamePlay() {
  const { t } = useTranslation();
  const { gameUser, logout } = useGameAuth();
  const sounds = useGameSounds();

  const [items, setItems] = useState(null); // null = laden
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState('card'); // card | evaluate | choose | finished
  const [topEvaluations, setTopEvaluations] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confettiBurst, setConfettiBurst] = useState(0);
  const [playedCount, setPlayedCount] = useState(0); // onderscheidt "net een lege pool" van "reeks net uitgespeeld"

  const loadSeries = useCallback(async () => {
    setError('');
    setItems(null);
    try {
      const { data } = await api.get('/game/series');
      setItems(data.items);
      setIndex(0);
      setPhase(data.items.length > 0 ? 'card' : 'finished');
    } catch (e) {
      setError(formatApiError(e));
      setItems([]);
      setPhase('finished');
    }
  }, []);

  useEffect(() => { loadSeries(); }, [loadSeries]);

  const advance = useCallback(() => {
    setPlayedCount((n) => n + 1);
    const next = index + 1;
    if (items && next < items.length) {
      setIndex(next);
      setPhase('card');
    } else {
      loadSeries();
    }
  }, [items, index, loadSeries]);

  const listing = items && items[index];

  const handleSwipe = async (direction) => {
    if (!listing || busy) return;
    sounds.play('swipe');
    if (direction === 'left') {
      try {
        await api.post('/game/swipe', { listingId: listing.id, direction: 'left' });
      } catch {
        // best-effort: een mislukte reject-registratie blokkeert het spel niet
        // (in het slechtste geval komt deze listing later nog eens terug)
      }
      advance();
    } else {
      setPhase('evaluate');
    }
  };

  const handleEvaluationSubmit = async (answer1, answer2) => {
    if (!listing) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/game/evaluate', { listingId: listing.id, answer1, answer2 });
      sounds.play('success');
      setConfettiBurst((n) => n + 1);
      if (data.isFirstEvaluator) {
        setTimeout(() => { setBusy(false); advance(); }, 700);
      } else {
        setTopEvaluations(data.topEvaluations);
        setBusy(false);
        setPhase('choose');
      }
    } catch (e) {
      setBusy(false);
      setError(formatApiError(e));
    }
  };

  const handleChooseBest = async (evaluationId) => {
    if (!listing) return;
    try {
      await api.post('/game/choose-best', { listingId: listing.id, evaluationId });
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      advance();
    }
  };

  const total = items?.length || 0;

  return (
    <div className="min-h-[70vh] py-8" data-testid="game-play">
      <div className="max-w-sm mx-auto px-4 flex items-center justify-between mb-6">
        <InfoModal />
        <div className="flex items-center gap-3">
          {phase !== 'finished' && items !== null && (
            <span className="text-xs text-muted-foreground" data-testid="game-progress">
              {index + 1} / {total}
            </span>
          )}
          <LanguageSwitcher />
          <SoundToggle enabled={sounds.enabled} onToggle={() => sounds.setEnabled((v) => !v)} />
        </div>
      </div>

      {gameUser && (
        <div className="max-w-sm mx-auto px-4 mb-4 flex items-center justify-between text-xs text-muted-foreground">
          <span data-testid="game-username">{t('game.playing_as', { username: gameUser.username })}</span>
          <button type="button" onClick={logout} className="hover:text-foreground industrial-link" data-testid="game-logout-btn">
            {t('game.logout')}
          </button>
        </div>
      )}

      {error && (
        <p className="max-w-sm mx-auto px-4 text-destructive text-sm mb-4" data-testid="game-error">{error}</p>
      )}

      {items === null && phase !== 'finished' && (
        <p className="text-center text-muted-foreground" data-testid="game-loading">{t('game.loading')}</p>
      )}

      {phase === 'card' && listing && (
        <>
          <SwipeCard listing={listing} onSwipe={handleSwipe} />
          <SwipeArrows onSwipe={handleSwipe} disabled={busy} />
        </>
      )}

      {phase === 'evaluate' && listing && (
        <>
          <SwipeCard listing={listing} compact />
          <EvaluationForm onSubmit={handleEvaluationSubmit} busy={busy} />
        </>
      )}

      {phase === 'choose' && listing && (
        <>
          <SwipeCard listing={listing} compact />
          <ChooseBestPanel evaluations={topEvaluations} onChoose={handleChooseBest} />
        </>
      )}

      {phase === 'finished' && (
        <Scoreboard onPlayAgain={loadSeries} emptyPool={playedCount === 0} />
      )}

      <Confetti trigger={confettiBurst} />
    </div>
  );
}
