export const FURNIMESH_DEFAULT_MCP_URL = "http://127.0.0.1:3180/mcp";
export const FURNIMESH_DEFAULT_SCENE_URL = "http://localhost:8123/";
export const SCENE_URL_KEY = "paperclip.furnimesh.sceneUrl";

export function readFurniMeshSceneUrl(): string {
  try {
    const value = window.localStorage.getItem(SCENE_URL_KEY)?.trim();
    return value || FURNIMESH_DEFAULT_SCENE_URL;
  } catch {
    return FURNIMESH_DEFAULT_SCENE_URL;
  }
}
