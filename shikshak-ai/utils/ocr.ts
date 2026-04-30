import Tesseract from "tesseract.js";

export async function readImageText(file: File) {

  const { data } = await Tesseract.recognize(
    file,
    "eng",
    {
      logger: m => console.log(m)
    }
  );

  return data.text;
}
