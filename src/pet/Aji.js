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
    const fur=new THREE.MeshStandardMaterial({color:'#202127',roughness:.92});
    const grey=new THREE.MeshStandardMaterial({color:'#3c3e46',roughness:.94});
    const face=new THREE.MeshStandardMaterial({color:'#484b53',roughness:.95});
    const black=new THREE.MeshStandardMaterial({color:'#08090b',roughness:.22});
    const eye=new THREE.MeshStandardMaterial({color:'#151318',roughness:.12});
    const pawWhite=new THREE.MeshStandardMaterial({color:'#eeeae3',roughness:.95});
    const glint=new THREE.MeshBasicMaterial({color:'#ffffff'});
    // Continuous softly scalloped surfaces give the plush reference silhouette.
    // Short overlapping cheek and chest shapes blend into the mane, without wire-like hairs.
    this.fluff(this.body,.27,[0,.34,-.03],[1.04,1.05,1.22],fur,.045);
    this.fluff(this.body,.28,[0,.43,.12],[1.12,1.08,.87],grey,.065);
    this.head=new THREE.Group();this.head.position.set(0,.65,.2);this.body.add(this.head);
    this.fluff(this.head,.25,[0,0,0],[1.13,1,.91],fur,.045);
    for(const x of [-1,1]){
      this.fluff(this.head,.135,[x*.18,-.04,.07],[1,.92,.93],grey,.05);
      this.fluff(this.head,.12,[x*.13,-.14,.1],[1.08,.78,1],grey,.06);
      const shape=new THREE.Shape();shape.moveTo(-.065,0);shape.quadraticCurveTo(-.06,.06,-.025,.13);shape.quadraticCurveTo(0,.17,.025,.13);shape.quadraticCurveTo(.06,.06,.065,0);shape.closePath();
      const geometry=new THREE.ExtrudeGeometry(shape,{depth:.028,bevelEnabled:true,bevelSize:.018,bevelThickness:.015,bevelSegments:4,curveSegments:12,steps:1});
      const ear=new THREE.Mesh(geometry,fur);ear.position.set(x*.16,.165,-.015);ear.rotation.z=-x*.15;ear.castShadow=true;this.head.add(ear);
      const inner=new THREE.Mesh(new THREE.ShapeGeometry(shape,12),face);inner.position.set(x*.16,.18,.03);inner.scale.set(.52,.65,1);inner.rotation.z=-x*.15;this.head.add(inner);
    }
    this.eyes=[];this.glints=[];
    for(const x of [-.095,.095]){
      this.sphere(this.head,.043,x,.025,.212,face,[1.14,1,.5]);
      this.eyes.push(this.sphere(this.head,.032,x,.027,.237,eye,[1,1,.7]));
      this.glints.push(this.sphere(this.head,.009,x-.009,.037,.258,glint));
      this.sphere(this.head,.035,x,.098,.186,grey,[1.25,.55,.45]);
      this.fluff(this.head,.065,[x*.43,-.069,.237],[1.05,.85,.73],face,.025);
    }
    this.sphere(this.head,.033,0,-.046,.299,black,[1.1,.82,.75]);
    const smile=new THREE.CatmullRomCurve3([new THREE.Vector3(-.063,-.092,.283),new THREE.Vector3(-.03,-.103,.292),new THREE.Vector3(0,-.089,.294),new THREE.Vector3(.03,-.103,.292),new THREE.Vector3(.063,-.092,.283)]);
    this.head.add(new THREE.Mesh(new THREE.TubeGeometry(smile,20,.0035,6,false),black));
    this.tongue=this.sphere(this.head,.021,0,-.113,.28,new THREE.MeshStandardMaterial({color:'#b77787'}),[.8,1,.4]);
    this.legs=[];
    for(const x of [-.145,.145])for(const z of [-.19,.2]){
      const leg=new THREE.Group();leg.position.set(x,.1,z);this.body.add(leg);this.legs.push(leg);
      this.fluff(leg,.073,[0,.044,0],[.92,1.48,.98],grey,.035);
      const paw=this.sphere(leg,.074,0,-.055,.016,pawWhite,[1,.63,1.13]);paw.name='AjiWhitePawTip';
      for(const toe of [-.025,.025])this.sphere(leg,.012,toe,-.06,.087,pawWhite,[.75,.8,.5]);
    }
    this.tail=new THREE.Group();this.tail.position.set(0,.48,-.29);this.body.add(this.tail);
    this.fluff(this.tail,.12,[-.055,.08,0],[1,1.28,.9],fur,.07);
    this.fluff(this.tail,.14,[-.025,.18,.07],[1.06,.84,1.05],grey,.075);
    this.fluff(this.tail,.115,[.055,.17,.15],[.95,.85,1.12],fur,.07);
    const collar=new THREE.Mesh(new THREE.TorusGeometry(.17,.009,8,24),new THREE.MeshStandardMaterial({color:'#594938'}));collar.rotation.x=Math.PI/2;collar.position.set(0,.46,.16);this.body.add(collar);
    this.sphere(this.body,.028,0,.38,.31,new THREE.MeshStandardMaterial({color:'#bda16b',metalness:.5,roughness:.4}),[1,1,.22]);
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=96;const ctx=canvas.getContext('2d');ctx.fillStyle='#26312ae8';ctx.fillRect(0,0,256,96);ctx.fillStyle='#f7e8cc';ctx.font='44px sans-serif';ctx.textAlign='center';ctx.fillText('아지 🐾',128,65);
    this.bubbleTexture=new THREE.CanvasTexture(canvas);this.bubbleTexture.colorSpace=THREE.SRGBColorSpace;this.bubble=new THREE.Sprite(new THREE.SpriteMaterial({map:this.bubbleTexture,depthTest:true}));this.bubble.position.set(0,.99,0);this.bubble.scale.set(.5,.1875,1);this.group.add(this.bubble);this.bubbleCanvas=canvas;
  }
  fluff(parent,radius,center,scale,material,amount){
    const geometry=new THREE.SphereGeometry(radius,40,28),positions=geometry.attributes.position;
    for(let i=0;i<positions.count;i++){
      const x=positions.getX(i)/radius,y=positions.getY(i)/radius,z=positions.getZ(i)/radius;
      const ripple=Math.sin(x*13+y*3)*Math.sin(y*11-z*4)*Math.sin(z*12+x*2);
      const factor=1+amount*.4*ripple;positions.setXYZ(i,x*radius*factor,y*radius*factor,z*radius*factor);
    }
    geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...center);mesh.scale.set(...scale);mesh.castShadow=true;parent.add(mesh);return mesh;
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
    this.body.scale.y=sleeping?.65:1;this.head.rotation.x=this.activity==='eat'?.3+Math.sin(this.time*10)*.07:sleeping?.18:woof?Math.sin(this.time*22)*.12:begging?-.1:0;this.tail.rotation.z=Math.sin(this.time*(this.state.happiness>65?10:3))*(sleeping?.04:.25);this.tongue.visible=!sleeping&&this.hungerPhase!=='carry'&&(this.activity==='play'||woof);
    if(this.activity==='eat'&&this.group.position.distanceTo(this.goal)<.1){this.group.rotation.y=0;if(this.activityUntil===Infinity)this.activityUntil=this.time+4;}
    const blink=sleeping||this.time%4<.12;this.eyes.forEach(eye=>eye.scale.y=blink?.12:1);this.glints.forEach(eye=>eye.visible=!blink);
    if(this.dialog.open)this.renderUI();
    if(this.time-this.lastSaved>30){this.save();this.lastSaved=this.time;this.renderUI();}
    const text=woof?'멍멍! 밥 주세요':this.hungerPhase==='carry'?'밥그릇 배달 중':begging?'밥 주세요!':sleeping?'아지 · z Z':this.activity==='eat'?'아지 · 냠냠':this.activity==='happy'||this.activity==='play'?'아지 · ♥':this.state.fullness<25?'아지 · 밥 주세요':'아지 🐾';
    if(text!==this.lastBubble){const ctx=this.bubbleCanvas.getContext('2d');ctx.clearRect(0,0,256,96);ctx.fillStyle='#26312ae8';ctx.fillRect(0,0,256,96);ctx.fillStyle='#f7e8cc';ctx.textAlign='center';ctx.font='30px sans-serif';ctx.fillText(text,128,60);this.bubbleTexture.needsUpdate=true;this.lastBubble=text;}
  }
}
