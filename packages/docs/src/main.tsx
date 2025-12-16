import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

import { App } from "./App";
import "./styles/globals.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Root element not found");
}

// Remove trailing slash for basename (React Router requirement)
const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>
);

