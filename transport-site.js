document.addEventListener("DOMContentLoaded",()=>{
  const order=document.getElementById("order");
  const service=document.getElementById("service");

  document.querySelectorAll(".service-card").forEach(card=>{
    card.addEventListener("click",()=>{
      if(service) service.value=card.dataset.service||service.value;
      order?.scrollIntoView({behavior:"smooth",block:"center"});
    });
  });

  document.querySelectorAll('a[href="#order"]').forEach(link=>{
    link.addEventListener("click",e=>{
      const target=document.getElementById("order");
      if(target){
        e.preventDefault();
        target.scrollIntoView({behavior:"smooth",block:"center"});
      }
    });
  });

  order?.addEventListener("submit",e=>{
    e.preventDefault();
    if(!order.reportValidity()) return;

    const from=document.getElementById("from")?.value.trim()||"";
    const to=document.getElementById("to")?.value.trim()||"";
    const selected=service?.options[service.selectedIndex]?.text||"";

    const message=[
      "Здравствуйте! Хочу заказать перевозку.",
      "Услуга: "+selected,
      "Откуда: "+from,
      "Куда: "+to
    ].join("\n");

    window.open(
      "https://wa.me/37258536770?text="+encodeURIComponent(message),
      "_blank",
      "noopener"
    );
  });
});