import "@/cockpit/resources/cockpit.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { SpikeScreen } from "@/cockpit/entrypoints/ui/spike_screen";
import { CockpitError } from "@/cockpit/models/errors";

const ROOT_ELEMENT_ID = "root";

export function mountCockpit(): void {
  const rootElement = document.getElementById(ROOT_ELEMENT_ID);
  if (rootElement === null) {
    throw new CockpitError(`Missing #${ROOT_ELEMENT_ID} element`);
  }
  createRoot(rootElement).render(
    <StrictMode>
      <SpikeScreen />
    </StrictMode>,
  );
}
