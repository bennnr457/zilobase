import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppIconProvider } from "@/components/icons";

import "../../assets/clipper.css";
import { OptionsApp } from "./app";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppIconProvider>
      <OptionsApp />
    </AppIconProvider>
  </StrictMode>,
);
