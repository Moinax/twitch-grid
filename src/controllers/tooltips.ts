import { preferences } from "../services/preferences";
import type { createLifecycle } from "./lifecycle";

// Every title shows as a styled tooltip, the attribute stepping aside while the pointer or the focus
// is on the element so the browser's own tooltip stays quiet, and coming back as soon as they leave.
// The Twitch embed pauses as soon as anything covers it: under that player the titles stay stashed
// for good and nothing is ever shown over a tile.
export function syncPlayerTooltips(
  lifecycle: ReturnType<typeof createLifecycle>,
) {
  const { MutationObserver, addEventListener, setTimeout, signal } = lifecycle;
  const tooltip = document.getElementById("tooltip")!;
  const suppressed = () => preferences.player !== "custom";
  let tipTarget: HTMLElement | null = null;
  let tipTimer: number | undefined;
  function stashTitle(el: HTMLElement) {
    if (!el.hasAttribute("title")) return;
    el.dataset.tip = el.getAttribute("title")!;
    if (
      el.matches("button, summary, input, select, a") &&
      (!el.hasAttribute("aria-label") || el.dataset.tipLabel === "true")
    ) {
      el.setAttribute("aria-label", el.dataset.tip!);
      el.dataset.tipLabel = "true";
    }
    el.removeAttribute("title");
  }
  function restoreTitle(el: HTMLElement) {
    const tip = el.dataset.tip;
    if (tip === undefined) return; // an empty title is a title too: the tile metadata clears it that way
    if (el.dataset.tipLabel === "true") {
      el.removeAttribute("aria-label"); // the label only stood in for the tooltip
      delete el.dataset.tipLabel;
    }
    delete el.dataset.tip;
    el.setAttribute("title", tip);
  }
  function syncTooltipTitles(root: Document | HTMLElement = document) {
    const selector = suppressed() ? "[title]:not(iframe)" : "[data-tip]";
    const apply = suppressed() ? stashTitle : restoreTitle;
    if (root instanceof HTMLElement && root.matches(selector)) apply(root);
    for (const el of root.querySelectorAll<HTMLElement>(selector)) apply(el);
  }
  function showTip(el: HTMLElement, delay: number) {
    hideTip();
    stashTitle(el);
    if (!el.dataset.tip) return;
    tipTarget = el;
    if (suppressed()) return;
    tipTimer = setTimeout(() => {
      if (tipTarget !== el || !el.isConnected) return;
      const side = el.closest("#side")?.getBoundingClientRect();
      const contained = side && !document.body.classList.contains("collapsed");
      tooltip.style.maxWidth = contained
        ? `${Math.min(320, side.width - 16)}px`
        : "";
      tooltip.classList.toggle("sidebar-tip", !!contained);
      tooltip.textContent = el.dataset.tip!;
      tooltip.hidden = false;
      const box = el.getBoundingClientRect(),
        width = tooltip.offsetWidth,
        height = tooltip.offsetHeight;
      // Keep sidebar tooltips off the video surface when there is room in the sidebar.
      const right = contained ? side.right : innerWidth;
      // the volume hangs under the sound button: its tooltip goes below the slider
      const popover = el.closest(".snd-wrap")?.querySelector(".volume");
      const bottom = popover
        ? popover.getBoundingClientRect().bottom
        : box.bottom;
      const x = Math.min(
        Math.max(8, box.left + box.width / 2 - width / 2),
        right - width - 8,
      );
      const y =
        bottom + height + 16 > innerHeight ? box.top - height - 8 : bottom + 8;
      tooltip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      tooltip.classList.add("in");
    }, delay);
  }
  function hideTip() {
    clearTimeout(tipTimer);
    if (!suppressed() && tipTarget) restoreTitle(tipTarget);
    tipTarget = null;
    tooltip.classList.remove("in");
    tooltip.hidden = true;
  }
  const tipSource = (target: EventTarget | null) => {
    const el =
      target instanceof Element
        ? target.closest<HTMLElement>("[title], [data-tip]")
        : null;
    return el && el.tagName !== "IFRAME" ? el : null;
  };
  document.addEventListener(
    "pointerover",
    (event) => {
      const el = tipSource(event.target);
      if (el && el !== tipTarget && event.pointerType !== "touch")
        showTip(el, 400);
    },
    { signal },
  );
  document.addEventListener(
    "pointerout",
    (event) => {
      if (tipTarget && !tipTarget.contains(event.relatedTarget as Node))
        hideTip();
    },
    { signal },
  );
  document.addEventListener(
    "focusin",
    (event) => {
      const el = tipSource(event.target);
      if (el && el.matches(":focus-visible")) showTip(el, 0);
    },
    { signal },
  );
  document.addEventListener(
    "focusout",
    () => {
      if (tipTarget && !tipTarget.matches(":hover")) hideTip();
    },
    { signal },
  );
  // a click often changes the title of the button under the pointer: keep it aside and refresh the tooltip
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "childList") {
        if (!suppressed()) continue; // new nodes keep the titles that feed the tooltip
        for (const node of record.addedNodes)
          if (node instanceof HTMLElement) syncTooltipTitles(node);
      } else if (
        record.target instanceof HTMLElement &&
        record.target.tagName !== "IFRAME" &&
        (suppressed() || record.target === tipTarget)
      ) {
        stashTitle(record.target);
        if (record.target === tipTarget)
          tooltip.textContent = record.target.dataset.tip!;
      }
    }
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["title"],
  });
  addEventListener("preferenceschange", () => {
    hideTip();
    syncTooltipTitles();
  });
  syncTooltipTitles();
}
