import { api } from "./client";

export interface SiteMap {
  has_image: boolean;
  image_version: number;
  /** Camera name → [x, y] as fractions of the plan's width and height. */
  positions: Record<string, [number, number]>;
}

export const mapApi = {
  get: () => api.get<SiteMap>("/api/live/map"),
  place: (name: string, x: number | null, y: number | null) =>
    api.put<{ positions: SiteMap["positions"] }>("/api/live/map/positions", { name, x, y }),
  uploadImage: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.postForm<{ image_version: number }>("/api/live/map/image", form);
  },
  imageUrl: (version: number) => `/api/live/map/image?v=${version}`,
};
