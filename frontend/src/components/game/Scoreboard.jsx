import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, formatApiError } from '@/lib/api';
import { useGameAuth } from '@/contexts/GameAuthContext';

// PRD_Schat_of_Schroot.md §5: algemeen leaderboard maandelijks + all-time
// ernaast (beide zichtbaar) — hier als 2 tabs i.p.v. naast elkaar, zelfde
// hand-gerolde tab-knop-stijl als elders in de admin (geen shadcn Tabs-
// primitief nodig, dat wordt nergens anders in de app gebruikt).
export default function Scoreboard({ onPlayAgain, emptyPool }) {
  const { t } = useTranslation();
  const { gameUser } = useGameAuth();
  const [scope, setScope] = useState('alltime');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setRows(null);
    setError('');
    api.get('/game/leaderboard', { params: { scope } })
      .then(({ data }) => setRows(data))
      .catch((e) => setError(formatApiError(e)));
  }, [scope]);

  return (
    <div className="max-w-md mx-auto px-4 py-12" data-testid="game-scoreboard">
      <p className="overline mb-2">{t('game.scoreboard.overline')}</p>
      <h1 className="text-3xl font-bold tracking-tight mb-6">{t('game.scoreboard.heading')}</h1>

      {emptyPool && (
        <p className="text-sm text-muted-foreground mb-6" data-testid="game-scoreboard-empty-pool">
          {t('game.scoreboard.empty_pool')}
        </p>
      )}

      <div className="flex gap-2 mb-6 border-b border-border">
        <TabButton active={scope === 'alltime'} onClick={() => setScope('alltime')} testId="game-scoreboard-tab-alltime">
          {t('game.scoreboard.tab_alltime')}
        </TabButton>
        <TabButton active={scope === 'monthly'} onClick={() => setScope('monthly')} testId="game-scoreboard-tab-monthly">
          {t('game.scoreboard.tab_monthly')}
        </TabButton>
      </div>

      {error && <p className="text-destructive text-sm mb-4" data-testid="game-scoreboard-error">{error}</p>}
      {rows === null && !error && <p className="text-muted-foreground text-sm">{t('game.scoreboard.loading')}</p>}
      {rows && rows.length === 0 && <p className="text-muted-foreground text-sm">{t('game.scoreboard.empty')}</p>}
      {rows && rows.length > 0 && (
        <ol className="divide-y divide-border border-y border-border" data-testid="game-scoreboard-list">
          {rows.map((row, i) => (
            <li
              key={`${row.username}-${i}`}
              className={`flex items-center justify-between py-3 px-1 ${row.username === gameUser?.username ? 'bg-[#ADEBB3]/30' : ''}`}
            >
              <span className="flex items-center gap-3">
                <span className="overline w-6 text-center">{i + 1}</span>
                <span className="font-medium">{row.username}</span>
              </span>
              <span className="text-sm text-muted-foreground">{t('game.scoreboard.points', { count: row.points })}</span>
            </li>
          ))}
        </ol>
      )}

      <button onClick={onPlayAgain} className="btn-primary w-full mt-8" data-testid="game-play-again">
        {t('game.scoreboard.play_again')}
      </button>
    </div>
  );
}

function TabButton({ active, onClick, children, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`px-4 py-3 text-sm border-b-2 transition-colors ${
        active ? 'border-foreground text-foreground font-medium' : 'border-transparent text-foreground/70 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}
