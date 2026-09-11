import type { WorkspaceActions } from "../types/actions";
import { Dialog } from "./Dialog";
export function SettingsDialog({ actions }: { actions: WorkspaceActions }) {
  return (
    <Dialog id="settings-dialog" title="Réglages">
      <div id="preferences">
        <label>
          <span data-i18n="Lecteur vidéo">Lecteur vidéo</span>
          <select
            id="player-setting"
            onChange={(e) => actions.setPlayer?.(e.currentTarget.value)}
          >
            <option value="embed" data-i18n="">
              Embed Twitch
            </option>
            <option value="custom" data-i18n="">
              Lecteur custom
            </option>
          </select>
        </label>
        <label>
          <span data-i18n="Langue">Langue</span>
          <select
            id="language-setting"
            onChange={(e) => actions.setLanguage?.(e.currentTarget.value)}
          >
            <option value="fr">FR</option>
            <option value="en">EN</option>
            <option value="nl">NL</option>
          </select>
        </label>
        <label>
          <span data-i18n="Thème">Thème</span>
          <select
            id="theme-setting"
            onChange={(e) => actions.setTheme?.(e.currentTarget.value)}
          >
            <option value="system">Auto</option>
            <option value="light" data-i18n="Clair">
              Clair
            </option>
            <option value="dark" data-i18n="Sombre">
              Sombre
            </option>
          </select>
        </label>
      </div>
    </Dialog>
  );
}
