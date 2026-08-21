import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// PRD_Schat_of_Schroot.md §4.2 stap 2-3: beide velden verplicht, geen lege
// velden toegelaten. Op vraag van product (na de eerste UI-doorloop) toont
// dit meteen beide vragen samen i.p.v. vraag 2 pas na een "Volgende"-klik op
// vraag 1 te onthullen — enter in vraag 1 springt gewoon naar vraag 2, enter
// in vraag 2 verstuurt. Vraag 1 krijgt automatisch de focus zodra dit
// formulier verschijnt (net na een swipe naar rechts), zodat je direct kan
// beginnen typen zonder eerst zelf het veld te moeten aantikken.
export default function EvaluationForm({ onSubmit, busy }) {
  const { t } = useTranslation();
  const [answer1, setAnswer1] = useState('');
  const [answer2, setAnswer2] = useState('');
  const [touched, setTouched] = useState(false);
  const answer1Ref = useRef(null);
  const answer2Ref = useRef(null);

  useEffect(() => {
    answer1Ref.current?.focus();
  }, []);

  const submit = () => {
    if (!answer1.trim() || !answer2.trim()) {
      setTouched(true);
      return;
    }
    onSubmit(answer1.trim(), answer2.trim());
  };

  const handleKeyDown = (e, action) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      action();
    }
  };

  return (
    <div className="max-w-sm mx-auto px-4" data-testid="game-evaluation-form">
      <div className="mb-4">
        <label className="label-overline" htmlFor="game-answer1">{t('game.evaluate.question1')}</label>
        <textarea
          id="game-answer1"
          ref={answer1Ref}
          className="input-flat resize-none"
          rows={2}
          value={answer1}
          onChange={(e) => setAnswer1(e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, () => answer2Ref.current?.focus())}
          disabled={busy}
          maxLength={500}
          data-testid="game-answer1-input"
        />
        {touched && !answer1.trim() && (
          <p className="text-destructive text-xs mt-1">{t('game.evaluate.required')}</p>
        )}
      </div>

      <div className="mb-4">
        <label className="label-overline" htmlFor="game-answer2">{t('game.evaluate.question2')}</label>
        <textarea
          id="game-answer2"
          ref={answer2Ref}
          className="input-flat resize-none"
          rows={2}
          value={answer2}
          onChange={(e) => setAnswer2(e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, submit)}
          disabled={busy}
          maxLength={500}
          data-testid="game-answer2-input"
        />
        {touched && !answer2.trim() && (
          <p className="text-destructive text-xs mt-1">{t('game.evaluate.required')}</p>
        )}
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="btn-primary !py-2 w-full"
        data-testid="game-evaluation-submit"
      >
        {busy ? t('game.evaluate.submitting') : t('game.evaluate.submit')}
      </button>
    </div>
  );
}
