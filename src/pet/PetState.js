const clamp=value=>Math.max(0,Math.min(100,value));
export class PetState {
  constructor(saved={},now=Date.now()) {
    for(const [key,fallback] of Object.entries({fullness:65,happiness:80,energy:80}))this[key]=Number.isFinite(saved[key])?clamp(saved[key]):fallback;
    this.sleeping=saved.sleeping===true;this.lastUpdated=Number.isFinite(saved.lastUpdated)?Math.min(saved.lastUpdated,now):now;
    this.advance(now);
  }
  advance(now=Date.now()) {
    const seconds=Math.min(8*3600,Math.max(0,(now-this.lastUpdated)/1000));
    this.fullness=clamp(this.fullness-seconds*.0022);
    this.energy=clamp(this.energy+seconds*(this.sleeping?.012:-.0015));
    this.happiness=clamp(this.happiness-seconds*(this.fullness<25?.003:.0007));
    this.lastUpdated=Math.max(this.lastUpdated,now);
  }
  get emotion(){return this.sleeping?'졸졸 꿈꾸는 중':this.fullness<25?'배가 고파요':this.energy<20?'졸려요':this.happiness<35?'같이 놀아 주세요':this.happiness>75?'행복해요!':'편안해요';}
  act(action,now=Date.now()) {
    this.advance(now);
    if(action==='feed'){if(this.fullness>=95)return '배불러요! 조금 있다 먹을래요.';this.sleeping=false;this.fullness=clamp(this.fullness+28);this.happiness=clamp(this.happiness+5);return '냠냠! 맛있어요.';}
    if(action==='pet'){this.happiness=clamp(this.happiness+15);return '쓰다듬어 줘서 좋아요!';}
    if(action==='play'){if(this.sleeping||this.energy<15)return '먼저 쉬고 싶어요. 잠을 재워 주세요.';this.energy=clamp(this.energy-12);this.fullness=clamp(this.fullness-5);this.happiness=clamp(this.happiness+22);return '신나요! 같이 놀아요.';}
    if(action==='sleep'){this.sleeping=!this.sleeping;if(this.sleeping)this.energy=clamp(this.energy+8);return this.sleeping?'포근하게 잠들었어요.':'잘 잤어요!';}
    return this.emotion;
  }
  serialize(){return {fullness:this.fullness,happiness:this.happiness,energy:this.energy,sleeping:this.sleeping,lastUpdated:this.lastUpdated};}
}
