export function getScrollParent(element: HTMLElement | null): HTMLElement | null {
  if (typeof window === "undefined" || !element) return null;

  let parent = element.parentElement;
  while (parent && parent !== document.body) {
    const style = window.getComputedStyle(parent);
    if (/(auto|scroll|overlay)/.test(`${style.overflowY}${style.overflowX}`)) {
      return parent;
    }
    parent = parent.parentElement;
  }

  return null;
}
