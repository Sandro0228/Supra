/* Supra logo, shared by every page. Uses the supplied SVG files as they are; the dark-surface file differs only
   in the espresso colour. Both are in the page and CSS shows the one that matches the current light/dark theme.
   SupraLogo({kind:'full'|'emblem', width, alt}) → HTML string. Height comes from the artwork's own ratio. */
(function(){
  const ART={full:{w:1573,h:550,light:'/brand/supra-logo.svg',dark:'/brand/supra-logo-dark.svg'},
             emblem:{w:1,h:1,light:'/brand/supra-emblem.svg',dark:'/brand/supra-emblem-dark.svg'}};
  window.SupraLogo=function(o){
    o=o||{};const a=ART[o.kind||'full'],w=o.width||170,h=Math.round(w*a.h/a.w),alt=o.alt===undefined?'Supra':o.alt;
    const img=(src,c)=>`<img class="brandimg ${c}" src="${src}" width="${w}" height="${h}" alt="${alt}" decoding="async" draggable="false">`;
    return `<span class="brand ${o.cls||''}"${o.cls?'':` style="--bw:${w}px"`}>${img(a.light,'brandimg-l')}${img(a.dark,'brandimg-d')}</span>`;
  };
})();
