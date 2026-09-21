import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const ROOT = "frota";
const COLLECTIONS = ["cars", "employees", "bookings", "history"];

function collectionRef(name){ return collection(db, ROOT, name, "items"); }

export async function loadFleetData(){
  const result = {cars:[], employees:[], bookings:[], history:[]};
  const snapshots = await Promise.all(COLLECTIONS.map(name => getDocs(collectionRef(name))));
  snapshots.forEach((snap,index)=>{
    result[COLLECTIONS[index]] = snap.docs.map(item => ({id:item.id, ...item.data()}));
  });
  return result;
}

// Cada grupo fica em sua própria coleção para evitar o limite de 1 MB de um único documento.
// As gravações são serializadas para evitar que dois cliques rápidos sobrescrevam dados.
let saveQueue = Promise.resolve();

async function replaceCollection(name, items){
  const refCol = collectionRef(name);
  const current = await getDocs(refCol);
  const wanted = new Set(items.map(item => String(item.id)));
  let operations = [];

  for(const oldDoc of current.docs){
    if(!wanted.has(oldDoc.id)) operations.push({type:"delete", ref:oldDoc.ref});
  }
  for(const item of items){
    if(!item?.id) continue;
    operations.push({type:"set", ref:doc(refCol, String(item.id)), data:item});
  }

  while(operations.length){
    const batch = writeBatch(db);
    const chunk = operations.splice(0, 450);
    for(const op of chunk){
      if(op.type === "delete") batch.delete(op.ref);
      else batch.set(op.ref, op.data);
    }
    await batch.commit();
  }
}

export function saveFleetData(data){
  const clean = JSON.parse(JSON.stringify(data));
  saveQueue = saveQueue.then(async()=>{
    for(const name of COLLECTIONS){
      await replaceCollection(name, Array.isArray(clean[name]) ? clean[name] : []);
    }
    const meta = doc(db, ROOT, "_meta");
    const batch = writeBatch(db);
    batch.set(meta, {updatedAt:serverTimestamp()});
    await batch.commit();
  });
  return saveQueue;
}

function compressImage(file, maxSide=1400, quality=0.82){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Não foi possível ler a imagem."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Imagem inválida."));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d", {alpha:false});
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Não foi possível comprimir a imagem.")), "image/jpeg", quality);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadCarImage(file, carId){
  if(!file) return null;
  if(file.size > 10 * 1024 * 1024) throw new Error("A foto precisa ter no máximo 10 MB antes da compressão.");
  const blob = await compressImage(file);
  const imageRef = ref(storage, `carros/${carId}.jpg`);
  await uploadBytes(imageRef, blob, {
    contentType:"image/jpeg",
    cacheControl:"public,max-age=31536000"
  });
  return await getDownloadURL(imageRef);
}

export { app, db, storage };
