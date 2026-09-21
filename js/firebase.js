// Firebase do Controle de Frota
// Todos os dados do sistema ficam no Cloud Firestore.
// Não existe localStorage como fonte de dados: carros, funcionários,
// agendamentos, histórico e fotos são lidos/escritos no Firebase.
import { firebaseConfig } from "./firebase-config.js";

const ROOT = "frota";
const COLLECTIONS = ["cars", "employees", "bookings", "history"];
let servicesPromise = null;
let saveQueue = Promise.resolve();

async function services(){
  if(!servicesPromise){
    servicesPromise = (async()=>{
      const [{initializeApp},{getFirestore,collection,getDocs,doc,writeBatch,serverTimestamp,onSnapshot}] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js")
      ]);
      const app = initializeApp(firebaseConfig);
      const db = getFirestore(app);
      return {app,db,collection,getDocs,doc,writeBatch,serverTimestamp,onSnapshot};
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
  return result;
}

// Sincronização em tempo real. Qualquer alteração feita por você ou por
// um funcionário aparece nos outros aparelhos sem precisar atualizar a página.
export async function subscribeFleetData(onData){
  const s = await services();
  const current = {cars:[],employees:[],bookings:[],history:[]};
  let readyCount = 0;
  let firstResolve;
  let firstReject;
  const first = new Promise((resolve,reject)=>{firstResolve=resolve;firstReject=reject;});
  const unsubs = [];
  let settled = false;

  const emit = ()=>{
    onData({
      cars:[...current.cars],
      employees:[...current.employees],
      bookings:[...current.bookings],
      history:[...current.history]
    });
  };

  try{
    COLLECTIONS.forEach(name=>{
      const unsub=s.onSnapshot(collectionPath(s,name),snap=>{
        current[name]=snap.docs.map(item=>({id:item.id,...item.data()}));
        readyCount++;
        emit();
        if(readyCount>=COLLECTIONS.length && !settled){settled=true;firstResolve();}
      },err=>{
        console.error(`Firestore (${name})`,err);
        if(!settled){settled=true;firstReject(err);}
      });
      unsubs.push(unsub);
    });
  }catch(error){
    unsubs.forEach(fn=>{try{fn()}catch{}});
    throw error;
  }

  await first;
  return ()=>unsubs.forEach(fn=>{try{fn()}catch{}});
}

async function replaceCollection(s,name,items){
  const refCol = collectionPath(s,name);
  const current = await s.getDocs(refCol);
  const wanted = new Set(items.map(item=>String(item.id)));
  const operations=[];
  for(const oldDoc of current.docs){
    if(!wanted.has(oldDoc.id)) operations.push({type:"delete",ref:oldDoc.ref});
  }
  for(const item of items){
    if(item?.id) operations.push({type:"set",ref:s.doc(refCol,String(item.id)),data:item});
  }
  while(operations.length){
    const batch=s.writeBatch(s.db);
    const chunk=operations.splice(0,450);
    for(const op of chunk){
      if(op.type==="delete") batch.delete(op.ref);
      else batch.set(op.ref,op.data);
    }
    await batch.commit();
  }
}

export function saveFleetData(data){
  const clean=JSON.parse(JSON.stringify(data));
  saveQueue=saveQueue.then(async()=>{
    const s=await services();
    for(const name of COLLECTIONS){
      await replaceCollection(s,name,Array.isArray(clean[name])?clean[name]:[]);
    }
    const meta=s.doc(s.db,ROOT,"_meta","state");
    const batch=s.writeBatch(s.db);
    batch.set(meta,{updatedAt:s.serverTimestamp(),clientUpdatedAt:Date.now()},{merge:true});
    await batch.commit();
  });
  return saveQueue;
}

function compressImage(file,maxSide=900,quality=0.68){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
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

// As fotos também ficam no Firestore, em formato JPEG comprimido.
// Isso deixa o projeto dependente somente do Firestore para os dados.
export async function prepareCarImage(file){
  if(!file) return null;
  if(file.size>10*1024*1024) throw new Error("A foto precisa ter no máximo 10 MB.");
  const blob=await compressImage(file);
  if(blob.size>700*1024) throw new Error("A foto ficou muito grande. Escolha outra foto ou reduza a resolução.");
  return await new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onerror=()=>reject(r.error||new Error("Não foi possível preparar a foto."));
    r.onload=()=>resolve(r.result);
    r.readAsDataURL(blob);
  });
}

// Mantido para compatibilidade com versões antigas do app.
export async function uploadCarImage(file){ return prepareCarImage(file); }

export async function getFirebaseStatus(){
  try{await services();return {ok:true};}
  catch(error){return {ok:false,error};}
}
