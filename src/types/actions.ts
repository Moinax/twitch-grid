import type { KeyboardEvent, FormEvent } from "react";

// Views receive commands as props; the workspace supplies their implementations at startup.
export interface WorkspaceActions {
  toggleSidebar?: () => void;
  toggleMute?: () => void;
  togglePlayback?: () => void;
  searchInput?: () => void;
  clearSearch?: () => void;
  addLogin?: () => void;
  searchKey?: (event: KeyboardEvent<HTMLInputElement>) => void;
  connect?: () => void;
  disconnect?: () => void;
  findStreamer?: () => void;
  continueGuest?: () => void;
  showLanding?: () => void;
  setLanguage?: (value: string) => void;
  setTheme?: (value: string) => void;
  openGrids?: () => void;
  openGridManager?: () => void;
  toggleGridMenu?: (element: HTMLDetailsElement) => void;
  toggleLock?: () => void;
  copyGrid?: () => void;
  newGrid?: () => void;
  cancelGridForm?: () => void;
  submitGridForm?: (event: FormEvent<HTMLFormElement>) => void;
  clearGridError?: () => void;
}
