const target = document.querySelector("[data-legacy-route]")?.dataset.legacyRoute;
if (target) {
  const destination = new URL(window.FitnessConfig.baseUrl, window.location.origin);
  destination.hash = target;
  window.location.replace(destination);
}
