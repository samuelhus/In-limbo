import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * Wachtwoordveld met een 'oogje' om de invoer tijdelijk zichtbaar te maken.
 * Drop-in vervanging voor een gewone <input type="password" ...> — accepteert
 * dezelfde props (value, onChange, placeholder, data-testid, id, ...) en geeft
 * ze allemaal door aan de onderliggende <input>.
 */
export default function PasswordInput({ className = 'input-flat', ...props }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`${className} pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        aria-label={visible ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'}
        tabIndex={-1}
        data-testid={props['data-testid'] ? `${props['data-testid']}-toggle` : undefined}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
