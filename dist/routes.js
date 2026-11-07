// Address-bar paths also work as direct links through the web server.
const docSections=['overview','launches','pairings','fees','treasury','liquidity','markets','status'];
function tokenPath(id){
  const t=tokens.find(item=>String(item.id)===String(id));
  return '/token/'+encodeURIComponent(t?.mint||id);
}
function migrateBookmark(){
  const old=location.hash.slice(1);
  const aliases={create:'/launch',mint:'/',setup:'/setup',watchlist:'/watchlist',discover:'/'};
  const docs=location.pathname.startsWith('/docs');
  const path=docs&&docSections.includes(old)?'/docs/'+old:aliases[old]||(/^token\/[a-zA-Z0-9]+$/.test(old)?'/'+old:null);
  if(path)history.replaceState(null,'',path+location.search);
}
migrateBookmark();
if(location.pathname.startsWith('/docs')){
  const section=document.getElementById(location.pathname.split('/')[2]);
  if(section)requestAnimationFrame(()=>section.scrollIntoView());
}
function currentToken(id){
  const path=location.pathname;
  return path===tokenPath(id)||path==='/token/'+id;
}
function navigate(path){
  if(location.pathname!==path)history.pushState(null,'',path);
  route();
}
