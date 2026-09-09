import type { WorkspaceActions } from "./types/actions";
import { DynamicViews, type WorkspaceViews } from "./components/render";
import { Landing } from "./components/Landing";
import { Sidebar } from "./components/Sidebar";
import { ChannelPreview } from "./components/ChannelPreview";
import { Workspace } from "./components/Workspace";
import { AudioPrompt } from "./components/AudioPrompt";
import { GridDialog } from "./components/GridDialog";

export function App({
  views,
  actions,
}: {
  views: WorkspaceViews;
  actions: WorkspaceActions;
}) {
  return (
    <>
      <Landing actions={actions} />
      <Sidebar actions={actions} />
      <ChannelPreview />
      <Workspace actions={actions} />
      <AudioPrompt />
      <GridDialog actions={actions} />
      <DynamicViews views={views} />
    </>
  );
}
