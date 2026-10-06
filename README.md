# 🖌️ Ateliera (아틀리에라)
> **"Trace to Space (붓질의 궤적이 머무는 가상 갤러리)"**  
> 비 오는 창가 작업실에서 수채화 느낌으로 창작한 뒤, 3D 액자를 결합해 완성하고 타임랩스로 궤적을 되짚어보는 WebXR 기반 인터랙티브 디지털 페인팅 플랫폼입니다.

---

## ✨ 핵심 아키텍처 및 주요 기능

### 1. 듀얼 캔버스 렌더 파이프라인 (Dual-Layer Canvas Architecture)
- **Background Canvas (2048×2048)**: 완성된 이전 스트로크들이 영구 보존되는 레이어로, 종이 결(Grain) 텍스처를 포함합니다.
- **Active Canvas (2048×2048)**: 실시간 1개의 획만 그리는 임시 레이어입니다.
- **저지연 연산 (`desynchronized: true`)**: 브라우저 컴포지터 큐를 우회하여 캔버스 입력 지연 시간을 1ms 미만 수준으로 극대화했습니다.
- **CanvasTexture 바인딩**: Three.js의 Plane Quad Mesh(`PlaneGeometry(2, 2)`)에 텍스처를 실시간 동기화하여 60~90fps 성능을 유지합니다.

### 2. 고정밀 저지연 입력 수집 & 실시간 HUD
- **`e.getCoalescedEvents()` 대응**: 초고속 붓질 시 브라우저 이벤트 큐에 뭉쳐진 미세 서브픽셀 좌표를 100% 추출하여 좌표 누락을 방지합니다.
- **하이브리드 필압 정규화**: 스타일러스 펜(Apple Pencil, Wacom)의 물리 필압(`e.pressure`)과 마우스 이동 속도 기반 가상 필압을 지원합니다.
- **실시간 디버그 HUD**: FPS, 1프레임 렌더 타임(ms), Input-to-Screen 레이턴시(ms), 누적 스트로크/포인트 수를 실시간으로 표출합니다.

### 3. 중간점 기반 2차 베지어 곡선 보간 (Midpoint Quadratic Bézier)
- 연속된 원시 포인트를 제어점으로 하는 2차 베지어 곡선 $B(t) = (1-t)^2 M_0 + 2(1-t)t P_1 + t^2 M_1$을 실시간 생성합니다.
- 브러시별 고유 Spacing 비율로 균일하게 스탬핑하여, 고속 휘두름 시에도 각짐·점선 끊김이 전혀 없습니다.

### 4. 브러시 전략 패턴 기반 핵심 브러시 4종 + 지우개
- **🖊️ 기본 펜 (Pen)**: 경계가 또렷하고 매끄러운 잉크 펜. 필압에 따른 선형 굵기 비례(`size = baseSize * pressure`), 불투명도 100%.
- **✏️ 연필 / 목탄 (Pencil)**: 스케치북 요철 노이즈 마스크 기반의 거친 흑연 질감. 스타일러스 펜의 기울기(`tiltX`, `tiltY`) 감지 시 팁을 타원형으로 눕혀 목탄을 눕혀 칠하는 효과 적용.
- **🖌️ 수채화 (Watercolor)**: 중심부는 맑고 외곽 링에 안료가 맺히는 **Water Edge 림 텍스처**와 반투명 알파 겹침(Glazing), 지수 감쇄 미세 안료 번짐.
- **💨 에어브러시 (Airbrush)**: 2D 가우시안 래디얼 팁과 0.06 초밀도 스탬핑으로 밴딩(얼룩) 없는 극도의 매끄러운 그라데이션 스프레이.
- **🧹 지우개 (Eraser)**: `globalCompositeOperation = 'destination-out'`으로 기존 획을 자연스럽게 깎아내며, 지우개 궤적도 데이터로 보존.

### 5. 14종 전문 안료 팔레트 & 드래그 가능한 조색 패드 (Color Mixing Pad)
- 한국화 및 서양 수채화 대표 14종 안료 프리셋 + 커스텀 컬러 피커.
- **실제 물감 조색(Mixing)**: 도자기 백자 팔레트 위에서 물감을 문질러 섞으면 자연스럽게 혼색(Blending)이 형성됩니다.
- **스포이드 픽셀 채취**: 조색 패드 위 원하는 지점을 클릭하면 해당 혼합색의 RGB를 즉시 브러시 색상으로 채택합니다.
- **플로팅 윈도우**: 조색 패드 상단 바를 마우스로 잡고 화면 내 원하는 위치 어디로든 자유롭게 끌어서 이동시킬 수 있습니다.

### 6. 비 오는 창가 작업실 3D 공간 & 작품 완성 시퀀스
- **3D 아틀리에 룸**: 다크 우드 플로어, 콘크리트 벽, 통창 유리창 메쉬 및 1,600개 빗방울 파티클 낙하 연출.
- **무드 조명**: 창밖 서늘한 쿨톤 광원(~6500K) + 캔버스를 집중 조명하는 따뜻한 스포트라이트(~3000K).
- **완성하기 시퀀스 (Finish Artwork)**:
  1. 카메라 정면 줌인 및 조작 잠금.
  2. 작품 제목 및 작가 서명 입력.
  3. 캔버스 우측 하단 서명 각인 및 3D 몰딩 액자(우드/골드/블랙) 스냅 장착.
  4. 고해상도 DataURL 이미지 및 `strokesData` JSON 패키징, `localStorage` 영구 보관.

### 7. 타임랩스 리플레이 & JSON 데이터 추출
- 누적된 스트로크 데이터를 기반으로 첫 획부터 현재까지 실제로 붓질하듯 `requestAnimationFrame`으로 캔버스에 재현합니다.
- 데이터 추출 버튼 클릭 시 규격화된 Artwork JSON(`{ id, width, height, strokes, createdAt }`) 파일 자동 다운로드.

---

## 🛠️ 기술 스택

- **Core**: JavaScript (ES6+ Modules), Three.js (ESM), WebXR Device API 대응 구조
- **Controls**: Three.js OrbitControls (우클릭 회전 / 휠 줌 / 좌클릭 드로잉 격리)
- **Canvas Pipeline**: HTML5 Dual Canvas (Offscreen), CanvasTexture
- **Styling**: Vanilla CSS3, 글래스모피즘 (Glassmorphism), Noto Sans KR / Outfit
- **Build & Dev Tool**: Vite 6

---

## 📁 프로젝트 구조

```text
Ateliera/
├── index.html                   # 뷰포트 마크업, HUD, 팔레트, 조색 패드, 모달 UI
├── package.json
├── vite.config.js               # 개발 서버 설정 (포트 3000)
├── src/
│   ├── main.js                  # 메인 앱 진입점, 저지연 파이프라인, Three.js 씬, HUD
│   ├── types/
│   │   └── DataModels.js        # Point, Stroke, Artwork 규격화 모델 팩토리
│   ├── drawing/
│   │   └── brushes/
│   │       ├── BaseBrush.js     # 브러시 전략 기본 추상 클래스
│   │       ├── PenBrush.js      # ① 기본 펜 브러시
│   │       ├── PencilBrush.js   # ② 연필/목탄 브러시 (틸트 지원)
│   │       ├── WatercolorBrush.js # ③ 수채 브러시 (Water Edge)
│   │       ├── Airbrush.js      # ④ 에어브러시 (가우시안 스프레이)
│   │       └── BrushManager.js  # 브러시 전략 패턴 총괄 관리자
│   ├── environment/
│   │   └── AtelierEnvironment.js # 비 오는 룸 메쉬, 빗방울 파티클, 무드 조명
│   ├── frame/
│   │   └── FrameBuilder.js      # 3D 몰딩 액자 3종 생성 및 스냅 장착
│   ├── completion/
│   │   └── CompletionManager.js # 카메라 정면 줌인, 서명 각인, 데이터 패키징
│   └── styles/
│       └── main.css             # 글래스모피즘 테마 및 반응형 레이아웃 스타일
```

---

## 🚀 빠른 시작 (Getting Started)

### 의존성 설치
```bash
npm install
```

### 로컬 개발 서버 실행
```bash
npm run dev
```
브라우저에서 [http://localhost:3000/](http://localhost:3000/)으로 접속합니다.

### 프로덕션 빌드
```bash
npm run build
```

---

## 🎮 마우스 & 터치 조작 가이드

| 조작 | 동작 |
| :--- | :--- |
| **마우스 좌클릭 드래그** | 캔버스 고정밀 드로잉 (필압/속도/틸트 반응) |
| **마우스 우클릭 드래그** | 3D 작업실 둘러보기 (OrbitControls 뷰 회전) |
| **마우스 휠 스크롤** | 캔버스 줌 인 / 줌 아웃 |
| **조색 패드 상단 바 드래그** | 조색 윈도우 원하는 위치로 자유 이동 |
| **조색 패드 캔버스 클릭** | 문지른 혼합색을 브러시 색상으로 즉시 채취 (스포이드) |

---

## 📜 라이선스
MIT License © 2026 Ateliera Project
