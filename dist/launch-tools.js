// Client-side preparation only. The server independently validates every field.
(()=>{
 const MAX_INPUT_BYTES=8*1024*1024,MAX_STORED_BYTES=240*1024;
 function normalizeLink(value,kind){
  value=String(value||'').trim();if(!value)return '';
  if(kind==='twitter'&&/^@?[a-zA-Z0-9_]{1,15}$/.test(value))return 'https://x.com/'+value.replace(/^@/,'');
  return /^[a-z][a-z0-9+.-]*:/i.test(value)?value:'https://'+value;
 }
 function validate(values,decimals=8){
  const errors={},name=String(values.name||'').trim(),ticker=String(values.ticker||'').trim(),desc=String(values.desc||'').trim();
  if(!name)errors.name='Enter a token name.';
  else if(new TextEncoder().encode(name).length>32)errors.name='Use a shorter name. The limit is 32 UTF-8 bytes.';
  if(!/^[A-Za-z0-9]{2,10}$/.test(ticker))errors.ticker='Use 2–10 letters or numbers.';
  if(!desc)errors.desc='Add a short description.';else if(desc.length>160)errors.desc='Keep the description within 160 characters.';
  const buy=String(values.devBuyQuote||'').trim();if(buy&&!new RegExp('^\\d{1,9}(\\.\\d{1,'+decimals+'})?$').test(buy))errors.devBuyQuote='Use a positive amount with up to '+decimals+' decimal places, or leave it at zero.';
  for(const key of ['twitter','website']){if(!values[key])continue;try{const u=new URL(values[key]);if(u.protocol!=='https:'||u.username||u.password)throw Error();if(key==='twitter'&&!['x.com','www.x.com','twitter.com','www.twitter.com'].includes(u.hostname))throw Error()}catch{errors[key]=key==='twitter'?'Use an X handle or a valid x.com / twitter.com link.':'Use a valid HTTPS website address.'}}
  return errors;
 }
 const dataBytes=url=>{const data=url.split(',')[1];return Math.floor(data.length*3/4)-(data.endsWith('==')?2:data.endsWith('=')?1:0)};
 async function prepareImage(file){
  if(!file)throw Error('Choose a token image.');
  if(file.size>MAX_INPUT_BYTES)throw Error('Choose an image under 8 MB.');
  const type=String(file.type||'').toLowerCase(),extension=/\.(png|jpe?g|webp)$/i.test(file.name||'');
  if(!['image/png','image/jpeg','image/jpg','image/webp'].includes(type)&&!((!type||type==='application/octet-stream')&&extension))throw Error('Choose a PNG, JPG or WebP image.');
  const source=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read this file. Choose the image again.'));reader.readAsDataURL(file)});
  const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('This file could not be decoded as an image. Try exporting it as PNG or JPG.'));img.src=source});
  if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40000000)throw Error('Use an image below 40 megapixels.');
  for(const maxEdge of [512,384,256]){
   const scale=Math.min(1,maxEdge/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
   const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image processing is unavailable in this browser. Try another browser.');ctx.imageSmoothingEnabled=false;ctx.drawImage(image,0,0,canvas.width,canvas.height);
   let dataUrl=canvas.toDataURL('image/png');
   if(dataBytes(dataUrl)<=MAX_STORED_BYTES)return {dataUrl,width:canvas.width,height:canvas.height,bytes:dataBytes(dataUrl)};
   for(const quality of [.9,.8,.7]){dataUrl=canvas.toDataURL('image/webp',quality);if(dataBytes(dataUrl)<=MAX_STORED_BYTES)return {dataUrl,width:canvas.width,height:canvas.height,bytes:dataBytes(dataUrl)}}
  }
  throw Error('This image could not be optimized. Try a smaller PNG, JPG or WebP.');
 }
 window.MemebaseLaunchTools={normalizeLink,validate,prepareImage,dataBytes,MAX_INPUT_BYTES,MAX_STORED_BYTES};
})();
