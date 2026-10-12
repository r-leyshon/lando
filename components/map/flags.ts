export type FlagPicture = { source: CanvasImageSource; width: number; height: number };

const images = new Map<string, HTMLImageElement>();
const pictures = new Map<string, FlagPicture>();

function pictureFor(key: string, image: HTMLImageElement): FlagPicture {
  const cached = pictures.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 180;
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  const picture = { source: canvas, width: canvas.width, height: canvas.height };
  pictures.set(key, picture);
  return picture;
}

export function readyFlag(iso: string, onLoad: () => void) {
  const key = iso.toLowerCase();
  let image = images.get(key);
  if (!image) {
    image = new Image();
    image.decoding = "async";
    image.src = `/flags/${key}.svg`;
    images.set(key, image);
  }
  if (image.complete) return image.naturalWidth > 0 ? pictureFor(key, image) : null;
  if (image.dataset.watch !== "1") {
    image.dataset.watch = "1";
    image.addEventListener("load", onLoad, { once: true });
  }
  return null;
}
