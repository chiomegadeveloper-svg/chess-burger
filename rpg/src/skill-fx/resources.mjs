// Host resource bridge for the unmodified ct.js animation component.
export const textures = new Map();
export default {getTexture(name) {
 const frames=textures.get(name);
 if(!frames)throw Error('Skill texture not loaded: '+name);
 return frames;
}};
