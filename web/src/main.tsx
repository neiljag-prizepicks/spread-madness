import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App.tsx";
import { RootErrorBoundary } from "./RootErrorBoundary.tsx";
import "./index.css";

const clientId = String(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").trim();

if (import.meta.env.DEV) {
  console.log("[spread-madness] VITE_GOOGLE_CLIENT_ID", clientId || "(empty)", {
    length: clientId.length,
  });
}

const root = document.getElementById("root");
if (!root) {
  document.body.innerHTML =
    "<p style=\"font-family:system-ui;padding:2rem;\">Missing <code>#root</code> — check <code>index.html</code>.</p>";
} else {
  const app = (
    <StrictMode>
      <RootErrorBoundary>
        <BrowserRouter>
          {clientId ? (
            <GoogleOAuthProvider clientId={clientId}>
              <App />
            </GoogleOAuthProvider>
          ) : (
            <App />
          )}
        </BrowserRouter>
      </RootErrorBoundary>
    </StrictMode>
  );

  createRoot(root).render(app);
}
