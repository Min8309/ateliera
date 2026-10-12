import * as THREE from 'three';
import { PetState } from './PetState.js';

export class Aji {
  constructor(app) {
    this.app=app;let saved={};try{saved=JSON.parse(localStorage.getItem('ateliera_aji')||'{}')||{};}catch{}
    this.state=new PetState(saved);this.time=0;this.activity='idle';this.activityUntil=0;this.lastSaved=0;this.nextGoal=0;
    this.position=new THREE.Vector3(-1.8,-1.54,1.3);this.goal=this.position.clone();
    this.group=new THREE.Group();this.group.name='AjiBlackPomeranian';this.group.position.copy(this.position);this.group.scale.setScalar(.5);app.scene.add(this.group);
    this.group.userData={isInteractable:true,type:'pet',name:'아지',description:'검정 포메라니안 아지를 돌봐 주세요.'};
    this.body=new THREE.Group();this.group.add(this.body);this.buildDog();this.buildBowl();this.hungerPhase=null;this.nextBark=0;this.barkUntil=0;
    const unlock=()=>{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;this.audio??=new Audio();if(this.audio.state==='suspended')this.audio.resume().catch(()=>{});};
    window.addEventListener('pointerdown',unlock);window.addEventListener('keydown',unlock);
    this.dialog=document.getElementById('aji-dialog');document.getElementById('open-aji').addEventListener('click',()=>this.open());document.getElementById('close-aji').addEventListener('click',()=>this.dialog.close());
    document.querySelectorAll('[data-aji-action]').forEach(button=>button.addEventListener('click',()=>this.act(button.dataset.ajiAction)));
    let start;
    app.canvasEl.addEventListener('pointerdown',event=>{start={id:event.pointerId,x:event.clientX,y:event.clientY};});
    window.addEventListener('pointerup',event=>{if(!start||start.id!==event.pointerId)return;const tap=start;start=null;if(app.explorer.active||app.isDrawingBlocked||Math.hypot(event.clientX-tap.x,event.clientY-tap.y)>8)return;const data=app.explorer.findTarget(app.getNormalizedPointer(event));if(data?.type==='pet')this.open();});
    this.renderUI();window.addEventListener('pagehide',()=>this.save());
  }
  sphere(parent,r,x,y,z,material,scale=[1,1,1]){const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,24,16),material);mesh.position.set(x,y,z);mesh.scale.set(...scale);mesh.castShadow=true;parent.add(mesh);return mesh;}
  buildDog(){
    const fur=new THREE.MeshStandardMaterial({color:'#15161b',roughness:1});const soft=new THREE.MeshStandardMaterial({color:'#25272c',roughness:1});const muzzle=new THREE.MeshStandardMaterial({color:'#77736c',roughness:1});const black=new THREE.MeshStandardMaterial({color:'#080909',roughness:.3});const eye=new THREE.MeshStandardMaterial({color:'#382519',roughness:.2});const white=new THREE.MeshBasicMaterial({color:'#ffefd7'});
    this.sphere(this.body,.23,0,.32,0,fur,[1.05,1,1.55]);
    this.addFur(this.body,[0,.32,0],[.24,.23,.35],1800,.045);
    this.head=new THREE.Group();this.head.position.set(0,.5,.25);this.body.add(this.head);
    this.sphere(this.head,.205,0,0,0,fur,[1.1,1,1]);
    this.addFur(this.head,[0,0,0],[.224,.205,.205],1400,.04);
    this.eyes=[];this.glints=[];
    for(const x of [-.13,.13]){
      const ear=new THREE.Mesh(new THREE.ConeGeometry(.088,.19,4),fur);ear.position.set(x,.18,-.015);ear.rotation.z=x<0?.3:-.3;this.head.add(ear);
      this.sphere(this.head,.058,x*.62,-.05,.165,muzzle,[1,.8,.8]);
      this.eyes.push(this.sphere(this.head,.044,x*.64,.045,.173,eye,[1,1,.65]));this.glints.push(this.sphere(this.head,.014,x*.64-.011,.06,.203,white));
    }
    this.sphere(this.head,.058,0,-.054,.191,muzzle,[1.05,.7,.55]);this.sphere(this.head,.031,0,-.023,.225,black,[1,.8,.7]);
    this.tongue=this.sphere(this.head,.025,0,-.103,.204,new THREE.MeshStandardMaterial({color:'#d594a0'}),[.8,1,.5]);
    this.legs=[];for(const x of [-.125,.125])for(const z of [-.2,.2])this.legs.push(this.sphere(this.body,.075,x,.1,z,fur,[.7,1.4,.8]));
    this.tail=new THREE.Group();this.tail.position.set(0,.44,-.28);this.body.add(this.tail);for(let i=0;i<7;i++){const t=i/6*Math.PI*1.4;this.sphere(this.tail,.055,Math.sin(t)*.1,.08+Math.cos(t)*.09,-.02,soft);this.addFur(this.tail,[Math.sin(t)*.1,.08+Math.cos(t)*.09,-.02],[.055,.055,.055],100,.035);}
    const collar=new THREE.Mesh(new THREE.TorusGeometry(.155,.014,6,18),new THREE.MeshStandardMaterial({color:'#69523c'}));collar.rotation.x=Math.PI/2;collar.position.set(0,.44,.14);this.body.add(collar);
    const tag=this.sphere(this.body,.036,0,.39,.31,new THREE.MeshStandardMaterial({color:'#d9b574',metalness:.5,roughness:.4}),[1,1,.2]);
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=96;const ctx=canvas.getContext('2d');ctx.fillStyle='#26312ae8';ctx.fillRect(0,0,256,96);ctx.fillStyle='#f7e8cc';ctx.font='44px sans-serif';ctx.textAlign='center';ctx.fillText('아지 🐾',128,65);
    this.bubbleTexture=new THREE.CanvasTexture(canvas);this.bubbleTexture.colorSpace=THREE.SRGBColorSpace;this.bubble=new THREE.Sprite(new THREE.SpriteMaterial({map:this.bubbleTexture,depthTest:true}));this.bubble.position.set(0,.99,0);this.bubble.scale.set(.5,.1875,1);this.group.add(this.bubble);this.bubbleCanvas=canvas;
  }
  addFur(parent,center,radii,count,length){
    // Deterministic curved strands blend into the smooth silhouette without tuft-sized lumps.
    const vertices=[],colors=[];
    for(let i=0;i<count;i++){
      const random=v=>{const n=Math.sin(v*127.1+311.7)*43758.5453;return n-Math.floor(n);};
      const y=1-2*random(i+1),angle=random(i+count)*Math.PI*2,rad=Math.sqrt(1-y*y);
      const n=new THREE.Vector3(rad*Math.cos(angle),y,rad*Math.sin(angle));
      const root=new THREE.Vector3(...center).add(new THREE.Vector3(n.x*radii[0],n.y*radii[1],n.z*radii[2]));
      let previous=root;const size=length*(.65+(i%11)/20);
      for(let j=1;j<=3;j++){const t=j/3;const point=root.clone().addScaledVector(n,size*t);point.y-=size*.7*t*t;vertices.push(...previous.toArray(),...point.toArray());const shade=.09+(i%7)*.009;colors.push(shade,shade,shade*1.06,shade,shade,shade*1.06);previous=point;}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    parent.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.18,depthWrite:false})));
  }
  putBowlDown(){
    if(this.bowl.parent!==this.app.scene){this.app.scene.add(this.bowl);this.bowl.position.copy(this.bowlGround);this.bowl.scale.setScalar(.65);this.bowl.rotation.set(0,0,0);}
  }
  bark(){
    this.barkUntil=this.time+.8;
    if(!this.audio||this.audio.state!=='running'||document.hidden)return;
    const now=this.audio.currentTime;
    for(const offset of [0,.28]){const oscillator=this.audio.createOscillator(),gain=this.audio.createGain();oscillator.type='sawtooth';oscillator.frequency.setValueAtTime(300,now+offset);oscillator.frequency.exponentialRampToValueAtTime(100,now+offset+.13);gain.gain.setValueAtTime(0,now+offset);gain.gain.linearRampToValueAtTime(.018,now+offset+.018);gain.gain.exponentialRampToValueAtTime(.001,now+offset+.16);oscillator.connect(gain);gain.connect(this.audio.destination);oscillator.start(now+offset);oscillator.stop(now+offset+.18);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};}
  }
  updateHunger(){
    const hungry=this.state.fullness<25&&!this.state.sleeping&&this.activity!=='eat';
    if(!hungry){if(this.hungerPhase){this.putBowlDown();this.hungerPhase=null;this.barkUntil=0;this.nextGoal=this.time+2;}return;}
    if(!this.hungerPhase){this.hungerPhase='fetch';this.activity='idle';this.goal.copy(this.bowlGround);this.goal.y=-1.54;this.goal.z-=.2;this.nextBark=this.time;}
    if(this.hungerPhase==='fetch'&&this.group.position.distanceTo(this.goal)<.1){this.hungerPhase='carry';this.head.add(this.bowl);this.bowl.position.set(0,-.13,.3);this.bowl.scale.setScalar(.65);this.goal.set(-1.4,-1.54,.85);}
    if(this.hungerPhase==='carry'&&this.group.position.distanceTo(this.goal)<.1){this.hungerPhase='beg';this.bowlGround.set(-1.4,-1.52,1.08);this.putBowlDown();this.group.rotation.y=0;}
    if(this.time>=this.nextBark&&this.hungerPhase!=='carry'){this.bark();this.nextBark=this.time+9;}
  }
  buildBowl(){
    this.bowl=new THREE.Group();this.bowl.position.set(-2.2,-1.52,1.6);this.app.scene.add(this.bowl);this.bowl.userData={isInteractable:true,type:'pet',name:'아지의 밥그릇',description:'밥을 주고 아지를 돌봅니다.'};
    const dish=new THREE.Mesh(new THREE.CylinderGeometry(.17,.13,.06,20),new THREE.MeshStandardMaterial({color:'#b6bcad',metalness:.2,roughness:.6}));this.bowl.add(dish);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(.155,.016,8,24),dish.material);rim.rotation.x=Math.PI/2;rim.position.y=.034;this.bowl.add(rim);
    const inside=new THREE.Mesh(new THREE.CircleGeometry(.14,24),new THREE.MeshStandardMaterial({color:"#6c7567",roughness:.8}));inside.rotation.x=-Math.PI/2;inside.position.y=.031;this.bowl.add(inside);
    this.bowlGround=this.bowl.position.clone();this.bowl.scale.setScalar(.65);this.food=new THREE.Group();this.bowl.add(this.food);
    const foodMat=new THREE.MeshStandardMaterial({color:'#835233'});for(let i=0;i<16;i++)this.sphere(this.food,.017,Math.cos(i*2.4)*(.03+i%4*.025),.04,Math.sin(i*2.4)*(.03+i%4*.025),foodMat);
  }
  open(){if(this.app.isDrawingBlocked)return;this.app.onPointerUp();this.app.touchControls?.stop();this.app.explorer.keys.clear();this.renderUI();if(!this.dialog.open)this.dialog.showModal();}
  act(action){const message=this.state.act(action);this.message=message;
    if(action==='feed'&&message.startsWith('냠냠')){if(this.hungerPhase==='carry')this.bowlGround.set(this.group.position.x,-1.52,this.group.position.z+.2);this.putBowlDown();this.hungerPhase=null;this.barkUntil=0;this.activity='eat';this.activityUntil=Infinity;this.goal.copy(this.bowlGround);this.goal.y=-1.54;this.goal.z-=.2;}
    if(action==='pet'){this.activity='happy';this.activityUntil=this.time+3;}
    if(action==='play'&&message.startsWith('신나요')){this.activity='play';this.activityUntil=this.time+6;this.nextGoal=0;}
    if(action==='sleep'){this.activity='idle';this.activityUntil=0;}
    this.updateHunger();this.save();this.renderUI();
  }
  save(){try{localStorage.setItem('ateliera_aji',JSON.stringify(this.state.serialize()));}catch{document.getElementById('aji-message').textContent='저장 공간을 사용할 수 없어 이번 화면에서만 상태가 유지됩니다.';}}
  renderUI(){for(const [id,key] of [['aji-fullness','fullness'],['aji-happiness','happiness'],['aji-energy','energy']]){const element=document.getElementById(id);element.value=this.state[key];document.getElementById(id+'-label').textContent=`${Math.round(this.state[key])}%`;}
    document.getElementById('aji-emotion').textContent=this.state.emotion;document.getElementById('aji-message').textContent=this.message||'화실을 함께 지키는 작은 친구예요.';document.querySelector('[data-aji-action="sleep"]').textContent=this.state.sleeping?'깨우기':'잠 재우기';
  }
  update(delta){
    const dt=Math.min(delta,.1);this.time+=dt;this.state.advance();
    if(this.time>this.activityUntil&&this.activity!=='idle')this.activity='idle';
    this.updateHunger();this.food.visible=this.state.fullness>=25;
    const sleeping=this.state.sleeping;
    if(!sleeping&&!this.hungerPhase&&this.activity!=='eat'&&this.time>this.nextGoal){const goals=[[-1.8,1.3],[-2.7,2.6],[-.9,2.5],[1.2,2.6],[-3.1,1.4]];const point=goals[Math.floor(this.time/7)%goals.length];this.goal.set(point[0],-1.54,point[1]);this.nextGoal=this.time+7;}
    let moving=false;
    if(!sleeping&&this.hungerPhase!=='beg'&&this.group.position.distanceTo(this.goal)>.08){const direction=this.goal.clone().sub(this.group.position);direction.y=0;direction.normalize();const speed=this.activity==='play'?.5:.25;const next=this.group.position.clone().addScaledVector(direction,speed*dt);
      if(this.app.explorer.canMove(next.x,next.z)){this.group.position.copy(next);moving=true;this.group.rotation.y=Math.atan2(direction.x,direction.z);}else {if(this.app.explorer.canMove(next.x,this.group.position.z))this.group.position.x=next.x;else if(this.app.explorer.canMove(this.group.position.x,next.z))this.group.position.z=next.z;this.nextGoal=0;}
    }
    const begging=this.hungerPhase==='beg',woof=this.time<this.barkUntil;
    this.legs.forEach((leg,i)=>leg.position.y=.1+(moving?Math.sin(this.time*12+i%2*Math.PI)*.025:begging&&i%2===1?Math.max(0,Math.sin(this.time*6))*.05:0));
    this.body.position.y=sleeping?-.12:(this.activity==='happy'||this.activity==='play'?Math.abs(Math.sin(this.time*8))*.055:Math.sin(this.time*2)*.006);
    this.body.scale.y=sleeping?.65:1;this.head.rotation.x=this.activity==='eat'?.3+Math.sin(this.time*10)*.07:sleeping?.18:woof?Math.sin(this.time*22)*.12:begging?-.1:0;this.tail.rotation.z=Math.sin(this.time*(this.state.happiness>65?10:3))*(sleeping?.04:.25);this.tongue.visible=!sleeping&&this.hungerPhase!=='carry'&&(this.state.happiness>65||woof);
    if(this.activity==='eat'&&this.group.position.distanceTo(this.goal)<.1){this.group.rotation.y=0;if(this.activityUntil===Infinity)this.activityUntil=this.time+4;}
    const blink=sleeping||this.time%4<.12;this.eyes.forEach(eye=>eye.scale.y=blink?.12:1);this.glints.forEach(eye=>eye.visible=!blink);
    if(this.dialog.open)this.renderUI();
    if(this.time-this.lastSaved>30){this.save();this.lastSaved=this.time;this.renderUI();}
    const text=woof?'멍멍! 밥 주세요':this.hungerPhase==='carry'?'밥그릇 배달 중':begging?'밥 주세요!':sleeping?'아지 · z Z':this.activity==='eat'?'아지 · 냠냠':this.activity==='happy'||this.activity==='play'?'아지 · ♥':this.state.fullness<25?'아지 · 밥 주세요':'아지 🐾';
    if(text!==this.lastBubble){const ctx=this.bubbleCanvas.getContext('2d');ctx.clearRect(0,0,256,96);ctx.fillStyle='#26312ae8';ctx.fillRect(0,0,256,96);ctx.fillStyle='#f7e8cc';ctx.textAlign='center';ctx.font='30px sans-serif';ctx.fillText(text,128,60);this.bubbleTexture.needsUpdate=true;this.lastBubble=text;}
  }
}
