export class MobileBrushPanel {
  constructor(app) {
    this.app=app;
    this.panel=document.getElementById('brush-settings');
    this.media=matchMedia('(max-width: 800px), (pointer: coarse)');
    this.buttons=[...document.querySelectorAll('.btn-tool-tab')];
    for(const button of this.buttons)button.addEventListener('click',()=>{
      if(!this.media.matches)return;
      document.getElementById('brush-settings-title').textContent=`${button.textContent.trim()} · 색상과 크기`;
      this.setOpen(true,button);
    });
    document.getElementById('close-brush-settings').addEventListener('click',()=>this.setOpen(false));
    app.canvasEl.addEventListener('pointerdown',()=>this.setOpen(false),{capture:true});
    document.addEventListener('keydown',event=>{if(event.code==='Escape')this.setOpen(false);});
    this.media.addEventListener('change',()=>{this.setOpen(false);app.onResize();});
    for(const button of this.buttons){button.setAttribute('aria-controls','brush-settings');button.setAttribute('aria-expanded','false');}
  }
  setOpen(open,selected) {
    open=Boolean(open&&this.media.matches&&!this.app.explorer.active);
    if(open===document.body.classList.contains('brush-settings-open')&&!selected)return;
    document.body.classList.toggle('brush-settings-open',open);
    this.buttons.forEach(button=>button.setAttribute('aria-expanded',String(open&&button===selected)));
    this.app.onPointerUp();this.app.workspace.applyView();
  }
}
