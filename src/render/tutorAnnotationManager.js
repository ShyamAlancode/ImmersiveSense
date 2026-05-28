import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

function createAnnotationElement(text, style = "tutor") {
  const element = document.createElement("div");
  element.className = `scene-label scene-label--tutor-annotation scene-label--tutor-${style}`;
  element.innerHTML = text; // Supports HTML/KaTeX markup
  return element;
}

export class TutorAnnotationManager {
  /**
   * @param {object} world - Three.js world/viewport instance
   * @param {object} sceneApi - API for querying objects in the scene
   */
  constructor(world, sceneApi) {
    this.world = world;
    this.sceneApi = sceneApi;
    this.group = new THREE.Group();
    this.group.name = "tutor-annotations-group";
    this.world.scene.add(this.group);
  }

  /**
   * Clear all active annotations.
   */
  clear() {
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      if (child.element && typeof child.element.remove === "function") {
        child.element.remove();
      }
      this.group.remove(child);
    }
  }

  /**
   * Render tutor annotations.
   * @param {Array<object>} annotations
   */
  render(annotations = []) {
    this.clear();
    if (!Array.isArray(annotations) || !annotations.length) return;

    for (const anno of annotations) {
      const position = new THREE.Vector3(0, 1.8, 0);

      // Attempt to resolve target coordinate position from target object
      if (anno.targetObjectId) {
        const cleanId = String(anno.targetObjectId).replace("-mesh", "");
        const objectSpec = this.sceneApi?.getObject?.(cleanId) || this.sceneApi?.getObject?.(anno.targetObjectId);
        const object3d = this.world.scene.getObjectByName(anno.targetObjectId) || this.world.scene.getObjectByName(cleanId);
        
        if (object3d) {
          object3d.getWorldPosition(position);
          position.y += 0.8; // Offset above the object mesh
        } else if (objectSpec) {
          if (objectSpec.shape === "line" && Array.isArray(objectSpec.params?.start) && Array.isArray(objectSpec.params?.end)) {
            // Midpoint of line
            const start = objectSpec.params.start;
            const end = objectSpec.params.end;
            position.set(
              (start[0] + end[0]) * 0.5,
              (start[1] + end[1]) * 0.5 + 0.5,
              (start[2] + end[2]) * 0.5
            );
          } else if (Array.isArray(objectSpec.position)) {
            position.set(...objectSpec.position);
            position.y += 0.8;
          }
        }
      } else if (Array.isArray(anno.position)) {
        position.set(...anno.position);
      }

      const element = createAnnotationElement(anno.text || "", anno.style || "tutor");
      const cssObject = new CSS2DObject(element);
      cssObject.position.copy(position);
      this.group.add(cssObject);
    }
  }
}
