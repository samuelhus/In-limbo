import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// PRD_Schat_of_Schroot.md §4.2 stap 2-3: vraag 1 -> enter -> vraag 2 -> enter
// -> evaluatie compleet. Beide velden verplicht, geen lege velden toegelaten.
export default function EvaluationForm({ onSubmit, busy }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [answer1, setAnswer1] = useState('');
  const [answer2, setAnswer2] = useState('');
  const [touched, setTouched] = useState(false);
  const answer2Ref = useRef(null);

  useEffect(() => {
    if (step === 2) answer2Ref.current?.focus();
  }, [step]);

  const goToStep2 = () => {
    if (!answer1.trim()) {
      setTouched(true);
      return;
    }
    setTouched(false);
    setStep(2);
  };

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
          className="input-flat resize-none"
          rows={2}
          value={answer1}
          onChange={(e) => setAnswer1(e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, goToStep2)}
          disabled={step !== 1 || busy}
          maxLength={500}
          data-testid="game-answer1-input"
        />
        {touched && step === 1 && !answer1.trim() && (
          <p className="text-destructive text-xs mt-1">{t('game.evaluate.required')}</p>
        )}
        {step === 1 && (
          <button
            type="button"
            onClick={goToStep2}
            className="btn-secondary !py-2 mt-3 w-full"
            data-testid="game-answer1-next"
          >
            {t('game.evaluate.next')}
          </button>
        )}
      </div>

      {step === 2 && (
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
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="btn-primary !py-2 mt-3 w-full"
            data-testid="game-answer2-submit"
          >
            {busy ? t('game.evaluate.submitting') : t('game.evaluate.submit')}
          </button>
        </div>
      )}
    </div>
  );
}
