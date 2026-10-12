export const ARTWORK_LIMIT = 10;
export class ArtworkRepository {
  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((resolve,reject) => {
      const request=indexedDB.open('ateliera-artwork-storage',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('artworks',{keyPath:'id'});
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });return this.db;
  }
  async list() {
    const db=await this.open();return new Promise((resolve,reject)=>{
      const request=db.transaction('artworks').objectStore('artworks').getAll();
      request.onsuccess=()=>resolve(request.result.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));
      request.onerror=()=>reject(request.error);
    });
  }
  async put(record) {
    const db=await this.open();return new Promise((resolve,reject)=>{
      const transaction=db.transaction('artworks','readwrite'),store=transaction.objectStore('artworks');let failure;
      transaction.oncomplete=()=>resolve(record);transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(failure||transaction.error);
      const exists=store.get(record.id);exists.onsuccess=()=>{
        const count=store.count();count.onsuccess=()=>{
          if(!exists.result&&count.result>=ARTWORK_LIMIT){failure=new Error('10장이 모두 보관되어 있습니다. 먼저 작품을 삭제해 빈칸을 만들어 주세요.');transaction.abort();return;}
          store.put(record);
        };
      };
    });
  }
  async remove(id) {
    const db=await this.open();return new Promise((resolve,reject)=>{
      const transaction=db.transaction('artworks','readwrite');transaction.objectStore('artworks').delete(id);
      transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);
    });
  }
}
export function artworkDate(date=new Date()) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
