// Ponte do Firebase. O site continua funcionando localmente se o Firebase estiver
// indisponível (por exemplo, regras ainda não publicadas). Quando o Firebase
// estiver disponível, os dados são sincronizados com o Firestore e as fotos com o Storage.
import { firebaseConfig } from "./firebase-config.js";

const ROOT = "frota";
const COLLECTIONS = ["cars", "employees", "bookings", "history"];
let servicesPromise = null;
let saveQueue = Promise.resolve();

async function services(){
  if(!servicesPromise){
    servicesPromise = (async()=>{
      const [{initializeApp},{getFirestore,collection,getDocs,doc,writeBatch,serverTimestamp},{getStorage,ref,uploadBytes,getDownloadURL}] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js"),
        import("https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js")
      ]);
      const app = initializeApp(firebaseConfig);
      return {app, db:getFirestore(app), storage:getStorage(app), collection, getDocs, doc, writeBatch, serverTimestamp, ref, uploadBytes, getDownloadURL};
    })();
  }
  return servicesPromise;
}

function collectionPath(s,name){ return s.collection(s.db, ROOT, name, "items"); }

export async function loadFleetData(){
  const s = await services();
  const result = {cars:[],employees:[],bookings:[],history:[]};
  const snapshots = await Promise.all(COLLECTIONS.map(name => s.getDocs(collectionPath(s,name))));
  snapshots.forEach((snap,index)=>{
    result[COLLECTIONS[index]] = snap.docs.map(item => ({id:item.id, ...item.data()}));
  });
  try{
    const metaSnap = await s.getDocs(collectionPath(s,'_meta'));
    const metaDoc = metaSnap.docs.find(d=>d.id==='state');
    result._meta = metaDoc ? metaDoc.data() : {};
  }catch(e){ result._meta = {}; }
  return result;
}

async function replaceCollection(s,name,items){
  const refCol = collectionPath(s,name);
  const current = await s.getDocs(refCol);
  const wanted = new Set(items.map(item => String(item.id)));
  const operations = [];
  for(const oldDoc of current.docs){
    if(!wanted.has(oldDoc.id)) operations.push({type:"delete", ref:oldDoc.ref});
  }
  for(const item of items){
    if(item?.id) operations.push({type:"set", ref:s.doc(refCol, String(item.id)), data:item});
  }
  while(operations.length){
    const batch = s.writeBatch(s.db);
    const chunk = operations.splice(0,450);
    for(const op of chunk){ op.type === "delete" ? batch.delete(op.ref) : batch.set(op.ref, op.data); }
    await batch.commit();
  }
}

export function saveFleetData(data){
  const clean = JSON.parse(JSON.stringify(data));
  saveQueue = saveQueue.then(async()=>{
    const s = await services();
    for(const name of COLLECTIONS) await replaceCollection(s,name,Array.isArray(clean[name]) ? clean[name] : []);
    const meta = s.doc(s.db, ROOT, "_meta", "state");
    const batch = s.writeBatch(s.db);
    batch.set(meta,{updatedAt:s.serverTimestamp(),clientUpdatedAt:Date.now()});
    await batch.commit();
  });
  return saveQueue;
}

function compressImage(file,maxSide=1000,quality=0.72){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onerror=()=>reject(reader.error||new Error("Não foi possível ler a imagem."));
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error("Imagem inválida."));
      img.onload=()=>{
        const scale=Math.min(1,maxSide/Math.max(img.width,img.height));
        const canvas=document.createElement("canvas");
        canvas.width=Math.max(1,Math.round(img.width*scale));
        canvas.height=Math.max(1,Math.round(img.height*scale));
        canvas.getContext("2d",{alpha:false}).drawImage(img,0,0,canvas.width,canvas.height);
        canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Não foi possível comprimir a imagem.")),"image/jpeg",quality);
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export async function prepareCarImage(file){
  if(!file) return null;
  if(file.size>10*1024*1024) throw new Error("A foto precisa ter no máximo 10 MB.");
  const blob=await compressImage(file);
  return await new Promise((resolve,reject)=>{
    const r=new FileReader(); r.onerror=()=>reject(r.error); r.onload=()=>resolve(r.result); r.readAsDataURL(blob);
  });
}

export async function uploadCarImage(file,carId){
  if(!file) return null;
  const s=await services();
  const blob=await compressImage(file,1400,0.82);
  const imageRef=s.ref(s.storage,`carros/${carId}.jpg`);
  await s.uploadBytes(imageRef,blob,{contentType:"image/jpeg",cacheControl:"public,max-age=31536000"});
  return await s.getDownloadURL(imageRef);
}

export async function getFirebaseStatus(){
  try{ await services(); return {ok:true}; }
  catch(error){ return {ok:false,error}; }
}
