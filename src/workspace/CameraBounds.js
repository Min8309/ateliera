export const MIN_CAMERA_HEIGHT = -1.2; // Studio floor -1.55, with .35 clearance.
export function floorOrbitLimit(targetHeight,distance) {
  if(!Number.isFinite(distance)||distance<=0)return Math.PI/2;
  const ratio=Math.max(-1,Math.min(1,(MIN_CAMERA_HEIGHT-targetHeight)/distance));
  return Math.max(0,Math.acos(ratio)-.001);
}
export function keepCameraAboveFloor(camera,controls) {
  camera.position.y=Math.max(MIN_CAMERA_HEIGHT,camera.position.y);
  controls.maxPolarAngle=Math.min(Math.PI*.66,floorOrbitLimit(controls.target.y,camera.position.distanceTo(controls.target)));
}
