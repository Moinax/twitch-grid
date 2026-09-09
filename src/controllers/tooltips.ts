import type { createLifecycle } from "./lifecycle";

export function suppressPlayerTooltips(
  lifecycle: ReturnType<typeof createLifecycle>,
) {
  const { MutationObserver, addEventListener } = lifecycle;
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
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "childList") {
        for (const node of record.addedNodes)
          if (node instanceof HTMLElement) syncTooltipTitles(node);
      } else if (
        record.target instanceof HTMLElement &&
        record.target.tagName !== "IFRAME"
      )
        stashTitle(record.target);
    }
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["title"],
  });
  addEventListener("preferenceschange", () => syncTooltipTitles());
  syncTooltipTitles();
}
