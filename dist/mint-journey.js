(()=>{
 const video=document.getElementById('mintJourney');if(!video)return;
 const figure=video.closest('figure'),steps=[...figure.querySelectorAll('figcaption span')],bar=figure.querySelector('.mint-runthrough-track i');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');let visible=true;
 function sync(){if(reduced.matches||!visible||document.hidden){video.pause();return}if(!video.getAttribute('src'))video.src=video.dataset.src;video.muted=true;video.play().catch(()=>figure.classList.add('media-fallback'))}
 video.addEventListener('playing',()=>figure.classList.remove('media-fallback'));
 video.addEventListener('timeupdate',()=>{const t=video.currentTime,stage=t<3?0:t<9?1:t<12?2:3;steps.forEach((s,i)=>s.classList.toggle('is-active',i===stage));bar.style.transform=`scaleX(${Number.isFinite(video.duration)?t/video.duration:0})`});
 video.addEventListener('error',()=>figure.classList.add('media-fallback'));
 reduced.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);
 if('IntersectionObserver'in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync()},{threshold:.05}).observe(figure);sync();
})();
