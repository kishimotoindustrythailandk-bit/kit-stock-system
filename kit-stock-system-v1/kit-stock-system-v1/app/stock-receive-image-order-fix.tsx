"use client";

import { useEffect } from "react";

/**
 * Keep the Stock receive confirmation popup image order explicit and isolated
 * from the dispatch popup:
 *   1) actual part image
 *   2) master/sample image
 *
 * This intentionally inspects the image slot in the generated URL so it also
 * corrects older rendered markup where the two figures were reversed.
 */
export default function StockReceiveImageOrderFix() {
  useEffect(() => {
    const fixOrder = () => {
      const modal = document.querySelector(".stock-receive-confirm-modal");
      if (!modal) return;

      const pair = modal.querySelector(".part-image-pair");
      if (!pair) return;

      const figures = Array.from(pair.querySelectorAll(":scope > figure"));
      if (figures.length < 2) return;

      const actual = figures.find((figure) => {
        const img = figure.querySelector("img");
        return img?.getAttribute("src")?.includes("slot=actual") ?? false;
      });
      const master = figures.find((figure) => figure !== actual);

      if (!actual || !master) return;

      const actualCaption = actual.querySelector("figcaption");
      const masterCaption = master.querySelector("figcaption");
      if (actualCaption) actualCaption.textContent = "รูปชิ้นงานจริง";
      if (masterCaption) masterCaption.textContent = "รูปตัวอย่าง";

      if (pair.firstElementChild !== actual) {
        pair.insertBefore(actual, pair.firstElementChild);
      }
      if (actual.nextElementSibling !== master) {
        pair.insertBefore(master, actual.nextElementSibling);
      }
    };

    fixOrder();
    const observer = new MutationObserver(fixOrder);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
