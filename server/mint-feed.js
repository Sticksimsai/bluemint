// Only the finalized chain-confirmation handler may append to this feed.
export function createMintFeed(store){
 const db=store.db;
 db.exec(`CREATE TABLE IF NOT EXISTS confirmed_mints(seq INTEGER PRIMARY KEY AUTOINCREMENT,launch_id TEXT NOT NULL UNIQUE REFERENCES launches(id),mint TEXT NOT NULL UNIQUE,confirmed_at TEXT NOT NULL);`);
 return {
  record(id,mint){return db.prepare('INSERT OR IGNORE INTO confirmed_mints(launch_id,mint,confirmed_at) VALUES(?,?,?)').run(String(id),mint,new Date().toISOString())},
  list(after=0,limit=12,protocol=null){
   const base='FROM confirmed_mints f JOIN launches l ON l.id=f.launch_id',where=protocol?" WHERE json_extract(l.profile,'$.protocol')=?":'',params=protocol?[protocol]:[];
   const rows=after?db.prepare('SELECT f.* '+base+where+(protocol?' AND':' WHERE')+' f.seq>? ORDER BY f.seq ASC LIMIT ?').all(...params,after,limit):db.prepare('SELECT f.* '+base+where+' ORDER BY f.seq DESC LIMIT ?').all(...params,limit).reverse();
   return {items:rows.map(r=>{const t=store.get(r.launch_id);return {seq:r.seq,id:r.launch_id,mint:r.mint,name:t.name,ticker:t.ticker,confirmedAt:r.confirmed_at,image:`/api/launches/${r.launch_id}/image`}}),total:db.prepare('SELECT count(*) AS n '+base+where).get(...params).n,cursor:rows.at(-1)?.seq||after};
  }
 };
}
