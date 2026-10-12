import * as THREE from 'three';

export class TouchControls {
  constructor(app) {
    if(navigator.maxTouchPoints>0)document.body.classList.add('touch-enabled');
    window.addEventListener('pointerdown',event=>{if(event.pointerType==='touch')document.body.classList.add('touch-enabled');},{capture:true});
    this.app=app;this.points=new Map();this.gesture=null;this.stickId=null;
    const stick=document.getElementById('move-joystick'),knob=document.getElementById('joystick-knob');
    const stop=()=>{this.stickId=null;app.explorer.touchMove={x:0,y:0};knob.style.transform='translate(0,0)';};
    this.stop=stop;this.updateMode();
    document.getElementById('touch-mode').addEventListener('click',()=>{
      stop();if(app.isDrawingBlocked||app.explorer.modalOpen())return;
      if(app.explorer.active)app.explorer.leave();else app.explorer.enter({preserveView:true});
    });
    document.getElementById('touch-cart').addEventListener('click',()=>{stop();app.explorer.openCart();});
    document.getElementById('touch-help').addEventListener('click',()=>{stop();document.getElementById('btn-space-help').click();});
    document.getElementById('touch-materials').addEventListener('click',()=>{stop();app.explorer.visitShop();});
    stick.addEventListener('pointerdown',event=>{
      if(!app.explorer.active||app.explorer.modalOpen()||this.stickId!==null)return;
      event.preventDefault();this.stickId=event.pointerId;stick.setPointerCapture(event.pointerId);this.moveStick(event,stick,knob);
    });
    stick.addEventListener('pointermove',event=>{if(event.pointerId===this.stickId)this.moveStick(event,stick,knob);});
    for(const name of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(name,event=>{if(event.pointerId===this.stickId)stop();});
    window.addEventListener('blur',()=>{stop();this.cancelGesture();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();this.cancelGesture();}});
    app.canvasEl.addEventListener('pointerdown',event=>{
      if(event.pointerType!=='touch'||app.explorer.active||app.isDrawingBlocked)return;
      this.points.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(this.points.size<2&&!this.gesture)return;
      event.preventDefault();event.stopImmediatePropagation();
      if(!this.gesture){
        // Discard a lone initial tap so a two-finger gesture leaves no paint dot.
        if(app.currentStroke?.points.length===1){
          const captured=app.activePointerId;app.isDrawing=false;app.currentStroke=null;app.activePointerId=null;app.brush.points=[];
          if(captured!==null&&app.canvasEl.hasPointerCapture(captured))app.canvasEl.releasePointerCapture(captured);
          app.redrawAllStrokes();
        }else app.onPointerUp();
        this.gesture=this.measure();
        this.gesture.zoom=app.workspace.zoom;this.gesture.pan=app.workspace.pan;
      }
      app.canvasEl.setPointerCapture(event.pointerId);
    },{capture:true,passive:false});
    window.addEventListener('pointermove',event=>{
      if(!this.points.has(event.pointerId))return;
      this.points.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(!this.gesture)return;
      event.preventDefault();event.stopImmediatePropagation();
      if(this.points.size<2)return;
      const current=this.measure();
      app.workspace.zoom=THREE.MathUtils.clamp(this.gesture.zoom*current.distance/Math.max(1,this.gesture.distance),1,4);
      app.workspace.pan=THREE.MathUtils.clamp(this.gesture.pan+(current.y-this.gesture.y)*.004/app.workspace.zoom,-1.2,1.2);
      app.workspace.applyView();
    },{capture:true,passive:false});
    const finish=event=>{
      if(!this.points.has(event.pointerId))return;
      this.points.delete(event.pointerId);
      if(!this.gesture)return;
      event.preventDefault();event.stopImmediatePropagation();
      if(!this.points.size)this.gesture=null;
    };
    window.addEventListener('pointerup',finish,{capture:true,passive:false});
    window.addEventListener('pointercancel',finish,{capture:true,passive:false});
  }
  updateMode(){const button=document.getElementById('touch-mode');button.textContent=this.app.explorer.active?'그리기 모드':'화실 이동';button.setAttribute('aria-pressed',String(this.app.explorer.active));}
  measure(){const [a,b]=[...this.points.values()];return {distance:Math.hypot(b.x-a.x,b.y-a.y),y:(a.y+b.y)/2};}
  cancelGesture(){this.points.clear();this.gesture=null;this.app.onPointerUp();}
  moveStick(event,stick,knob){
    const rect=stick.getBoundingClientRect(),radius=rect.width*.32;
    let x=(event.clientX-rect.left-rect.width/2)/radius,y=(event.clientY-rect.top-rect.height/2)/radius;
    const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}
    this.app.explorer.touchMove=length<.12?{x:0,y:0}:{x,y};knob.style.transform=`translate(${x*radius}px,${y*radius}px)`;
  }
}
