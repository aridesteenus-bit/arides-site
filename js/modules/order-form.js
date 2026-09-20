export function initOrderForm() {
  const form = document.querySelector("[data-order-form]");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    // Step later: validation, price calculation and WhatsApp/order submission.
  });
}
