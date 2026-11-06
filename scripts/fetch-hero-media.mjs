// Fetch the pinned Higgsfield render at build time; never proxy arbitrary user URLs.
import{readFile,mkdir,writeFile,rename}from'node:fs/promises';import{createHash}from'node:crypto';
const manifest=JSON.parse(await readFile(new URL('../assets/hero-media.json',import.meta.url),'utf8'));
for(const asset of manifest.assets){
 if(!/^(mint-runthrough\.mp4|mint-machine\.png)$/.test(asset.filename)||!/^https:\/\/d8j0ntlcm91z4\.cloudfront\.net\//.test(asset.url)||!/^[a-f0-9]{64}$/.test(asset.sha256))throw Error('Invalid hero asset manifest');
 const path=new URL('../dist/assets/'+asset.filename,import.meta.url),digest=b=>createHash('sha256').update(b).digest('hex');
 try{const current=await readFile(path);if(digest(current)===asset.sha256)continue}catch{}
 await mkdir(new URL('../dist/assets/',import.meta.url),{recursive:true});let bytes;
 for(let attempt=0;attempt<3;attempt++){try{const response=await fetch(asset.url,{signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error('Asset HTTP '+response.status);const chunks=[];let total=0;for await(const chunk of response.body){total+=chunk.length;if(total>25000000)throw Error('Hero asset exceeds size limit');chunks.push(chunk)}bytes=Buffer.concat(chunks);if(bytes.length!==asset.bytes||digest(bytes)!==asset.sha256)throw Error('Hero artifact integrity check failed');break}catch(error){if(attempt===2)throw error;await new Promise(r=>setTimeout(r,1500*(attempt+1)))}}
 const temp=new URL(path.href+'.tmp');await writeFile(temp,bytes);await rename(temp,path);console.log('Verified hero media: '+asset.filename);
}
