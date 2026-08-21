import React from 'react';
import { GameAuthProvider, useGameAuth } from '@/contexts/GameAuthContext';
import GameRegister from '@/components/game/GameRegister';
import GamePlay from '@/components/game/GamePlay';

// Schat of Schroot? (PRD_Schat_of_Schroot.md). Publieke route, geen
// ProtectedRoute: het spel heeft een volledig eigen, losstaand account-
// systeem (zie GameAuthContext) en regelt zijn eigen registratie/login-gate
// hieronder. Taal: gewone i18next-taalkeuze met een toggle in de UI (zie
// GamePlay -> LanguageSwitcher) — geen aparte /spel/nl en /spel/fr links
// meer, op vraag van product (beide talen delen toch dezelfde database).
function GameGate() {
  const { gameUser } = useGameAuth();
  if (gameUser === null) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">
        <span className="overline">Laden…</span>
      </div>
    );
  }
  return gameUser ? <GamePlay /> : <GameRegister />;
}

export default function Game() {
  return (
    <GameAuthProvider>
      <GameGate />
    </GameAuthProvider>
  );
}
