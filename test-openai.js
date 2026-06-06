import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

(async () => {
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Dime una frase divertida para una barbería moderna." }],
    });

    console.log("✅ Conexión OpenAI OK. Respuesta:");
    console.log(response.choices[0].message.content);
  } catch (error) {
    console.error("❌ Error al conectar con OpenAI:", error);
  }
})();
