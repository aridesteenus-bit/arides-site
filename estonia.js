(()=>{
  const copy={
    ru:{title:"ARIDES Transport | Перевозки по Эстонии",meta:"ARIDES Transport — грузоперевозки и переезды по Эстонии. Peugeot Boxer L3H2. +372 58536770.",eyebrow:"ПЕРЕВОЗКИ ПО ЭСТОНИИ",hero1:"Твой груз —",hero2:"наша забота.",lead:"Быстро и аккуратно перевезём мебель, технику, стройматериалы и другие грузы по Эстонии.",s1t:"Перевозка грузов",s1d:"Таллинн • Харьюмаа • Эстония",s2t:"Переезды",s2d:"Квартиры • офисы • склады",s3t:"Стройматериалы",s3d:"Доставка на объект и из магазина",vanText:"Вместительный фургон для ежедневных перевозок",loc:"Работаем по всей Эстонии",tag:"Быстро • Надёжно • Честно"},
    et:{title:"ARIDES Transport | Kaubavedu Eestis",meta:"ARIDES Transport — kaubavedu ja kolimine üle Eesti. Peugeot Boxer L3H2. +372 58536770.",eyebrow:"KAUBAVEDU ÜLE EESTI",hero1:"Sinu kaup —",hero2:"meie hool.",lead:"Veame kiiresti ja hoolikalt mööblit, tehnikat, ehitusmaterjale ja muud kaupa üle Eesti.",s1t:"Kaubavedu",s1d:"Tallinn • Harjumaa • Eesti",s2t:"Kolimine",s2d:"Korterid • kontorid • laod",s3t:"Ehitusmaterjalid",s3d:"Tarne objektile või kauplusest",vanText:"Mahukas kaubik igapäevasteks vedudeks",loc:"Töötame üle Eesti",tag:"Kiire • Usaldusväärne • Aus"},
    en:{title:"ARIDES Transport | Cargo transport in Estonia",meta:"ARIDES Transport — cargo transport and moving across Estonia. Peugeot Boxer L3H2. +372 58536770.",eyebrow:"TRANSPORT ACROSS ESTONIA",hero1:"Your cargo —",hero2:"our care.",lead:"Fast and careful transport of furniture, appliances, building materials and other cargo across Estonia.",s1t:"Cargo transport",s1d:"Tallinn • Harju County • Estonia",s2t:"Moving",s2d:"Apartments • offices • storage",s3t:"Building materials",s3d:"Delivery to site or from store",vanText:"Spacious van for everyday transport",loc:"Service across Estonia",tag:"Fast • Reliable • Straightforward"}
  };
  let lang=localStorage.getItem("aridesLang");
  if(!copy[lang]) lang="ru";
  function apply(){
    const t=copy[lang];
    document.documentElement.lang=lang;
    document.title=t.title;
    const meta=document.querySelector('#metaDescription');
    if(meta) meta.setAttribute('content',t.meta);
    document.querySelectorAll('[data-t]').forEach(el=>{const key=el.dataset.t;if(t[key])el.textContent=t[key]});
    document.querySelectorAll('[data-lang]').forEach(btn=>btn.classList.toggle('active',btn.dataset.lang===lang));
    localStorage.setItem("aridesLang",lang);
  }
  document.querySelectorAll('[data-lang]').forEach(btn=>btn.addEventListener('click',()=>{lang=btn.dataset.lang;apply()}));
  apply();
})();