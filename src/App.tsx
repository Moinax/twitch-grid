import type { WorkspaceActions } from "./types/actions";
import { DynamicViews, type WorkspaceViews } from "./components/render";
import { Landing } from "./components/Landing";
import { Sidebar } from "./components/Sidebar";
import { ChannelPreview } from "./components/ChannelPreview";
import { Workspace } from "./components/Workspace";
import { AudioPrompt } from "./components/AudioPrompt";
import { GridDialog } from "./components/GridDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { SoundBoardPanel } from "./components/SoundBoard";

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
      <div id="tooltip" role="tooltip" hidden></div>
      <ChannelPreview />
      <Workspace actions={actions} />
      <AudioPrompt />
      <GridDialog actions={actions} />
      <SettingsDialog actions={actions} />
      <SoundBoardPanel actions={actions} />
      <DynamicViews views={views} />
    </>
  );
}
