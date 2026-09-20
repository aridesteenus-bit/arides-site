import { initOrderForm } from "./modules/order-form.js";
import { initReviews } from "./modules/reviews.js";
import { initI18n } from "./modules/i18n.js";

document.addEventListener("DOMContentLoaded", () => {
  initOrderForm();
  initReviews();
  initI18n();
});
