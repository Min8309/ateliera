from pathlib import Path
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from PIL import Image
import html, json, base64
root=Path(__file__).resolve().parents[1]/'public'/'presentation'
slides=[
 dict(title='Ateliera',subtitle='한강변의 화실, 그리고 나만의 재료',lead='그림을 그리고 · 공간을 걷고 · 재료를 고르는 3D 아틀리에',image='studio-day.png',points=['브라우저에서 만나는 서울의 작업실','창작과 공간 탐색을 하나의 흐름으로'],layout='hero'),
 dict(title='컨셉: 창작이 머무는 공간',subtitle='CREATE · EXPLORE · COLLECT',lead='서울의 한강 풍경을 배경으로, 그림 작업과 재료 선택을 연결합니다.',points=['창작 | 재료마다 다른 붓결과 실제 3D 입체 붓질','탐색 | 낮과 밤이 바뀌는 화실을 직접 걸어 둘러보기','선택 | 진열된 용품을 살펴보고 나의 장바구니에 담기'],layout='cards'),
 dict(title='그림의 질감부터 입체 붓질까지',subtitle='DIGITAL PAINTING',lead='수채·물감·연필·목탄·스프레이의 재료 차이를 표현합니다.',image='brush-materials.png',points=['수채: 맑은 번짐과 안료가 모이는 가장자리','물감: 불투명한 색과 두께감 있는 2D 붓결','연필·목탄: 미세한 흑연 결과 거친 가루 입자','에어브러시: 가장자리까지 옅어지는 미세 분사','3D 입체: 튜브 형태의 실제 메쉬와 네온 발광','펜 · 필압/기울기 반응 · 사용자 색상 · 네온 6종'],layout='feature'),
 dict(title='서울 한강변, 낮과 밤의 화실',subtitle='RIVERSIDE STUDIO',lead='통창 너머 풍경과 따뜻한 원목 공간이 작업의 분위기를 만듭니다.',images=['studio-day.png','studio-night.png'],points=['낮 / 밤 전환: 풍경, 조명, 강물 반사 변화','캔버스 선택: 정사각형 · 가로형 · 세로형 · 작은 정사각형','그림 비율을 유지하는 크기 변경 · 실행 취소/다시 실행 · 타임랩스'],layout='pair'),
 dict(title='왼쪽 문 너머의 미술용품실',subtitle='ART MATERIALS ROOM',lead='원목 진열장에 재료를 세워 두고, 손이 닿는 공간을 구성했습니다.',image='materials-room.png',points=['실제 출입구와 열리는 문으로 화실과 연결','WASD 이동 · 화면 드래그로 시선 회전','벽·가구 충돌 검사와 터치 이동 버튼','캔버스 · 수채화 종이 · 붓 · 물감 · 연필 · 목탄','물건과 이름표를 선택해 상품 상세 확인'],layout='feature'),
 dict(title='살펴보고, 나의 장바구니에 담기',subtitle='PERSONAL MATERIALS LIST',lead='물건 위에 마우스를 올리면 안내와 담기 말풍선이 표시됩니다.',image='cart.png',points=['상품 상세: 이름과 재료 설명 확인','Shift: 장바구니 열기 / 닫기','용품 담기 · 수량 변경 · 개별 삭제','새로고침 후에도 브라우저에 선택 목록 유지','가격·외부 구매 연결은 보류 중','실제 주문·결제가 아닌 재료 선택 체험'],layout='feature'),
 dict(title='조작 방법',subtitle='CONTROLS',lead='키보드와 마우스, 모바일 화면 버튼으로 이동합니다.',rows=[['WASD / 방향키','앞·뒤·좌·우 이동'],['화면 드래그','마우스 또는 터치로 시선 회전'],['물건 클릭 / E','상품 상세 보기 · 문 열기'],['Shift','장바구니 열기 / 닫기'],['Esc','창 닫기 / 이동 모드에서 그리기로 복귀'],['화면 화살표','누르고 있는 동안 이동'],['미술용품실 버튼','진열장 앞으로 바로 이동']],layout='table'),
 dict(title='작업과 탐색이 이어지는 경험',subtitle='USER JOURNEY',lead='그리기로 언제든 돌아올 수 있고, 선택한 재료는 남아 있습니다.',points=['01 | 캔버스 크기와 낮·밤 분위기 선택','02 | 재료별 브러시와 입체 붓질로 작업','03 | 둘러보기 모드로 전환하고 왼쪽 문 열기','04 | 미술용품실에서 물건을 살펴보고 담기','05 | 이젤로 복귀해 작업을 이어가고 작품 완성'],layout='steps'),
 dict(title='현재 구현 범위와 다음 연결',subtitle='PROJECT STATUS',lead='화실 창작과 재료 선택의 기본 경험을 구현했습니다.',points=['구현 완료 | 브러시·입체·네온, 낮/밤, 캔버스 크기','구현 완료 | 이동·문·진열장·상품 상세·장바구니','검증 완료 | 브라우저 플레이, 모바일 확인, 테스트 28개·빌드','보류 | 실제 상품 가격과 외부 판매처 링크','추후 범위 | 상품별 상세 데이터와 주문·결제 연결'],layout='cards')
]
(root/'content.json').write_text(json.dumps(slides,ensure_ascii=False,indent=2))
prs=Presentation();prs.slide_width=Inches(13.333);prs.slide_height=Inches(7.5)
BG='172923';CREAM='F5EEDD';GOLD='D9B577';MUTED='B9C8BC';PANEL='233D32'
def rect(slide,x,y,w,h,color):
 shape=slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x),Inches(y),Inches(w),Inches(h));shape.fill.solid();shape.fill.fore_color.rgb=RGBColor.from_string(color);shape.line.fill.background();return shape
def txt(slide,text,x,y,w,h,size=22,color=CREAM,bold=False):
 box=slide.shapes.add_textbox(Inches(x),Inches(y),Inches(w),Inches(h));tf=box.text_frame;tf.word_wrap=True;tf.margin_left=0;tf.margin_right=0;tf.margin_top=0;tf.margin_bottom=0
 for i,line in enumerate(text.split('\n')):
  p=tf.paragraphs[0] if i==0 else tf.add_paragraph();p.text=line;p.font.name='Noto Sans CJK KR';p.font.size=Pt(size);p.font.bold=bold;p.font.color.rgb=RGBColor.from_string(color);p.space_after=Pt(8)
 return box
def picture(slide,filename,x,y,w,h):
 path=root/'assets'/filename
 with Image.open(path) as im: iw,ih=im.size
 scale=min(w/iw,h/ih);dw,dh=iw*scale,ih*scale
 slide.shapes.add_picture(str(path),Inches(x+(w-dw)/2),Inches(y+(h-dh)/2),width=Inches(dw),height=Inches(dh))
for n,data in enumerate(slides):
 slide=prs.slides.add_slide(prs.slide_layouts[6]);slide.background.fill.solid();slide.background.fill.fore_color.rgb=RGBColor.from_string(BG)
 txt(slide,data['subtitle'],.6,.35,12,.3,12,GOLD,True)
 txt(slide,data['title'],.6,.95,12,1,36,CREAM,True)
 txt(slide,data['lead'],.6,1.92,12,.65,19,MUTED)
 layout=data['layout'];points=data.get('points',[])
 if layout=='hero':
  picture(slide,data['image'],5.4,2.65,7.35,4.3);txt(slide,'창작\n탐색\n재료 선택',.75,2.8,4.35,2.45,34,GOLD,True);txt(slide,'\n'.join(points),.75,5.55,4.3,1.15,18)
 elif layout=='pair':
  for i,img in enumerate(data['images']):picture(slide,img,.6+i*6.2,2.65,6,3.65)
  txt(slide,' · '.join(points),.6,6.37,12.1,.7,15)
 elif layout=='feature':
  picture(slide,data['image'],.6,2.65,6.4,4.2)
  for i,point in enumerate(points):txt(slide,'— '+point,7.35,2.75+i*.68,5.35,.62,17)
 elif layout=='table':
  for i,row in enumerate(data['rows']):
   y=2.68+i*.55;rect(slide,.6,y,12.1,.5,PANEL if i%2==0 else BG);txt(slide,row[0],.85,y+.07,3.4,.36,17,GOLD,True);txt(slide,row[1],4.45,y+.07,8,.36,17)
 elif layout=='steps':
  for i,point in enumerate(points):
   y=2.78+i*.78;rect(slide,.6,y,12.1,.66,PANEL);txt(slide,point,.85,y+.13,11.6,.42,22)
 else:
  height=.96 if len(points)==3 else .65;gap=1.32 if len(points)==3 else .8
  for i,point in enumerate(points):
   y=2.8+i*gap;rect(slide,.6,y,12.1,height,PANEL);txt(slide,point,.9,y+.16,11.55,height-.14,22 if len(points)==3 else 19)
 txt(slide,'ATELIERA  /  서울 한강변 아틀리에',.6,7.15,11,.2,9,MUTED)
 txt(slide,f'{n+1:02d} / {len(slides):02d}',12,7.13,.8,.22,10,GOLD)
prs.save(root/'Ateliera-overview.pptx')
# The web edition uses the same content as the PowerPoint.
escape=html.escape
sections=[]
for n,data in enumerate(slides):
 media=''
 if 'image' in data:media=f'<figure><img src="assets/{data["image"]}" alt="{escape(data["title"])} 실제 앱 화면" loading="lazy"></figure>'
 if 'images' in data:media='<div class="image-pair">'+''.join(f'<figure><img src="assets/{img}" alt="화실 {label} 화면" loading="lazy"><figcaption>{label}</figcaption></figure>' for img,label in zip(data['images'],['낮','밤']))+'</div>'
 points='<ul class="point-list">'+''.join(f'<li>{escape(p)}</li>' for p in data.get('points',[]))+'</ul>' if data.get('points') else ''
 table=''
 if 'rows' in data:table='<div class="table-scroll"><table><thead><tr><th>조작</th><th>기능</th></tr></thead><tbody>'+''.join(f'<tr><th>{escape(r[0])}</th><td>{escape(r[1])}</td></tr>' for r in data['rows'])+'</tbody></table></div>'
 sections.append(f'<section id="slide-{n+1}" class="slide {data["layout"]}" aria-labelledby="title-{n+1}"><header><span class="eyebrow">{n+1:02d} / {escape(data["subtitle"])}</span><h2 id="title-{n+1}">{escape(data["title"])}</h2><p class="lead">{escape(data["lead"])}</p></header><div class="body">{media}{points}{table}</div></section>')
css='''*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:84px}body{margin:0;background:#172923;color:#f5eedd;font-family:"Noto Sans CJK KR","Malgun Gothic",sans-serif;line-height:1.65}a{color:#e1c38d}nav{position:sticky;top:0;z-index:5;background:#172923ee;backdrop-filter:blur(12px);padding:14px 5vw;border-bottom:1px solid #ffffff20;display:flex;flex-wrap:wrap;gap:18px;align-items:center}nav strong{margin-right:auto;letter-spacing:2px}nav a,nav button{font:inherit;font-size:13px}nav button{background:none;color:#e1c38d;border:1px solid #677665;border-radius:6px;padding:4px 10px;cursor:pointer}main{max-width:1400px;margin:auto}.slide{padding:65px 5vw 55px;min-height:85vh;border-bottom:1px solid #ffffff1a}.eyebrow{color:#d9b577;letter-spacing:2px;font-size:12px}h2{font-size:clamp(28px,4vw,52px);line-height:1.25;margin:18px 0}p.lead{font-size:clamp(17px,1.7vw,22px);color:#b9c8bc;max-width:1000px;margin-bottom:30px}figure{margin:0;border-radius:14px;overflow:hidden;background:#233d32}figure img{display:block;width:100%;height:auto}.feature .body,.hero .body{display:grid;grid-template-columns:1.25fr 1fr;gap:30px;align-items:center}.feature img{max-height:520px;object-fit:contain}.point-list{list-style:none;padding:0;display:grid;gap:12px;margin:0}.point-list li{padding:16px 20px;border-left:3px solid #d9b577;background:#233d32;border-radius:0 9px 9px 0;font-size:18px}.hero .point-list li{font-size:22px}.image-pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}figcaption{padding:8px 16px;color:#d9b577}.pair .point-list{margin-top:20px}.cards .point-list{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}.cards .point-list li{padding:26px;font-size:22px}.steps .point-list li{font-size:22px}table{width:100%;border-collapse:collapse;font-size:19px}th,td{padding:16px 22px;border:1px solid #526252;text-align:left}thead,tbody tr:nth-child(odd){background:#233d32}th{color:#e1c38d}footer{padding:30px 5vw;color:#b9c8bc;font-size:13px;display:flex;gap:20px;flex-wrap:wrap}a:focus-visible,button:focus-visible{outline:2px solid #e1c38d;outline-offset:4px}@media(max-width:760px){nav{gap:12px;padding:12px 16px}.slide{padding:45px 20px;min-height:0}.feature .body,.hero .body,.image-pair{grid-template-columns:1fr}.point-list li{font-size:16px}.cards .point-list{grid-template-columns:1fr}.cards .point-list li{font-size:19px}table{font-size:15px}td,th{padding:12px}.table-scroll{overflow:auto}}@media print{body{background:white;color:#172923}nav,footer{display:none}.slide{break-before:page;min-height:0;padding:18mm 8mm;break-inside:avoid}p.lead{color:#526252}.point-list li,thead,tbody tr:nth-child(odd){background:#edf0e9}.eyebrow,th,figcaption{color:#796039}figure{background:#edf0e9}.feature img{max-height:125mm}html{scroll-behavior:auto}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}'''
page='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ateliera — 컨셉과 핵심 기능</title><meta name="description" content="서울 한강변 3D 아틀리에: 디지털 드로잉, 화실 탐색, 미술용품 선택과 장바구니."><style>'+css+'</style></head><body><nav aria-label="소개 자료 탐색"><strong>ATELIERA</strong><a href="#slide-2">컨셉</a><a href="#slide-3">그리기</a><a href="#slide-5">미술용품실</a><a href="#slide-7">조작</a><a href="Ateliera-overview.pptx" download="Ateliera-overview.pptx">PPT 다운로드</a><button id="print" type="button">인쇄 / PDF</button></nav><main>'+''.join(sections)+'</main><footer><span>현재 구현된 기능 기준 · 가격/외부 구매 연결 보류 · 실제 주문/결제 미제공</span><a href="/">화실 열기</a><a href="https://github.com/Min8309/ateliera">GitHub 프로젝트</a><a href="https://github.com/Min8309/ateliera/raw/refs/heads/main/public/presentation/Ateliera-overview.pptx" target="_blank" rel="noopener noreferrer">PPT 직접 다운로드 (미리보기에서 안 될 때)</a></footer><script>document.getElementById("print").addEventListener("click",()=>window.print());</script></body></html>'
(root/'index.html').write_text(page)
standalone = page
ppt_data = base64.b64encode((root/'Ateliera-overview.pptx').read_bytes()).decode()
standalone = standalone.replace('href="Ateliera-overview.pptx"', 'href="data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,'+ppt_data+'"')
for asset in (root/'assets').glob('*.png'):
 standalone = standalone.replace(f'src="assets/{asset.name}"', 'src="data:image/png;base64,'+base64.b64encode(asset.read_bytes()).decode()+'"')
standalone = standalone.replace('<a href="/">화실 열기</a>', '')
(root/'Ateliera-overview.html').write_text(standalone)

# Check slide bounds and packaged images/text, without claiming a PowerPoint render.
check=Presentation(root/'Ateliera-overview.pptx')
assert len(check.slides)==len(slides)
for slide in check.slides:
 for shape in slide.shapes:
  assert shape.left >= 0 and shape.top >= 0
  assert shape.left+shape.width <= check.slide_width+1000 and shape.top+shape.height <= check.slide_height+1000
assert all((root/'assets'/image).exists() for d in slides for image in d.get('images',[d['image']] if 'image' in d else []))
print('Generated and structurally checked 9-slide PPTX and matching HTML')
