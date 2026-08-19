const DEFAULT_ROUTE = "/dashboard";

function currentRoute() {
  const route = window.location.hash.replace(/^#/, "");
  return route.startsWith("/") ? route : DEFAULT_ROUTE;
}

function updateRoute() {
  const requested = currentRoute();
  const pages = Array.from(document.querySelectorAll("[data-route-page]"));
  const activePage = pages.find((page) => page.dataset.routePage === requested)
    ?? pages.find((page) => page.dataset.routePage === DEFAULT_ROUTE);
  if (!activePage) return;
  const route = activePage.dataset.routePage;
  pages.forEach((page) => {
    page.hidden = page !== activePage;
  });
  document.querySelectorAll("[data-route-link]").forEach((link) => {
    if (link.dataset.routeLink === route) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  document.title = `${activePage.dataset.routeTitle} | ${window.FitnessConfig.siteTitle}`;
  window.dispatchEvent(new CustomEvent("fitness:route-change", { detail: { route } }));
  if (window.location.hash !== `#${route}`) window.history.replaceState(null, "", `#${route}`);
  const heading = activePage.querySelector("h1");
  if (heading) {
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }
}

export function navigate(route) {
  window.location.hash = route;
}

export function startRouter() {
  window.addEventListener("hashchange", updateRoute);
  updateRoute();
}
