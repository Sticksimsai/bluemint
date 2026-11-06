// Only the finalized chain-confirmation handler may append to this feed.
export function createMintFeed(store){
 const db=store.db;
 db.exec(`CREATE TABLE IF NOT EXISTS confirmed_mints(seq INTEGER PRIMARY KEY AUTOINCREMENT,launch_id TEXT NOT NULL UNIQUE REFERENCES launches(id),mint TEXT NOT NULL UNIQUE,confirmed_at TEXT NOT NULL);`);
 return {
  record(id,mint){return db.prepare('INSERT OR IGNORE INTO confirmed_mints(launch_id,mint,confirmed_at) VALUES(?,?,?)').run(String(id),mint,new Date().toISOString())},
  list(after=0,limit=12){
   const rows=after?db.prepare('SELECT * FROM confirmed_mints WHERE seq>? ORDER BY seq ASC LIMIT ?').all(after,limit):db.prepare('SELECT * FROM confirmed_mints ORDER BY seq DESC LIMIT ?').all(limit).reverse();
   return {items:rows.map(r=>{const t=store.get(r.launch_id);return {seq:r.seq,id:r.launch_id,mint:r.mint,name:t.name,ticker:t.ticker,confirmedAt:r.confirmed_at,image:`/api/launches/${r.launch_id}/image`}}),total:db.prepare('SELECT count(*) AS n FROM confirmed_mints').get().n,cursor:rows.at(-1)?.seq||after};
  }
 };
}
