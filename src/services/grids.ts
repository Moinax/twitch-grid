import type { AccountMode, SavedGrid, LayoutSnapshot } from "../types/domain";
import { readStored, writeStored } from "./library";
import { tr } from "./preferences";
// Each account mode owns a separate collection. The old layout remains a compatible snapshot.
export class GridStore {
  mode: AccountMode;
  items: SavedGrid[];
  activeId: string;
  constructor(mode: AccountMode) {
    this.mode = mode;
    const stored = readStored<{ items?: SavedGrid[]; activeId?: string }>(
      "tg.grids." + mode,
      {},
    );
    this.items = Array.isArray(stored.items)
      ? stored.items
          .filter(
            (item) =>
              item &&
              typeof item.id === "string" &&
              item.id.length <= 100 &&
              item.layout &&
              typeof item.layout === "object" &&
              !Array.isArray(item.layout),
          )
          .map((item) => ({
            id: item.id,
            name:
              typeof item.name === "string"
                ? item.name.trim().slice(0, 80)
                : null,
            layout: item.layout,
          }))
      : [];
    this.items = [
      ...new Map(this.items.map((item) => [item.id, item])).values(),
    ];
    if (!this.items.length)
      this.items = [
        {
          id: "default",
          name: null,
          layout: readStored("tg.layout." + mode, {}),
        },
      ];
    if (
      mode === "connected" &&
      !this.items.some((item) => item.id === "live-follows")
    )
      this.items.push({
        id: "live-follows",
        name: null,
        layout: { order: [], locked: true },
      });
    this.activeId = this.items.some((item) => item.id === stored.activeId)
      ? stored.activeId!
      : this.items[0].id;
  }
  get active() {
    return this.items.find((item) => item.id === this.activeId)!;
  }
  label(item = this.active) {
    return item.id === "live-follows"
      ? tr("Follows en direct")
      : item.name || tr("Grille par défaut");
  }
  persist() {
    return writeStored("tg.grids." + this.mode, {
      activeId: this.activeId,
      items: this.items,
    });
  }
  save(layout: LayoutSnapshot) {
    this.active.layout = layout;
    return this.persist();
  }
  create(name: string, layout: LayoutSnapshot) {
    const item = {
      id: crypto.randomUUID(),
      name,
      layout: structuredClone(layout),
    };
    this.items.push(item);
    this.activeId = item.id;
    this.persist();
    return item;
  }
  select(id: string) {
    if (!this.items.some((item) => item.id === id)) return false;
    this.activeId = id;
    this.persist();
    return true;
  }
  rename(id: string, name: string) {
    this.items.find((item) => item.id === id)!.name = name;
    return this.persist();
  }
  remove(id: string) {
    this.items = this.items.filter((item) => item.id !== id);
    if (!this.items.length)
      this.items = [
        { id: crypto.randomUUID(), name: null, layout: { order: [] } },
      ];
    if (!this.items.some((item) => item.id === this.activeId))
      this.activeId = this.items[0].id;
    return this.persist();
  }
}
