import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context={window:{},TextEncoder,URL};vm.runInNewContext(readFileSync(new URL('../dist/launch-tools.js',import.meta.url),'utf8'),context);
const tools=context.window.MemebaseLaunchTools;
const valid={name:'Pixel Cat',ticker:'CAT',desc:'A meme',twitter:'',website:'',devBuyQuote:'0.00000001'};
test('launch form accepts eight-decimal COINx buys and rejects malformed or negative amounts',()=>{
 assert.equal(Object.keys(tools.validate(valid)).length,0);
 for(const value of ['-1','1e2','NaN','1.000000001','1.2.3'])assert.ok(tools.validate({...valid,devBuyQuote:value}).devBuyQuote);
 assert.equal(tools.validate({...valid,devBuyQuote:''}).devBuyQuote,undefined);
 assert.ok(tools.validate(valid,6).devBuyQuote);
});
test('name bytes and normalized links are checked before a wallet opens',()=>{
 assert.ok(tools.validate({...valid,name:'😀'.repeat(9)}).name);
 assert.equal(tools.normalizeLink('@pixelcat','twitter'),'https://x.com/pixelcat');
 assert.equal(tools.normalizeLink('pixelcat.com','website'),'https://pixelcat.com');
 assert.equal(tools.validate({...valid,website:'https://pixelcat.com'}).website,undefined);
 for(const value of ['javascript:alert(1)','http://example.com','https://user:pass@example.com'])assert.ok(tools.validate({...valid,website:value}).website);
 assert.ok(tools.validate({...valid,twitter:'https://example.com/x'}).twitter);
});
test('raw upload limit and encoded target leave room inside the unchanged server payload limit',async()=>{
 assert.equal(tools.MAX_INPUT_BYTES,8*1024*1024);assert.ok(tools.MAX_STORED_BYTES<256*1024);
 assert.ok(Math.ceil(tools.MAX_STORED_BYTES*4/3)+5000<400000);
 await assert.rejects(tools.prepareImage({size:9*1024*1024,type:'image/png',name:'large.png'}),/under 8 MB/);
 await assert.rejects(tools.prepareImage({size:100,type:'image/svg+xml',name:'unsafe.svg'}),/PNG, JPG or WebP/);
 assert.equal(tools.dataBytes('data:image/png;base64,YQ=='),1);assert.equal(tools.dataBytes('data:image/png;base64,YWI='),2);
});
