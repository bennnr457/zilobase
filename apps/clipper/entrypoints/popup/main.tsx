import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppIconProvider } from "@/components/icons";

import "../../assets/clipper.css";
import { PopupApp } from "./app";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppIconProvider>
      <PopupApp />
    </AppIconProvider>
  </StrictMode>,
);
