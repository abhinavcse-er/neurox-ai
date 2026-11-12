const MODEL = "gemini-2.5-flash";
const BASE_URL = "https://generativelanguage.googleapis.com/v1/models";

/**
 * Call the Gemini 2.5 Flash API.
 * The API key lives server-side in the GEMINI_API_KEY env var — never sent to the browser.
 */
export async function getGeminiResponse(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY env var is not set");

  const url = `${BASE_URL}/${MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
    // Abort after 30 s so slow requests don't block the server
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response from AI.";
}
