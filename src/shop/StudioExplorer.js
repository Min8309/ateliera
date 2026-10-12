import * as THREE from 'three';
import { MaterialsRoom } from './MaterialsRoom.js';
import { PRODUCTS, sanitizeCart, changeQuantity } from './Catalog.js';

export class StudioExplorer {
  constructor(app) {
    this.app = app;
    this.room = new MaterialsRoom(app.environment);
    this.active = false;
    this.keys = new Set();
    this.touchMove={x:0,y:0};
    this.raycaster = new THREE.Raycaster();this.raycaster.far = 7;
    this.yaw = 0;this.pitch = 0;
    this.drag = null;
    this.productDialog = document.getElementById('product-dialog');
    this.cartDialog = document.getElementById('cart-dialog');
    this.helpDialog = document.getElementById('controls-dialog');
    this.tooltip = document.getElementById('product-tooltip');
    this.hoverProduct = null;
    this.status = document.getElementById('shop-status');
    try { this.cart = sanitizeCart(JSON.parse(localStorage.getItem('ateliera_supplies_cart'))); } catch { this.cart = {}; }
    this.renderCart();
    document.getElementById('btn-explore').addEventListener('click', () => this.active ? this.leave() : this.enter());
    document.getElementById('btn-materials-room').addEventListener('click', () => this.visitShop());
    document.getElementById('btn-return-easel').addEventListener('click', () => this.leave());
    document.getElementById('btn-cart').addEventListener('click', () => this.openCart());
    document.getElementById('btn-space-help').addEventListener('click', () => { this.keys.clear();this.hideTooltip();this.helpDialog.showModal(); });
    document.getElementById('tooltip-add-product').addEventListener('click', () => { if (this.hoverProduct) this.addProduct(this.hoverProduct); });
    this.tooltip.addEventListener('pointerenter', () => clearTimeout(this.hoverTimer));
    this.tooltip.addEventListener('pointerleave', () => this.hideTooltip());
    app.canvasEl.addEventListener('pointerleave', event => {
      if (this.tooltip.contains(event.relatedTarget)) return;
      this.hoverTimer = setTimeout(() => this.hideTooltip(), 250);
    });
    document.querySelectorAll('[data-close-shop-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
    document.getElementById('btn-add-product').addEventListener('click', () => {
      if (!this.selectedProduct) return;
      document.getElementById('product-feedback').textContent = this.addProduct(this.selectedProduct) ? '장바구니에 담았습니다.' : '같은 용품은 최대 99개까지 담을 수 있습니다.';
    });
    document.getElementById('cart-items').addEventListener('click', event => {
      const button = event.target.closest('button[data-cart-id]');if (!button) return;
      if (button.dataset.delta === 'remove') delete this.cart[button.dataset.cartId];
      else this.cart = changeQuantity(this.cart, button.dataset.cartId, Number(button.dataset.delta));
      this.saveCart();
    });
    window.addEventListener('keydown', event => {
      if(event.code==='Escape'&&!this.app.workspace?.previewDialog?.open&&!this.productDialog.open&&!this.cartDialog.open&&!this.helpDialog.open&&document.getElementById('artwork-storage').classList.contains('mobile-open')){document.getElementById('artwork-storage').classList.remove('mobile-open');return;}
      if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName) || event.target.isContentEditable) return;
      if(event.ctrlKey||event.metaKey||event.altKey)return;
      if ((event.code === 'ShiftLeft' || event.code === 'ShiftRight') && !event.repeat && !this.app.isDrawingBlocked) {
        event.preventDefault();
        if (this.cartDialog.open) this.cartDialog.close(); else this.openCart();
        return;
      }
      if(!event.repeat&&event.code==='KeyG'&&!this.app.workspace?.previewDialog?.open&&!this.app.isDrawingBlocked&&!this.productDialog.open&&!this.cartDialog.open&&!this.helpDialog.open){event.preventDefault();document.getElementById('toggle-storage').click();return;}
      if (this.app.isDrawingBlocked || this.modalOpen()) return;
      if(!event.repeat&&event.code==='KeyH'){event.preventDefault();document.getElementById('btn-space-help').click();return;}
      if(!event.repeat&&event.code==='KeyM'){event.preventDefault();this.visitShop();return;}
      if(!this.active&&['KeyR','KeyZ','KeyX','Equal','NumpadAdd','Minus','NumpadSubtract'].includes(event.code)){
        event.preventDefault();document.getElementById(event.code==='KeyR'?'view-reset':['KeyZ','Equal','NumpadAdd'].includes(event.code)?'view-zoom-in':'view-zoom-out').click();return;
      }
      if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)) {
        event.preventDefault();
        if (!this.active) this.enter({preserveView:true});
        this.keys.add(event.code);
      }
      if (!this.active) return;
      if (event.code === 'KeyE' && this.target && !event.repeat) this.inspect(this.target);
      if (event.code === 'Escape') this.leave();
    });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
    window.addEventListener('blur', () => { this.keys.clear();this.drag = null; });
    document.addEventListener('visibilitychange', () => this.keys.clear());
    app.canvasEl.addEventListener('pointerdown', event => {
      if (!this.active || this.modalOpen() || event.button !== 0) return;
      this.hideTooltip();
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, distance: 0 };
      app.canvasEl.setPointerCapture(event.pointerId);
    });
    window.addEventListener('pointermove', event => {
      const drag = this.drag;
      if (!drag) {
        if (!this.active || this.modalOpen() || event.target !== app.canvasEl) return;
        if (performance.now() - (this.lastHoverTime || 0) < 70) return;
        this.lastHoverTime = performance.now();
        const rect = app.canvasEl.getBoundingClientRect();
        const ndc = new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1, -(event.clientY-rect.top)/rect.height*2+1);
        const target = this.findTarget(ndc);
        if (target?.type === 'product') this.showTooltip(target, event.clientX, event.clientY); else this.hideTooltip();
        return;
      }
      if (drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      drag.distance += Math.hypot(dx,dy);
      if (drag.distance > 4) drag.moved = true;
      this.yaw -= dx * .004;this.pitch = THREE.MathUtils.clamp(this.pitch - dy * .004, -.95, .95);
      drag.x = event.clientX;drag.y = event.clientY;this.applyLook();
    });
    window.addEventListener('pointerup', event => {
      const drag = this.drag;if (!drag || drag.id !== event.pointerId) return;
      this.drag = null;
      if (app.canvasEl.hasPointerCapture(event.pointerId)) app.canvasEl.releasePointerCapture(event.pointerId);
      if (!drag.moved && !this.modalOpen()) {
        const rect = app.canvasEl.getBoundingClientRect();
        const ndc = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
        const target = this.findTarget(ndc);if (target) this.inspect(target);
      }
    });
    window.addEventListener('pointercancel', () => { this.drag = null;this.keys.clear(); });
    document.querySelectorAll('[data-walk]').forEach(button => {
      button.addEventListener('pointerdown', event => { event.preventDefault();button.setPointerCapture(event.pointerId);this.keys.add(button.dataset.walk); });
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, () => this.keys.delete(button.dataset.walk));
    });
    document.getElementById('btn-inspect-object').addEventListener('click', () => { if (this.target) this.inspect(this.target); });
    this.colliders = [
      ...this.room.colliders,
      new THREE.Box3(new THREE.Vector3(1.35,-1.55,-1.7),new THREE.Vector3(3.65,1.2,-.7)),
      new THREE.Box3(new THREE.Vector3(-4.65,-1.55,-1.1),new THREE.Vector3(-2.95,0,-.2)),
      new THREE.Box3(new THREE.Vector3(2.9,-1.55,-2.5),new THREE.Vector3(4.85,0,-1.7)),
      new THREE.Box3(new THREE.Vector3(3.85,-1.55,-2.8),new THREE.Vector3(5.05,1.2,-2.1)),
      new THREE.Box3(new THREE.Vector3(-1.15,-1.55,-.18),new THREE.Vector3(1.15,1.15,.18))
    ];
  }

  modalOpen() { return this.productDialog.open || this.cartDialog.open || this.helpDialog.open || this.app.workspace?.previewDialog?.open || document.getElementById('artwork-storage').classList.contains('mobile-open'); }
  openCart() {
    this.keys.clear();this.drag = null;this.app.touchControls?.stop();this.hideTooltip();
    this.app.workspace?.previewDialog?.close();
    this.productDialog.close();this.helpDialog.close();
    if (!this.cartDialog.open) this.cartDialog.showModal();
  }
  addProduct(product) {
    if ((this.cart[product.id] || 0) >= 99) {
      this.status.textContent = '같은 용품은 최대 99개까지 담을 수 있습니다.';return false;
    }
    this.cart = changeQuantity(this.cart, product.id, 1);this.saveCart();
    this.status.textContent = `${product.name}을 장바구니에 담았습니다.`;return true;
  }
  hideTooltip() {
    clearTimeout(this.hoverTimer);this.tooltip.hidden = true;this.hoverProduct = null;
  }
  showTooltip(data, x, y) {
    const product = PRODUCTS.find(p => p.id === data.id);if (!product) return;
    clearTimeout(this.hoverTimer);this.hoverProduct = product;
    document.getElementById('tooltip-product-name').textContent = product.name;
    document.getElementById('tooltip-product-price').textContent = '가격 정보 준비 중';
    this.tooltip.hidden = false;
    this.tooltip.style.left = `${Math.max(8, Math.min(innerWidth-this.tooltip.offsetWidth-8, x+16))}px`;
    this.tooltip.style.top = `${Math.max(8, Math.min(innerHeight-this.tooltip.offsetHeight-8, y+16))}px`;
  }
  enter({preserveView=false} = {}) {
    if (this.app.isDrawingBlocked || this.active) return;
    this.app.touchControls?.cancelGesture();
    this.app.onPointerUp();this.active = true;this.app.controls.enabled = false;
    this.app.camera.clearViewOffset();
    this.app.touchControls?.updateMode();
    document.body.classList.add('exploring');this.app.environment.backWall.visible = true;
    document.getElementById('btn-explore').textContent = '그리기 모드';
    this.app.camera.fov = innerWidth < 680 ? 75 : 54;this.app.camera.updateProjectionMatrix();
    if (preserveView) {
      const look = new THREE.Euler().setFromQuaternion(this.app.camera.quaternion, 'YXZ');
      this.yaw = look.y;this.pitch = THREE.MathUtils.clamp(look.x,-.95,.95);
      const position = this.app.camera.position;
      position.set(THREE.MathUtils.clamp(position.x,-10.6,5.6),.1,THREE.MathUtils.clamp(position.z,-2.9,5.1));
    } else {
      this.app.camera.position.set(0,.1,3.8);this.yaw = .9;this.pitch = 0;
    }
    this.applyLook();
    this.status.textContent = '왼쪽 문을 선택하면 미술용품실이 열립니다.';
  }
  visitShop() {
    if (this.app.isDrawingBlocked) return;
    this.enter();this.keys.clear();this.room.openDoor();
    this.app.camera.position.set(-8.6,.1,innerWidth < 680 ? 3.8 : 1.1);this.yaw = 0;this.pitch = .06;this.applyLook();
    this.status.textContent = '진열된 물건이나 이름표를 선택해 장바구니에 담으세요.';
  }
  leave() {
    this.keys.clear();this.drag = null;this.app.touchControls?.stop();this.active = false;this.status.textContent = '';
    this.app.touchControls?.updateMode();
    this.hideTooltip();this.helpDialog.close();
    this.productDialog.close();this.cartDialog.close();document.body.classList.remove('exploring');this.app.environment.backWall.visible = false;
    document.getElementById('btn-explore').textContent = '화실 둘러보기';
    this.app.camera.fov = 54;this.app.camera.updateProjectionMatrix();
    this.app.controls.enabled = !this.app.isDrawingBlocked;this.app.fitStudioView();this.target = null;
  }
  applyLook() { this.app.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ'); }
  findTarget(ndc = new THREE.Vector2()) {
    this.app.scene.updateMatrixWorld(true);this.app.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(ndc, this.app.camera);
    const hits = this.raycaster.intersectObjects(this.app.scene.children, true);
    for (const hit of hits) {
      let object = hit.object;
      while (object && object !== this.app.scene) {
        if (object.userData.isInteractable) return object.userData;
        object = object.parent;
      }
      // Stop at foreground geometry so shelves and walls cannot be inspected through.
      if (hit.object.isMesh) return null;
    }
    return null;
  }
  inspect(data) {
    if(data.type==='stored-artwork'){this.app.workspace?.openPreview(data.artworkId);return;}
    if(data.type==='easel'){this.leave();return;}
    if(data.type==='storage'){this.app.touchControls?.stop();this.keys.clear();document.getElementById('artwork-storage').classList.add('mobile-open');return;}
    this.keys.clear();this.app.touchControls?.stop();this.hideTooltip();
    if (data.type === 'door') {
      this.room.openDoor();this.status.textContent = '문이 열렸습니다. 안으로 걸어 들어가세요.';
    } else if (data.type === 'product') {
      this.selectedProduct = PRODUCTS.find(product => product.id === data.id);if (!this.selectedProduct) return;
      document.getElementById('product-title').textContent = data.name;
      document.getElementById('product-description').textContent = data.description;
      document.getElementById('product-feedback').textContent = '';
      this.productDialog.showModal();
    }
    window.dispatchEvent(new CustomEvent('space-inspect', {detail: {...data}}));
  }
  canMove(x, z) {
    const r = .22;
    if (x < -10.7 || x > 5.7 || z < -3 || z > 5.2) return false;
    if (Math.abs(x + 6) < r + .1 && (z < .22 + r || z > 2.38 - r || !this.room.doorOpen)) return false;
    const body = new THREE.Box3(new THREE.Vector3(x-r,-1.45,z-r),new THREE.Vector3(x+r,.4,z+r));
    return !this.colliders.some(box => box.intersectsBox(body));
  }
  update(delta) {
    this.room.update(delta);
    if (!this.active) return;
    if(this.modalOpen()){this.app.touchControls?.stop();return;}
    if (this.keys.size) this.hideTooltip();
    this.move(delta);
    this.target = this.findTarget();
    const button = document.getElementById('btn-inspect-object');
    button.hidden = !this.target;button.textContent = this.target ? `${this.target.name} · ${this.target.type==='door' ? '문 열기' : '살펴보기'} [E]` : '';
  }
  // Small collision steps preserve walking speed across frame rates.
  move(delta) {
    const duration = Math.max(0, Math.min(delta,.25));
    const steps = Math.max(1,Math.ceil(duration/.05));
    const dt = duration/steps;
    const forward = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'))-(this.touchMove?.y||0);
    const sideways = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'))+(this.touchMove?.x||0);
    const length = Math.max(1,Math.hypot(forward,sideways));
    const dx = (-Math.sin(this.yaw)*forward + Math.cos(this.yaw)*sideways) / length * 2.2 * dt;
    const dz = (-Math.cos(this.yaw)*forward - Math.sin(this.yaw)*sideways) / length * 2.2 * dt;
    const pos = this.app.camera.position;
    for (let i=0;i<steps;i++) {
      if (this.canMove(pos.x+dx,pos.z)) pos.x += dx;
      if (this.canMove(pos.x,pos.z+dz)) pos.z += dz;
    }
  }
  saveCart() {
    try { localStorage.setItem('ateliera_supplies_cart',JSON.stringify(this.cart)); } catch { this.status.textContent = '저장 공간이 부족해 장바구니는 현재 화면에서만 유지됩니다.'; }
    this.renderCart();
  }
  renderCart() {
    const container = document.getElementById('cart-items');container.replaceChildren();
    let count = 0;
    for (const product of PRODUCTS) {
      const quantity = this.cart[product.id];if (!quantity) continue;count += quantity;
      const row = document.createElement('li');
      const name = document.createElement('span');name.textContent = `${product.name} · ${quantity}개`;row.append(name);
      for (const [delta,label] of [[-1,'−'],[1,'+'],['remove','삭제']]) {
        const button=document.createElement('button');button.type='button';button.dataset.cartId=product.id;button.dataset.delta=delta;button.textContent=label;
        button.setAttribute('aria-label',`${product.name} ${delta===-1?'수량 줄이기':delta===1?'수량 늘리기':'삭제'}`);row.append(button);
      }
      container.append(row);
    }
    document.getElementById('cart-count').textContent = count;
    document.getElementById('cart-summary').textContent = count ? `총 ${count}개 · 가격 정보 준비 중` : '아직 담은 물건이 없습니다. 용품실에서 물건을 골라보세요.';
  }
}
