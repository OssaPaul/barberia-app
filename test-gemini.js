app.get('/api/test-gemini', async (req, res) => {
  try {
    const response = await generativeModel.generateContent("Hola, ¿puedes responder?");
    res.json(response.response.candidates[0].content.parts[0].text);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});