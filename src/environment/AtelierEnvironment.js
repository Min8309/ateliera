import * as THREE from 'three';
import { createSeoulPanorama } from './SeoulPanorama.js';

/** 통창 너머 한강이 보이는 서울 작업실. 외부 이미지나 네트워크 요청 없이 구성합니다. */
export class AtelierEnvironment {
  constructor(scene) {
    this.scene = scene;
    this.timeOfDay = 'day';
    this.nightMix = 0;
    this.group = new THREE.Group();
    this.group.name = 'SeoulRiversideStudio';
    scene.add(this.group);
    this.wood = new THREE.MeshStandardMaterial({ color: '#886447', roughness: .8 });
    this.darkWood = new THREE.MeshStandardMaterial({ color: '#473b32', roughness: .8 });
    this.wallMaterial = new THREE.MeshStandardMaterial({ color: '#e5ded0', roughness: 1 });
    this.metal = new THREE.MeshStandardMaterial({ color: '#363a3a', roughness: .55, metalness: .35 });
    this.buildRoom();
    this.buildWindow();
    this.buildFurniture();
    this.setupLighting();
    this.applyTimeOfDay();
  }

  box(width, height, depth, x, y, z, material = this.wood) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  buildRoom() {
    // 창문 자리를 비운 벽: 이전처럼 단단한 뒷벽이 전망을 가리지 않습니다.
    this.box(12, .6, .2, 0, 3.7, -3.3, this.wallMaterial);
    this.box(12, .5, .2, 0, -1.35, -3.3, this.wallMaterial);
    this.box(1.4, 4.6, .2, -5.3, 1.2, -3.3, this.wallMaterial);
    this.box(1.4, 4.6, .2, 5.3, 1.2, -3.3, this.wallMaterial);
    this.box(.2, 5.5, 10, -6, 1.15, .5, this.wallMaterial);
    this.box(.2, 5.5, 10, 6, 1.15, .5, this.wallMaterial);
    this.box(12, .15, 10, 0, 3.95, .5, this.wallMaterial);
    const floorMaterials = ['#9a7656', '#a78361', '#957354', '#b18b68'].map(color =>
      new THREE.MeshStandardMaterial({ color, roughness: .85 }));
    for (let i = 0; i < 26; i++) {
      this.box(.455, .08, 10, -5.8 + i * .46, -1.59, .5, floorMaterials[i % 4]);
    }
    this.box(12, .08, .12, 0, -1.08, -3.14, this.wood);
  }

  buildWindow() {
    const dayTexture = new THREE.CanvasTexture(createSeoulPanorama('day'));
    const nightTexture = new THREE.CanvasTexture(createSeoulPanorama('night'));
    for (const texture of [dayTexture, nightTexture]) texture.colorSpace = THREE.SRGBColorSpace;
    this.viewMaterial = new THREE.ShaderMaterial({
      uniforms: {
        dayView: { value: dayTexture }, nightView: { value: nightTexture },
        nightMix: { value: 0 }, time: { value: 0 }
      },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `
        uniform sampler2D dayView; uniform sampler2D nightView;
        uniform float nightMix; uniform float time; varying vec2 vUv;
        void main() {
          vec2 uv = vUv;
          float water = 1.0 - smoothstep(0.24, 0.32, uv.y);
          uv.x += sin(uv.y * 180.0 + time * 0.6) * 0.0008 * water;
          gl_FragColor = mix(texture2D(dayView, uv), texture2D(nightView, uv), nightMix);
          #include <colorspace_fragment>
        }`,
      toneMapped: false
    });
    const view = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 4.6), this.viewMaterial);
    view.name = 'HanRiverSeoulView';
    view.position.set(0, 1.2, -3.42);
    this.group.add(view);
    // 얇은 프레임과 창살만 설치해 서울 전망을 열어 둡니다.
    this.box(9.4, .1, .16, 0, 3.5, -3.18, this.metal);
    this.box(9.4, .1, .16, 0, -1.1, -3.18, this.metal);
    for (const x of [-4.6, -2.3, 0, 2.3, 4.6]) this.box(.055, 4.6, .16, x, 1.2, -3.18, this.metal);
    this.box(9.4, .12, .5, 0, -1.13, -3.05, this.wood);
  }

  buildFurniture() {
    // 이젤과 낮은 캔버스 받침. 어떤 화면 비율도 가리지 않도록 캔버스 뒤에 둡니다.
    for (const x of [-.58, .58]) {
      const leg = this.box(.055, 1.6, .07, x, -.77, -.35, this.wood);
      leg.rotation.z = x < 0 ? -.16 : .16;
    }
    this.box(.055, 2.55, .06, 0, -.22, -.12, this.wood);
    this.box(1.45, .07, .22, 0, -1.09, -.08, this.wood);

    // 창가 작업 테이블, 물감 병, 도자기 컵과 스케치북.
    this.box(2.15, .12, 1.05, 2.85, -.67, -1.85, this.wood);
    for (const x of [1.94, 3.76]) for (const z of [-2.2, -1.5]) this.box(.06, .85, .06, x, -1.12, z, this.metal);
    const ceramic = new THREE.MeshStandardMaterial({ color: '#ddd4c3', roughness: .6 });
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(.11, .09, .22, 24), ceramic);
    cup.position.set(2.2, -.5, -1.7); this.group.add(cup);
    const brushMaterial = new THREE.MeshStandardMaterial({ color: '#48413b', roughness: .8 });
    for (let i = 0; i < 5; i++) {
      const brush = this.box(.012, .4, .012, 2.16 + i * .02, -.3, -1.7, brushMaterial);
      brush.rotation.z = (i - 2) * .12;
    }
    this.box(.58, .045, .4, 3.05, -.585, -1.63, ceramic);
    const pigments = ['#345c74', '#ad7051', '#bfa86d', '#6b8470'];
    pigments.forEach((color, i) => {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .13, 16), new THREE.MeshStandardMaterial({ color, roughness: .6 }));
      jar.position.set(3.2 + i * .16, -.545, -2.05);this.group.add(jar);
    });

    // 오른쪽 원목 책장과 색이 바랜 화집.
    for (const y of [-1.15, -.45, .25, .95]) this.box(1.05, .06, .42, 4.45, y, -2.5, this.wood);
    for (const x of [3.95, 4.95]) this.box(.06, 2.3, .42, x, -.08, -2.5, this.wood);
    const covers = ['#8a927c', '#b58a69', '#546a79', '#e0d0b4', '#92717b'];
    for (let i = 0; i < 17; i++) {
      const shelf = i < 8 ? -.45 : .25;
      this.box(.045 + (i % 3) * .015, .28 + (i % 4) * .035, .22, 4.05 + (i % 8) * .105, shelf + .21, -2.48,
        new THREE.MeshStandardMaterial({ color: covers[i % covers.length], roughness: .95 }));
    }

    // 창가의 화분. 평면 잎 대신 구체를 눌러 입체적인 잎을 표현합니다.
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(.23, .16, .38, 24),
      new THREE.MeshStandardMaterial({ color: '#bd8262', roughness: .9 }));
    pot.position.set(-2.35, -1.35, -2.1);this.group.add(pot);
    const stemMat = new THREE.MeshStandardMaterial({ color: '#52664c', roughness: .9 });
    const leafGeo = new THREE.SphereGeometry(.18, 12, 8);
    for (let i = 0; i < 11; i++) {
      const angle = i * 2.4;
      const radius = .12 + (i % 3) * .09;
      const leaf = new THREE.Mesh(leafGeo, stemMat);
      leaf.position.set(-2.35 + Math.cos(angle) * radius, -.96 + i * .05, -2.1 + Math.sin(angle) * radius);
      leaf.scale.set(1, .22, 1.8);leaf.rotation.set(.5, angle, .4);this.group.add(leaf);
    }
    this.box(.025, .75, .025, -2.35, -.92, -2.1, stemMat);

    // 패브릭 벤치와 쿠션.
    const fabric = new THREE.MeshStandardMaterial({ color: '#a49f8d', roughness: 1 });
    this.box(1.55, .3, .7, -3.8, -1.05, -.6, fabric);
    this.box(1.55, .55, .18, -3.8, -.82, -.97, fabric);
    for (const x of [-4.4, -3.2]) this.box(.06, .35, .06, x, -1.4, -.6, this.darkWood);
    const cushion = this.box(.5, .33, .14, -3.9, -.73, -.78,
      new THREE.MeshStandardMaterial({ color: '#ae7e62', roughness: 1 }));
    cushion.rotation.z = .12;

    // 천장 펜던트: 밤에 따뜻한 실내의 중심광이 됩니다.
    this.box(.012, .6, .012, 2.5, 3.6, -.6, this.metal);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(.32, .24, 32, 1, true), ceramic);
    shade.position.set(2.5, 3.18, -.6);this.group.add(shade);
    this.bulbMaterial = new THREE.MeshStandardMaterial({ color: '#ffedce', emissive: '#ffd69a', emissiveIntensity: .1 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.065, 12, 8), this.bulbMaterial);
    bulb.position.set(2.5, 3.05, -.6);this.group.add(bulb);
  }

  setupLighting() {
    this.ambient = new THREE.HemisphereLight('#ecf3ed', '#655040', 2);
    this.group.add(this.ambient);
    this.windowLight = new THREE.DirectionalLight('#ffefd0', 2.5);
    this.windowLight.position.set(-3, 5, -2);
    this.group.add(this.windowLight);
    this.frontLight = new THREE.DirectionalLight('#fff0d9', .8);
    this.frontLight.position.set(1, 2, 4);this.group.add(this.frontLight);
    this.pendantLight = new THREE.PointLight('#ffd29b', 0, 9, 2);
    this.pendantLight.position.set(2.5, 3, -.6);this.group.add(this.pendantLight);
    this.lamp = new THREE.SpotLight('#ffd9a5', 0, 12, .7, .8);
    this.lamp.position.set(0, 2.8, 2.7);this.lamp.target.position.set(0, -1, 0);
    this.lamp.castShadow = true;
    this.lamp.shadow.mapSize.set(512, 512);
    this.lamp.shadow.autoUpdate = false;
    this.lamp.shadow.needsUpdate = true;
    this.group.add(this.lamp, this.lamp.target);
    this.dayWallColor = new THREE.Color('#e5ded0');
    this.nightWallColor = new THREE.Color('#8e8b98');
    this.dayBackground = new THREE.Color('#c8d6d6');
    this.nightBackground = new THREE.Color('#182439');
    this.scene.fog = new THREE.FogExp2(this.dayBackground, .015);
  }

  setTimeOfDay(mode) {
    if (mode !== 'day' && mode !== 'night') return;
    this.timeOfDay = mode;
  }

  applyTimeOfDay() {
    const t = this.nightMix;
    this.viewMaterial.uniforms.nightMix.value = t;
    this.wallMaterial.color.lerpColors(this.dayWallColor, this.nightWallColor, t);
    this.ambient.intensity = THREE.MathUtils.lerp(2, .65, t);
    this.windowLight.intensity = THREE.MathUtils.lerp(2.5, .25, t);
    this.frontLight.intensity = THREE.MathUtils.lerp(.8, .4, t);
    this.pendantLight.intensity = t * 20;
    this.lamp.intensity = t * 7;
    this.bulbMaterial.emissiveIntensity = .1 + t * 3;
    if (!this.scene.background?.isColor) this.scene.background = new THREE.Color();
    this.scene.background.lerpColors(this.dayBackground, this.nightBackground, t);
    this.scene.fog.color.copy(this.scene.background);
  }

  update(delta = .016) {
    const dt = Math.min(delta, .5);
    this.nightMix = THREE.MathUtils.damp(this.nightMix, this.timeOfDay === 'night' ? 1 : 0, 4, dt);
    this.viewMaterial.uniforms.time.value += dt;
    this.applyTimeOfDay();
  }
}
