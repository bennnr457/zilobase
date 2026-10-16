import "@xyflow/react/dist/style.css";

import { ReactFlowProvider } from "@xyflow/react";

import { FlowCanvas } from "./components/flow-canvas";

export default function CanvasScreen() {
  return (
    <main className="h-full">
      <ReactFlowProvider>
        <FlowCanvas />
      </ReactFlowProvider>
    </main>
  );
}
