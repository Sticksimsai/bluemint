(()=>{
 const video=document.getElementById('mintJourney');if(!video)return;
 const figure=video.closest('figure'),steps=[...figure.querySelectorAll('figcaption span')],bar=figure.querySelector('.mint-runthrough-track i');
 const popup=document.createElement('div');popup.className='journey-popup';popup.setAttribute('aria-hidden','true');figure.querySelector('.mint-runthrough-media').append(popup);
 const captions=[['YOUR IDEA','Choose a PFP. Create a coin.'],['ENTER THE MINT','From meme to minted token.'],['FRESHLY MINTED','A new coin leaves the press.'],['PAIRED WITH USDC','One familiar quote currency.'],['INTO THE TREASURY','Buy. Pair. Add liquidity.']];let caption=-1;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');let visible=true;
 function sync(){if(reduced.matches||!visible||document.hidden){video.pause();return}if(!video.getAttribute('src'))video.src=video.dataset.src;video.muted=true;video.play().catch(()=>figure.classList.add('media-fallback'))}
 video.addEventListener('playing',()=>figure.classList.remove('media-fallback'));
 video.addEventListener('timeupdate',()=>{const t=video.currentTime,next=t<3?0:t<6?1:t<9?2:t<12?3:4;if(next!==caption){caption=next;popup.replaceChildren();const tag=document.createElement('b'),line=document.createElement('span');tag.textContent=captions[next][0];line.textContent=captions[next][1];popup.append(tag,line);popup.classList.remove('pop-in');void popup.offsetWidth;popup.classList.add('pop-in')}const stage=t<3?0:t<9?1:t<12?2:3;steps.forEach((s,i)=>s.classList.toggle('is-active',i===stage));bar.style.transform=`scaleX(${Number.isFinite(video.duration)?t/video.duration:0})`});
 video.addEventListener('error',()=>figure.classList.add('media-fallback'));
 reduced.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);
 if('IntersectionObserver'in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync()},{threshold:.05}).observe(figure);sync();
})();
