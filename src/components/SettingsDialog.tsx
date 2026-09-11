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
          <span data-i18n="Latence">Latence</span>
          <select
            id="latency-setting"
            onChange={(e) => actions.setLatency?.(e.currentTarget.value)}
          >
            <option value="stable" data-i18n="Stable">
              Stable
            </option>
            <option value="low" data-i18n="Faible">
              Faible
            </option>
          </select>
        </label>
        <label>
          <span data-i18n="Chat en spotlight">Chat in spotlight</span>
          <select
            id="spotlight-chat-setting"
            onChange={(e) => actions.setSpotlightChat?.(e.currentTarget.value)}
          >
            <option value="off" data-i18n="Inactif">
              Off
            </option>
            <option value="on" data-i18n="Actif">
              On
            </option>
          </select>
        </label>
        <label>
          <span data-i18n="Position du chat en spotlight">
            Spotlight chat position
          </span>
          <select
            id="spotlight-chat-position-setting"
            onChange={(e) =>
              actions.setSpotlightChatPosition?.(e.currentTarget.value)
            }
          >
            <option value="auto" data-i18n="Auto">
              Auto
            </option>
            <option value="top" data-i18n="Top">
              Top
            </option>
            <option value="bottom" data-i18n="Bottom">
              Bottom
            </option>
            <option value="left" data-i18n="Left">
              Left
            </option>
            <option value="right" data-i18n="Right">
              Right
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
