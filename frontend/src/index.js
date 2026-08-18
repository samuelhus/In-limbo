import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import "@/index.css";
import "@/i18n";
import App from "@/App";

Sentry.init({
  dsn: process.env.REACT_APP_SENTRY_DSN,
  environment: process.env.REACT_APP_ENVIRONMENT || "development",
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 0.2,
  sendDefaultPii: false,
  // Ruis van in-app-browsers (Facebook/Instagram/LinkedIn e.d. op Android) —
  // hun eigen WebView-performance-logger crasht soms intern, los van onze code.
  // Zie: https://github.com/exercism/website/issues/9028 (ongerelateerd project,
  // exact dezelfde foutmelding, bevestigt dat dit een generiek Android-fenomeen is).
  ignoreErrors: [
    "Java object is gone",
    /iabjs:\/\//,
  ],
});

// Umami-analytics: enkel activeren als beide env-vars effectief gezet zijn
// (dus niet in lokale ontwikkeling, tenzij je dat zelf configureert).
if (process.env.REACT_APP_UMAMI_URL && process.env.REACT_APP_UMAMI_WEBSITE_ID) {
  const script = document.createElement("script");
  script.defer = true;
  script.src = `${process.env.REACT_APP_UMAMI_URL}/script.js`;
  script.setAttribute("data-website-id", process.env.REACT_APP_UMAMI_WEBSITE_ID);
  document.head.appendChild(script);
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <Sentry.ErrorBoundary
      fallback={() => (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-6">
          <div className="text-center max-w-md">
            <h1 className="font-heading text-2xl mb-2">Er ging iets mis</h1>
            <p className="text-muted-foreground mb-4">
              Er is een onverwachte fout opgetreden. We zijn hiervan op de hoogte gebracht.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-sm"
            >
              Pagina herladen
            </button>
          </div>
        </div>
      )}
    >
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
);
