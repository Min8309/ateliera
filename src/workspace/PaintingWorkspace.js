import * as THREE from 'three';
import { ArtworkRepository, artworkDate, ARTWORK_LIMIT } from './ArtworkRepository.js';
import { keepCameraAboveFloor } from './CameraBounds.js';
import { CANVAS_PRESETS } from '../drawing/CanvasPresets.js';

export class PaintingWorkspace {
  constructor(app) {
    this.app=app;this.zoom=1;this.pan=0;this.repository=new ArtworkRepository();this.status=document.getElementById('storage-status');
    document.getElementById('view-zoom').addEventListener('input',event=>{this.zoom=Number(event.target.value);this.applyView();});
    document.getElementById('view-pan').addEventListener('input',event=>{this.pan=Number(event.target.value);this.applyView();});
    document.getElementById('view-reset').addEventListener('click',()=>this.reset());
    document.getElementById('view-zoom-in').addEventListener('click',()=>{this.zoom=Math.min(4,this.zoom*1.25);this.applyView();});
    document.getElementById('view-zoom-out').addEventListener('click',()=>{this.zoom=Math.max(1,this.zoom/1.25);this.applyView();});
    app.controls.enableZoom=false;app.controls.minDistance=.3;
    app.canvasEl.addEventListener('wheel',event=>{
      if(app.explorer?.active||app.isDrawingBlocked)return;
      event.preventDefault();app.onPointerUp();
      if(event.ctrlKey||event.metaKey)this.zoom=THREE.MathUtils.clamp(this.zoom*Math.exp(-event.deltaY*.002),1,4);
      else this.pan=THREE.MathUtils.clamp(this.pan+event.deltaY*.002/this.zoom,-1.2,1.2);
      this.applyView();
    },{passive:false,capture:true});
    document.getElementById('save-artwork').addEventListener('click',()=>this.save());
    document.getElementById('saved-date').value=artworkDate();
    document.getElementById('toggle-studio-settings').addEventListener('click',()=>document.querySelector('.studio-panel').classList.toggle('mobile-open'));
    document.getElementById('toggle-storage').addEventListener('click',()=>{
      const panel=document.getElementById('artwork-storage');panel.classList.toggle('mobile-open');
      if(!panel.classList.contains('mobile-open'))this.app.explorer.keys.clear();
      document.getElementById('toggle-storage').setAttribute('aria-expanded',String(panel.classList.contains('mobile-open')));
    });
    this.rack=new THREE.Group();this.rack.name='TenArtworkStorage';this.rack.position.set(5.35,0,1.5);this.rack.rotation.y=-Math.PI/2;app.scene.add(this.rack);this.buildRack();
    this.previewDialog=document.getElementById('stored-artwork-dialog');
    document.getElementById('close-stored-preview').addEventListener('click',()=>this.previewDialog.close());
    document.getElementById('restore-stored-preview').addEventListener('click',()=>{if(this.previewRecord){this.previewDialog.close();this.restore(this.previewRecord);}});
    let tap=null;
    app.canvasEl.addEventListener('pointerdown',event=>{if(!app.explorer.active)tap={x:event.clientX,y:event.clientY,id:event.pointerId};});
    window.addEventListener('pointerup',event=>{if(!tap||tap.id!==event.pointerId)return;const start=tap;tap=null;if(app.explorer.active||app.isDrawingBlocked||Math.hypot(event.clientX-start.x,event.clientY-start.y)>8)return;const data=app.explorer.findTarget(app.getNormalizedPointer(event));if(data?.type==='stored-artwork')this.openPreview(data.artworkId);else if(data?.type==='storage')this.openStorage();});
    this.initialize();
    this.resizeObserver=new ResizeObserver(()=>app.onResize());
    for(const element of [app.canvasEl,document.querySelector('.drawing-dock'),document.querySelector('.studio-panel'),document.getElementById('artwork-storage')])this.resizeObserver.observe(element);
    app.onResize();
  }
  openStorage(){this.app.touchControls?.stop();document.getElementById('artwork-storage').classList.add('mobile-open');}
  async openPreview(id){
    if(this.app.isDrawingBlocked)return;
    try{
      const record=(await this.repository.list()).find(item=>item.id===id);if(!record)return;
      this.app.touchControls?.stop();this.app.explorer.keys.clear();this.previewRecord=record;
      document.getElementById('stored-preview-title').textContent=record.title;
      document.getElementById('stored-preview-date').textContent=record.dateLabel;
      const image=document.getElementById('stored-preview-image');image.src=record.previewUrl;image.alt=record.title;
      if(!this.previewDialog.open)this.previewDialog.showModal();
    }catch(e){this.status.textContent=e.message;}
  }
  async initialize(){
    try{
      const existing=await this.repository.list();
      if(!existing.length){
        let legacy=[];
        try{if(!localStorage.getItem('ateliera_storage_migrated'))legacy=JSON.parse(localStorage.getItem('ateliera_gallery_artworks')||'[]');}catch{}
        if(Array.isArray(legacy))for(const old of legacy.filter(item=>item&&Array.isArray(item.strokesData)&&typeof item.previewUrl==='string'&&item.previewUrl.startsWith('data:image/')).slice(0,ARTWORK_LIMIT)){
          const date=new Date(old.completedAt);await this.repository.put({
            id:old.id||`legacy-${Date.now()}`,title:String(old.title||'이전 작품').slice(0,80),dateLabel:artworkDate(Number.isFinite(date.getTime())?date:new Date()),
            updatedAt:Number.isFinite(date.getTime())?date.toISOString():new Date().toISOString(),width:old.width||2048,height:old.height||2048,
            strokesData:old.strokesData,previewUrl:await this.thumbnail(old.previewUrl)
          });
        }
      }
      try{localStorage.setItem('ateliera_storage_migrated','1');}catch{}
    }catch(e){this.status.textContent=`이전 작품 가져오기를 완료하지 못했습니다: ${e.message}`;}
    await this.refresh();
  }
  reset(){this.zoom=1;this.pan=0;this.applyView();}
  applyView(){
    if(this.app.explorer?.active||this.app.isDrawingBlocked)return;
    this.app.onPointerUp();
    const width=innerWidth,height=innerHeight;
    const studio=document.querySelector('.studio-panel'),storage=document.getElementById('artwork-storage');
    const left=getComputedStyle(studio).display!=='none'&&width>800?studio.getBoundingClientRect().right+12:12;
    const right=getComputedStyle(storage).display!=='none'&&width>800?storage.getBoundingClientRect().left-12:width-12;
    const compact=matchMedia('(max-width: 800px), (pointer: coarse)').matches;
    const top=compact?(height<500?70:140):90;
    let bottom=document.querySelector('.drawing-dock').getBoundingClientRect().top-12;
    for(const selector of ['.touch-mode-controls','#brush-settings']){
      const element=document.querySelector(selector);
      const display=getComputedStyle(element).display,rect=element.getBoundingClientRect();
      if(display!=='none'&&display!=='contents'&&rect.height>0)bottom=Math.min(bottom,rect.top-12);
    }
    const freeWidth=Math.max(100,right-left),freeHeight=Math.max(100,bottom-top);
    // Shift the projection toward the free painting area while the room fills the screen.
    this.app.camera.setViewOffset(width,height,width/2-(left+right)/2,height/2-(top+bottom)/2,width,height);
    const distance=Math.max(2.6*height/freeHeight,2.6*height/freeWidth)/this.zoom;
    this.app.controls.maxDistance=Math.max(6,distance*1.5);
    this.app.controls.target.set(0,-this.pan,0);this.app.camera.position.set(0,-this.pan,distance);keepCameraAboveFloor(this.app.camera,this.app.controls);this.app.controls.update();
    document.getElementById('view-zoom').value=this.zoom;document.getElementById('view-pan').value=this.pan;
    document.getElementById('view-percent').textContent=`${Math.round(this.zoom*100)}%`;
  }
  buildRack(){
    const wood=this.app.environment.wood,metal=this.app.environment.metal;
    const box=(w,h,d,x,y,z,mat)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);this.rack.add(mesh);return mesh;};
    // Flat drawers beneath an upright drying rack on the right-hand wall.
    box(1.8,1.05,.9,4.8,-1,1.8,wood);
    for(let i=0;i<10;i++){box(1.7,.065,.06,4.8,-1.43+i*.095,2.27,wood);box(.18,.022,.04,4.8,-1.43+i*.095,2.32,metal);}
    for(const x of [3.7,5.85])box(.055,1.9,.6,x,.05,1.8,metal);
    this.slots=[];
    for(let i=0;i<10;i++){
      const canvas=box(.025,1.1,.65,4.03+i*.165,.15,1.8,new THREE.MeshStandardMaterial({color:'#e6dac0'}));
      const labelCanvas=document.createElement('canvas');labelCanvas.width=256;labelCanvas.height=96;
      const texture=new THREE.CanvasTexture(labelCanvas);texture.colorSpace=THREE.SRGBColorSpace;
      const label=new THREE.Mesh(new THREE.PlaneGeometry(.15,.07),new THREE.MeshBasicMaterial({map:texture}));label.position.set(4.03+i*.165,-.42,2.15);this.rack.add(label);
      this.slots.push({canvas,labelCanvas,texture});
    }
    for(const child of this.rack.children){child.position.x-=4.8;child.position.z-=1.8;}
    this.rack.updateMatrixWorld(true);this.app.explorer.colliders.push(new THREE.Box3().setFromObject(this.rack));
    this.rack.userData={isInteractable:true,type:'storage',name:'작품 보관대',description:'최대 10장의 작품을 제목과 날짜로 보관합니다.'};
  }
  async thumbnail(dataUrl){
    const image=new Image();image.src=dataUrl;await image.decode();const canvas=document.createElement('canvas');
    const scale=Math.min(1,512/Math.max(image.width,image.height));canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/webp',.85);
  }
  async save(completed){
    if(!completed&&(this.app.isDrawingBlocked||this.app.explorer.active))return;
    const button=document.getElementById('save-artwork');if(button.disabled)return;button.disabled=true;
    try{
      this.app.onPointerUp();
      const record={id:this.app.currentArtwork.id,title:completed?.title||document.getElementById('saved-title').value.trim()||'제목 없는 그림',
        dateLabel:document.getElementById('saved-date').value||artworkDate(),updatedAt:new Date().toISOString(),
        width:this.app.dualCanvas.width,height:this.app.dualCanvas.height,strokesData:structuredClone(this.app.currentArtwork.strokes),
        previewUrl:await this.thumbnail(completed?.previewUrl||this.app.volumeRenderer.exportPNG(this.app.renderer,this.app.dualCanvas,this.app.drawingPlane))};
      await this.repository.put(record);this.status.textContent='그림을 보관했습니다.';await this.refresh();
    }catch(error){this.status.textContent=`저장하지 못했습니다: ${error.message}`;}finally{button.disabled=false;}
  }
  async refresh(){
    try{
      const records=await this.repository.list(),list=document.getElementById('stored-artworks');list.replaceChildren();
      document.getElementById('storage-count').textContent=`${records.length} / ${ARTWORK_LIMIT}`;
      records.forEach(record=>{
        const card=document.createElement('article');card.className='stored-artwork';
        const image=document.createElement('img');image.src=record.previewUrl;image.alt=record.title;card.append(image);
        const title=document.createElement('input');title.value=record.title;title.maxLength=80;title.setAttribute('aria-label','작품 제목');card.append(title);
        const label=document.createElement('time');label.dateTime=record.dateLabel;label.textContent=record.dateLabel;label.style.gridColumn='1/-1';label.style.fontSize='.7rem';card.append(label);
        const date=document.createElement('input');date.type='date';date.value=record.dateLabel;date.setAttribute('aria-label','그림 날짜');card.append(date);
        const edit=async()=>{try{record.title=title.value.trim()||'제목 없는 그림';record.dateLabel=date.value||artworkDate();await this.repository.put(record);if(record.id===this.app.currentArtwork.id){document.getElementById('saved-title').value=record.title;document.getElementById('saved-date').value=record.dateLabel;}await this.refresh();}catch(e){this.status.textContent=e.message;}};
        title.addEventListener('change',edit);date.addEventListener('change',edit);
        const open=document.createElement('button');open.textContent='그림 보기';open.addEventListener('click',()=>this.openPreview(record.id));card.append(open);
        const remove=document.createElement('button');remove.textContent='삭제';remove.addEventListener('click',async()=>{if(confirm(`“${record.title}”을 보관대에서 삭제할까요?`)){try{await this.repository.remove(record.id);await this.refresh();}catch(e){this.status.textContent=e.message;}}});card.append(remove);list.append(card);
      });
      this.slots.forEach((slot,i)=>{const record=records[i],ctx=slot.labelCanvas.getContext('2d');ctx.fillStyle='#efe2c7';ctx.fillRect(0,0,256,96);ctx.fillStyle='#453929';ctx.font='24px sans-serif';ctx.fillText(record?record.title.slice(0,9):`빈칸 ${i+1}`,8,35);ctx.font='20px sans-serif';ctx.fillText(record?.dateLabel||'작품 보관',8,75);slot.texture.needsUpdate=true;const data=record?{isInteractable:true,type:'stored-artwork',artworkId:record.id,name:record.title,description:record.dateLabel}:{isInteractable:true,type:'storage',name:'빈 작품 보관칸',description:'새 그림을 보관합니다.'};slot.canvas.userData=data;this.rack.children.find(child=>child.material?.map===slot.texture).userData=data;slot.canvas.material.color.set(record?'#ffffff':'#a89e89');slot.canvas.material.map?.dispose();slot.canvas.material.map=record?new THREE.TextureLoader().load(record.previewUrl):null;if(slot.canvas.material.map)slot.canvas.material.map.colorSpace=THREE.SRGBColorSpace;slot.canvas.material.needsUpdate=true;});
    }catch(e){this.status.textContent=`보관함을 열지 못했습니다: ${e.message}`;}
  }
  restore(record){
    if(this.app.isDrawingBlocked)return;
    if(this.app.currentArtwork.strokes.length&&!confirm('현재 작업을 저장하지 않았다면 사라집니다. 보관한 그림을 열까요?'))return;
    if(this.app.explorer.active)this.app.explorer.leave();this.app.onPointerUp();
    const preset=Object.entries(CANVAS_PRESETS).find(([,p])=>p.width===record.width&&p.height===record.height);
    if(!preset){this.status.textContent='이 캔버스 크기는 지원되지 않습니다.';return;}
    this.app.setCanvasPreset(preset[0]);this.app.frameBuilder.removeFrame();
    this.app.currentArtwork={id:record.id,width:record.width,height:record.height,strokes:structuredClone(record.strokesData),createdAt:record.updatedAt};
    this.app.undoneStrokes=[];this.app.redrawAllStrokes();this.app.updateHUDStats();this.app.updateHistoryButtons();
    document.getElementById('saved-title').value=record.title;document.getElementById('saved-date').value=record.dateLabel;
    document.getElementById('canvas-preset').value=preset[0];document.getElementById('artwork-storage').classList.remove('mobile-open');this.reset();
    this.status.textContent='보관한 그림을 열었습니다.';
  }
}
