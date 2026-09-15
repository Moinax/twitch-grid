import { preferences } from "../services/preferences";
import type { createLifecycle } from "./lifecycle";

// Every title is kept aside in data-tip and shown as a styled tooltip: the browser's own tooltip never
// appears. The Twitch embed pauses as soon as anything covers it: under that player nothing is shown at all.
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
  function syncTooltipTitles(root: Document | HTMLElement = document) {
    const selector = "[title]:not(iframe)";
    if (root instanceof HTMLElement && root.matches(selector)) stashTitle(root);
    for (const el of root.querySelectorAll<HTMLElement>(selector))
      stashTitle(el);
  }
  function renderTip(text: string) {
    const shortcut = text.match(
      /^(.*) \((Shift(?:\+(?:Click|M))?|Space|Espace|Spatie)\)$/i,
    );
    tooltip.classList.toggle("has-shortcut", !!shortcut);
    tooltip.replaceChildren();
    if (!shortcut) {
      tooltip.textContent = text;
      return;
    }
    const label = document.createElement("span");
    label.textContent = shortcut[1];
    const keys = document.createElement("span");
    keys.className = "tooltip-keys";
    const keyNames = shortcut[2]
      .split("+")
      .map((key) =>
        key.length === 1
          ? key.toUpperCase()
          : key[0].toUpperCase() + key.slice(1).toLowerCase(),
      );
    for (const [index, key] of keyNames.entries()) {
      if (index) {
        const plus = document.createElement("span");
        plus.className = "tooltip-plus";
        plus.textContent = "+";
        keys.append(plus);
      }
      const cap = document.createElement("kbd");
      cap.textContent = key;
      keys.append(cap);
    }
    tooltip.append(label, keys);
  }
  // silent: the element is tracked but nothing is shown
  function showTip(el: HTMLElement, delay: number, silent = false) {
    hideTip();
    if (!el.dataset.tip) return;
    tipTarget = el;
    if (suppressed() || silent) return;
    tipTimer = setTimeout(() => {
      if (tipTarget !== el || !el.isConnected) return;
      const side = el.closest("#side")?.getBoundingClientRect();
      const beside = !!el.closest("#list"); // a channel row's tooltip sits to its right, over the grid
      const contained =
        side && !beside && !document.body.classList.contains("collapsed");
      tooltip.style.maxWidth = contained
        ? `${Math.min(320, side.width - 16)}px`
        : "";
      tooltip.classList.toggle("sidebar-tip", !!contained);
      renderTip(el.dataset.tip!);
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
      const x = beside
        ? Math.min(box.right + 8, innerWidth - width - 8)
        : Math.min(
            Math.max(8, box.left + box.width / 2 - width / 2),
            right - width - 8,
          );
      const y = beside
        ? Math.min(
            Math.max(8, box.top + box.height / 2 - height / 2),
            innerHeight - height - 8,
          )
        : bottom + height + 16 > innerHeight
          ? box.top - height - 8
          : bottom + 8;
      tooltip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      tooltip.classList.add("in");
    }, delay);
  }
  function hideTip() {
    clearTimeout(tipTimer);
    tipTarget = null;
    tooltip.classList.remove("in");
    tooltip.hidden = true;
  }
  const tipSource = (target: EventTarget | null) => {
    const el =
      target instanceof Element
        ? target.closest<HTMLElement>("[data-tip]")
        : null;
    return el && el.tagName !== "IFRAME" ? el : null;
  };
  document.addEventListener(
    "pointerover",
    (event) => {
      const el = tipSource(event.target);
      // under a held Shift a channel row shows its preview card instead of its tooltip
      if (el && el !== tipTarget && event.pointerType !== "touch")
        showTip(el, 400, event.shiftKey && !!el.closest("#list"));
    },
    { signal },
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Shift" && tipTarget?.closest("#list")) hideTip();
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
        for (const node of record.addedNodes)
          if (node instanceof HTMLElement) syncTooltipTitles(node);
      } else if (
        record.target instanceof HTMLElement &&
        record.target.tagName !== "IFRAME"
      ) {
        stashTitle(record.target);
        if (record.target === tipTarget) renderTip(record.target.dataset.tip!);
      }
    }
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["title"],
  });
  addEventListener("preferenceschange", hideTip);
  syncTooltipTitles();
}
