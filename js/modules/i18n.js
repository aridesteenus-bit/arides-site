export function initI18n() {
  const root = document.documentElement;
  const switcher = document.querySelector("[data-language-switcher]");
  if (!switcher) return;

  // Step later: ET / RU / EN translations and saved language preference.
  root.lang = root.lang || "ru";
}
