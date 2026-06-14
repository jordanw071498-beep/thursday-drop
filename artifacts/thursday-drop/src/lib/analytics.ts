declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (command: string, ...args: unknown[]) => void;
  }
}

function callGtag(command: string, ...args: unknown[]): void {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag(command, ...args);
  }
}

export function trackPageView(path: string): void {
  callGtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
  });
}

export function trackEvent(
  name: string,
  params?: Record<string, unknown>,
): void {
  callGtag("event", name, params ?? {});
}
