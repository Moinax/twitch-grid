import type { WorkspaceActions } from "./types/actions";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { createViews } from "./components/render";
import { App } from "./App";
import { startWorkspace } from "./controllers/workspace";
import "./styles/index.css";

const actions: WorkspaceActions = {};
const views = createViews();
const root = createRoot(document.getElementById("root")!);
flushSync(() => root.render(<App views={views} actions={actions} />));
const dispose = startWorkspace(views, actions);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    dispose();
    root.unmount();
  });
}
