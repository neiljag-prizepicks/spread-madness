import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App.tsx";
import "./index.css";

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <BrowserRouter>
      {clientId ? (
        <GoogleOAuthProvider clientId={clientId}>
          <App />
        </GoogleOAuthProvider>
      ) : (
        <App />
      )}
    </BrowserRouter>
  </StrictMode>
);

createRoot(root).render(app);
