import * as THREE from 'three';
import { PetState } from './PetState.js';

export class Aji {
  constructor(app) {
    this.app=app;let saved={};try{saved=JSON.parse(localStorage.getItem('ateliera_aji')||'{}')||{};}catch{}
    this.state=new PetState(saved);this.time=0;this.activity='idle';this.activityUntil=0;this.lastSaved=0;this.nextGoal=0;
    this.position=new THREE.Vector3(-1.8,-1.54,1.3);this.goal=this.position.clone();
    this.group=new THREE.Group();this.group.name='AjiBlackPomeranian';this.group.position.copy(this.position);app.scene.add(this.group);
    this.group.userData={isInteractable:true,type:'pet',name:'아지',description:'검정 포메라니안 아지를 돌봐 주세요.'};
    this.body=new THREE.Group();this.group.add(this.body);this.buildDog();this.buildBowl();
    this.dialog=document.getElementById('aji-dialog');document.getElementById('open-aji').addEventListener('click',()=>this.open());document.getElementById('close-aji').addEventListener('click',()=>this.dialog.close());
    document.querySelectorAll('[data-aji-action]').forEach(button=>button.addEventListener('click',()=>this.act(button.dataset.ajiAction)));
    let start;
    app.canvasEl.addEventListener('pointerdown',event=>{start={id:event.pointerId,x:event.clientX,y:event.clientY};});
    window.addEventListener('pointerup',event=>{if(!start||start.id!==event.pointerId)return;const tap=start;start=null;if(app.explorer.active||app.isDrawingBlocked||Math.hypot(event.clientX-tap.x,event.clientY-tap.y)>8)return;const data=app.explorer.findTarget(app.getNormalizedPointer(event));if(data?.type==='pet')this.open();});
    this.renderUI();window.addEventListener('pagehide',()=>this.save());
  }
  sphere(parent,r,x,y,z,material,scale=[1,1,1]){const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,12,8),material);mesh.position.set(x,y,z);mesh.scale.set(...scale);mesh.castShadow=true;parent.add(mesh);return mesh;}
  buildDog(){
    const fur=new THREE.MeshStandardMaterial({color:'#15161b',roughness:1});const soft=new THREE.MeshStandardMaterial({color:'#25272c',roughness:1});const muzzle=new THREE.MeshStandardMaterial({color:'#77736c',roughness:1});const black=new THREE.MeshStandardMaterial({color:'#080909',roughness:.3});const eye=new THREE.MeshStandardMaterial({color:'#382519',roughness:.2});const white=new THREE.MeshBasicMaterial({color:'#ffefd7'});
    this.sphere(this.body,.23,0,.32,0,fur,[1.05,1,1.55]);
    for(let i=0;i<28;i++){const angle=i*2.399;this.sphere(this.body,.09,Math.cos(angle)*.21,.3+Math.sin(i*1.7)*.14,Math.sin(angle)*.3,i%3?fur:soft,[1,.85,1.3]);}
    this.head=new THREE.Group();this.head.position.set(0,.5,.25);this.body.add(this.head);
    this.sphere(this.head,.205,0,0,0,fur,[1.1,1,1]);
    for(let i=0;i<14;i++){const angle=i/14*Math.PI*2;this.sphere(this.head,.073,Math.cos(angle)*.19,Math.sin(angle)*.16,-.005,i%4?fur:soft,[1,1.1,.8]);}
    this.eyes=[];this.glints=[];
    for(const x of [-.13,.13]){
      const ear=new THREE.Mesh(new THREE.ConeGeometry(.088,.19,4),fur);ear.position.set(x,.18,-.015);ear.rotation.z=x<0?.3:-.3;this.head.add(ear);
      this.sphere(this.head,.058,x*.62,-.05,.165,muzzle,[1,.8,.8]);
      this.eyes.push(this.sphere(this.head,.044,x*.64,.045,.173,eye,[1,1,.65]));this.glints.push(this.sphere(this.head,.014,x*.64-.011,.06,.203,white));
    }
    this.sphere(this.head,.058,0,-.054,.191,muzzle,[1.05,.7,.55]);this.sphere(this.head,.031,0,-.023,.225,black,[1,.8,.7]);
    this.tongue=this.sphere(this.head,.025,0,-.103,.204,new THREE.MeshStandardMaterial({color:'#d594a0'}),[.8,1,.5]);
    this.legs=[];for(const x of [-.125,.125])for(const z of [-.2,.2])this.legs.push(this.sphere(this.body,.075,x,.1,z,fur,[.7,1.4,.8]));
    this.tail=new THREE.Group();this.tail.position.set(0,.44,-.28);this.body.add(this.tail);for(let i=0;i<7;i++){const t=i/6*Math.PI*1.4;this.sphere(this.tail,.065,Math.sin(t)*.1,.08+Math.cos(t)*.09,-.02,soft);}
    const collar=new THREE.Mesh(new THREE.TorusGeometry(.155,.014,6,18),new THREE.MeshStandardMaterial({color:'#69523c'}));collar.rotation.x=Math.PI/2;collar.position.set(0,.44,.14);this.body.add(collar);
    const tag=this.sphere(this.body,.036,0,.39,.31,new THREE.MeshStandardMaterial({color:'#d9b574',metalness:.5,roughness:.4}),[1,1,.2]);
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=96;const ctx=canvas.getContext('2d');ctx.fillStyle='#26312ae8';ctx.fillRect(0,0,256,96);ctx.fillStyle='#f7e8cc';ctx.font='44px sans-serif';ctx.textAlign='center';ctx.fillText('아지 🐾',128,65);
    this.bubbleTexture=new THREE.CanvasTexture(canvas);this.bubbleTexture.colorSpace=THREE.SRGBColorSpace;this.bubble=new THREE.Sprite(new THREE.SpriteMaterial({map:this.bubbleTexture,depthTest:true}));this.bubble.position.set(0,.99,0);this.bubble.scale.set(.5,.1875,1);this.group.add(this.bubble);this.bubbleCanvas=canvas;
  }
  buildBowl(){
    this.bowl=new THREE.Group();this.bowl.position.set(-2.2,-1.52,1.6);this.app.scene.add(this.bowl);this.bowl.userData={isInteractable:true,type:'pet',name:'아지의 밥그릇',description:'밥을 주고 아지를 돌봅니다.'};
    const dish=new THREE.Mesh(new THREE.CylinderGeometry(.17,.13,.06,20),new THREE.MeshStandardMaterial({color:'#b6bcad',metalness:.2,roughness:.6}));this.bowl.add(dish);
    const foodMat=new THREE.MeshStandardMaterial({color:'#835233'});for(let i=0;i<16;i++)this.sphere(this.bowl,.017,Math.cos(i*2.4)*(.03+i%4*.025),.04,Math.sin(i*2.4)*(.03+i%4*.025),foodMat);
  }
  open(){if(this.app.isDrawingBlocked)return;this.app.onPointerUp();this.app.touchControls?.stop();this.app.explorer.keys.clear();this.renderUI();if(!this.dialog.open)this.dialog.showModal();}
  act(action){const message=this.state.act(action);this.message=message;
    if(action==='feed'&&message.startsWith('냠냠')){this.activity='eat';this.activityUntil=Infinity;this.goal.set(-2.2,-1.54,1.35);}
    if(action==='pet'){this.activity='happy';this.activityUntil=this.time+3;}
    if(action==='play'&&message.startsWith('신나요')){this.activity='play';this.activityUntil=this.time+6;this.nextGoal=0;}
    if(action==='sleep'){this.activity='idle';this.activityUntil=0;}
    this.save();this.renderUI();
  }
  save(){try{localStorage.setItem('ateliera_aji',JSON.stringify(this.state.serialize()));}catch{document.getElementById('aji-message').textContent='저장 공간을 사용할 수 없어 이번 화면에서만 상태가 유지됩니다.';}}
  renderUI(){for(const [id,key] of [['aji-fullness','fullness'],['aji-happiness','happiness'],['aji-energy','energy']]){const element=document.getElementById(id);element.value=this.state[key];document.getElementById(id+'-label').textContent=`${Math.round(this.state[key])}%`;}
    document.getElementById('aji-emotion').textContent=this.state.emotion;document.getElementById('aji-message').textContent=this.message||'화실을 함께 지키는 작은 친구예요.';document.querySelector('[data-aji-action="sleep"]').textContent=this.state.sleeping?'깨우기':'잠 재우기';
  }
  update(delta){
    const dt=Math.min(delta,.1);this.time+=dt;this.state.advance();
    if(this.time>this.activityUntil&&this.activity!=='idle')this.activity='idle';
    const sleeping=this.state.sleeping;
    if(!sleeping&&this.activity!=='eat'&&this.time>this.nextGoal){const goals=[[-1.8,1.3],[-2.7,2.6],[-.9,2.5],[1.2,2.6],[-3.1,1.4]];const point=goals[Math.floor(this.time/7)%goals.length];this.goal.set(point[0],-1.54,point[1]);this.nextGoal=this.time+7;}
    let moving=false;
    if(!sleeping&&this.group.position.distanceTo(this.goal)>.08){const direction=this.goal.clone().sub(this.group.position);direction.y=0;direction.normalize();const speed=this.activity==='play'?.5:.25;const next=this.group.position.clone().addScaledVector(direction,speed*dt);
      if(this.app.explorer.canMove(next.x,next.z)){this.group.position.copy(next);moving=true;this.group.rotation.y=Math.atan2(direction.x,direction.z);}else this.nextGoal=0;
    }
    this.legs.forEach((leg,i)=>leg.position.y=.1+(moving?Math.sin(this.time*12+i%2*Math.PI)*.025:0));
    this.body.position.y=sleeping?-.12:(this.activity==='happy'||this.activity==='play'?Math.abs(Math.sin(this.time*8))*.055:Math.sin(this.time*2)*.006);
    this.body.scale.y=sleeping?.65:1;this.head.rotation.x=this.activity==='eat'?.3+Math.sin(this.time*10)*.07:sleeping?.18:0;this.tail.rotation.z=Math.sin(this.time*(this.state.happiness>65?10:3))*(sleeping?.04:.25);this.tongue.visible=!sleeping&&this.state.happiness>65;
    if(this.activity==='eat'&&this.group.position.distanceTo(this.goal)<.1){this.group.rotation.y=0;if(this.activityUntil===Infinity)this.activityUntil=this.time+4;}
    const blink=sleeping||this.time%4<.12;this.eyes.forEach(eye=>eye.scale.y=blink?.12:1);this.glints.forEach(eye=>eye.visible=!blink);
    if(this.dialog.open)this.renderUI();
    if(this.time-this.lastSaved>30){this.save();this.lastSaved=this.time;this.renderUI();}
    const text=sleeping?'아지 · z Z':this.activity==='eat'?'아지 · 냠냠':this.activity==='happy'||this.activity==='play'?'아지 · ♥':this.state.fullness<25?'아지 · 밥 주세요':'아지 🐾';
    if(text!==this.lastBubble){const ctx=this.bubbleCanvas.getContext('2d');ctx.clearRect(0,0,256,96);ctx.fillStyle='#26312ae8';ctx.fillRect(0,0,256,96);ctx.fillStyle='#f7e8cc';ctx.textAlign='center';ctx.font='30px sans-serif';ctx.fillText(text,128,60);this.bubbleTexture.needsUpdate=true;this.lastBubble=text;}
  }
}
