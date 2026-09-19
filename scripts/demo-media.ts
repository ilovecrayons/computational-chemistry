import { ensureDemoMedia } from "../lib/media/demo";

ensureDemoMedia()
  .then(() => {
    console.log(
      "Offline library ready: 60 original SVG meme illustrations, 6 playable six-second silent MP4 animations, and 10 fictional illustrated portraits. No provider calls were made.",
    );
  })
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Offline media creation failed.",
    );
    process.exitCode = 1;
  });
