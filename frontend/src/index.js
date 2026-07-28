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
});

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
