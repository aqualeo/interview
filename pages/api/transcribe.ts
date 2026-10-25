import { Configuration, OpenAIApi } from "openai";
import { IncomingForm } from "formidable";
const fs = require("fs");

export const config = {
  api: {
    bodyParser: false,
  },
};

// Groq hosts Whisper behind an OpenAI-compatible API. TRANSCRIBE_BASE_URL can
// point at any other OpenAI-compatible provider (e.g. https://api.openai.com/v1).
const DEFAULT_TRANSCRIBE_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_TRANSCRIBE_MODEL = "whisper-large-v3-turbo";

export default async function handler(req: any, res: any) {
  if (!process.env.GROQ_API_KEY) {
    console.error("Missing env var GROQ_API_KEY");
    res.status(500).json({ error: "Error" });
    return;
  }

  const configuration = new Configuration({
    apiKey: process.env.GROQ_API_KEY,
    basePath: process.env.TRANSCRIBE_BASE_URL || DEFAULT_TRANSCRIBE_BASE_URL,
  });
  const openai = new OpenAIApi(configuration);

  // Here, we create a temporary file to store the audio file using Vercel's tmp directory
  // As we compressed the file and are limiting recordings to 2.5 minutes, we won't run into trouble with storage capacity
  const fData = await new Promise<{ fields: any; files: any }>(
    (resolve, reject) => {
      const form = new IncomingForm({
        multiples: false,
        uploadDir: "/tmp",
        keepExtensions: true,
      });
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        resolve({ fields, files });
      });
    }
  );

  const videoFile = fData.files.file;
  const videoFilePath = videoFile?.filepath;
  console.log(videoFilePath);

  try {
    const resp = await openai.createTranscription(
      fs.createReadStream(videoFilePath),
      process.env.TRANSCRIBE_MODEL || DEFAULT_TRANSCRIBE_MODEL
      // Uncomment the line below if you would also like to capture filler words:
      // "Please include any filler words such as 'um', 'uh', 'er', or other disfluencies in the transcription. Make sure to also capitalize and punctuate properly."
    );

    const transcript = resp?.data?.text;

    // Content moderation check: only OpenAI offers a moderation endpoint, so
    // this runs only when an OpenAI key is configured.
    if (process.env.OPENAI_API_KEY) {
      const moderation = new OpenAIApi(
        new Configuration({ apiKey: process.env.OPENAI_API_KEY })
      );
      const response = await moderation.createModeration({
        input: transcript,
      });

      if (response?.data?.results[0]?.flagged) {
        res
          .status(200)
          .json({ error: "Inappropriate content detected. Please try again." });
        return;
      }
    }

    res.status(200).json({ transcript });
    return resp.data;
  } catch (error: any) {
    console.error(
      "server error",
      error?.response?.status,
      error?.response?.data?.error?.message ?? error?.message
    );
    res.status(500).json({ error: "Error" });
  }
}
