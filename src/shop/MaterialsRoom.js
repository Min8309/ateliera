import * as THREE from 'three';
import { PRODUCTS } from './Catalog.js';

export class MaterialsRoom {
  constructor(environment) {
    this.environment = environment;
    this.group = new THREE.Group();
    this.group.name = 'ArtMaterialsRoom';
    environment.scene.add(this.group);
    this.colliders = [];
    this.doorOpen = false;
    const wood = environment.wood;
    const wall = environment.wallMaterial;
    this.box(5, .08, 10, -8.5, -1.59, .5, wood);
    this.box(.2, 5.5, 10, -11, 1.15, .5, wall);
    this.box(5, 5.5, .2, -8.5, 1.15, -3.3, wall);
    this.box(5, 5.5, .2, -8.5, 1.15, 5.5, wall);
    this.box(5, .15, 10, -8.5, 3.95, .5, wall);
    const warm = new THREE.PointLight('#ffdfb0', 35, 9, 2);
    warm.position.set(-8.5, 2.8, 0);this.group.add(warm);

    // An actual opening in the studio wall, with a door that swings toward the studio.
    for (const z of [.15, 2.45]) this.box(.26, 2.8, .12, -6, -.15, z, environment.darkWood);
    this.box(.26, .14, 2.42, -6, 1.3, 1.3, environment.darkWood);
    this.hinge = new THREE.Group();this.hinge.position.set(-6, -1.55, .22);this.group.add(this.hinge);
    this.hinge.userData = { isInteractable: true, type: 'door', name: '미술용품실 문', description: '문을 열고 미술용품실로 들어갑니다.' };
    const door = new THREE.Mesh(new THREE.BoxGeometry(.08, 2.7, 2.16), wood);
    door.position.set(0, 1.35, 1.08);this.hinge.add(door);
    const handle = new THREE.Mesh(new THREE.SphereGeometry(.065, 12, 8), environment.metal);
    handle.position.set(.09, 1.3, 1.9);this.hinge.add(handle);
    this.label('ART MATERIALS', -5.84, 1.65, 1.3, Math.PI / 2, 1.8).userData = this.hinge.userData;

    // Tall wood cabinet: upright canvases, small bottles and a pulled-out drawer.
    for (const x of [-10.55, -6.75]) this.box(.12, 3.65, .75, x, .27, -2.48, wood);
    this.box(3.9, 3.65, .06, -8.65, .27, -2.85, environment.darkWood);
    for (const y of [-1.3, -.5, .25, 1, 2.1]) this.box(3.9, .1, .75, -8.65, y, -2.48, wood);
    this.box(.08, 1.1, .75, -8.65, 1.55, -2.48, wood);
    this.box(1.85, .12, 1.12, -9.62, -1, -2.08, wood);
    this.box(1.85, .3, .08, -9.62, -1.12, -1.52, wood);
    this.colliders.push(new THREE.Box3(new THREE.Vector3(-10.65, -1.55, -2.95), new THREE.Vector3(-6.65, 2.2, -1.45)));
    const colors = ['#b64743', '#d6a33e', '#58765e', '#4d789a', '#bfb598', '#856686'];
    for (let index = 0; index < PRODUCTS.length; index++) {
      const product = PRODUCTS[index];const item = new THREE.Group();
      item.userData = { ...product, isInteractable: true, type: 'product' };this.group.add(item);
      const x = index % 2 === 0 ? -9.65 : -7.65;
      const y = product.kind === 'canvas' ? 1.55 : product.kind === 'paper' ? 1.45 : index < 2 ? .55 : -.17;
      for (let i = 0; i < 8; i++) {
        const color = new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: .7 });
        let mesh;
        if (product.kind === 'canvas') {
          mesh = new THREE.Mesh(new THREE.BoxGeometry(.09, .7 + i % 3 * .12, .52), new THREE.MeshStandardMaterial({color:'#f4efe1'}));
          mesh.position.set(x - .65 + i * .18, y, -2.45);mesh.rotation.z = (i % 3 - 1) * .05;
        } else if (product.kind === 'paper') {
          mesh = new THREE.Mesh(new THREE.BoxGeometry(1.3, .035, .5), new THREE.MeshStandardMaterial({color:'#ebe6d9'}));
          mesh.position.set(x, y - .28 + i * .055, -2.4);
        } else if (product.kind === 'brush' || product.kind === 'pencil' || product.kind === 'charcoal') {
          mesh = new THREE.Mesh(new THREE.CylinderGeometry(.028, .028, .48, 8), product.kind === 'charcoal' ? environment.metal : color);
          mesh.position.set(x - .65 + i * .18, y, -2.25);mesh.rotation.z = .12;
          if (product.kind === 'brush') {
            const tip = new THREE.Mesh(new THREE.ConeGeometry(.045, .15, 8), environment.darkWood);
            tip.position.y = .31;mesh.add(tip);
          }
        } else {
          mesh = new THREE.Mesh(new THREE.CylinderGeometry(.065, .055, .3, 12), color);
          mesh.position.set(x - .65 + i * .18, y, -2.22);
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .06, 8), environment.metal);cap.position.y = .18;mesh.add(cap);
        }
        mesh.castShadow = true;item.add(mesh);
      }
      // Shelf label is also a generous, accessible raycast target.
      const label = this.label(product.name, x, y - .37, -2.04, 0, 1.6);
      label.userData = item.userData;
    }
    // Pulled-out paint drawer and closed storage drawers below the shelves.
    const drawer = new THREE.Group();drawer.userData = {...PRODUCTS[1],isInteractable:true,type:'product'};this.group.add(drawer);
    for (let i = 0; i < 24; i++) {
      const tube = new THREE.Mesh(new THREE.BoxGeometry(.07,.045,.3), new THREE.MeshStandardMaterial({color:colors[i % colors.length]}));
      tube.position.set(-10.35 + (i % 12) * .13, -.91, -2.35 + Math.floor(i / 12) * .37);drawer.add(tube);
    }
    for (const y of [-1.1,-.87]) {
      this.box(1.8,.2,.08,-7.65,y,-2.04,wood);
      this.box(.23,.035,.055,-7.65,y,-1.975,environment.metal);
    }
    this.label('미술용품실', -8.65, 2.5, -2.8, 0, 3);
  }

  box(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);mesh.castShadow = mesh.receiveShadow = true;this.group.add(mesh);return mesh;
  }

  label(text, x, y, z, rotation, width) {
    const canvas = document.createElement('canvas');canvas.width = 512;canvas.height = 100;
    const ctx = canvas.getContext('2d');ctx.fillStyle = '#eadcc3';ctx.fillRect(0, 0, 512, 100);
    ctx.fillStyle = '#493b2a';ctx.font = '32px sans-serif';ctx.textAlign = 'center';ctx.textBaseline = 'middle';ctx.fillText(text, 256, 50);
    const texture = new THREE.CanvasTexture(canvas);texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 100 / 512), new THREE.MeshBasicMaterial({map:texture, side:THREE.DoubleSide}));
    mesh.position.set(x, y, z);mesh.rotation.y = rotation;this.group.add(mesh);return mesh;
  }

  openDoor() { this.doorOpen = true; }
  update(delta) { this.hinge.rotation.y = THREE.MathUtils.damp(this.hinge.rotation.y, this.doorOpen ? Math.PI / 2 : 0, 5, delta); }
}
