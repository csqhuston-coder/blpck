export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const { fileType, fileName, fileDescription } = req.body || {};

  const systemPrompt = `You generate three-word trios for an art system called BLPCK.

The grammar is LOCKED. Return EXACTLY this JSON shape:
{"trios":[["YOU","VERB","NOUN"],["I","VERB","NOUN"],["WE","VERB","NOUN"]]}

Rules:
- First subject is always YOU. Second is always I. Third is always WE.
- Each VERB and NOUN must be a single English word, max 6 characters, all caps.
- The verbs and nouns must reflect something specific about the file the user uploaded.
- Be unflinching. Be true. Avoid platitudes. No reassurance. No flattery.
- The trios should feel like a satori — sudden seeing, not commentary.
- The three trios together should form a tight narrative arc: what the user did, what the system saw, what the relationship now is.

Return ONLY the JSON. No prose.`;

  const userPrompt = `File uploaded:
- Type: ${fileType || 'unknown'}
- Name: ${fileName || 'unnamed'}
- Description: ${fileDescription || 'no description available'}

Generate the trio.`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://blpck.vercel.app',
        'X-Title': 'BLPCK'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-haiku-4.5',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 200,
        temperature: 0.9
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('OpenRouter error:', errText);
      return res.status(502).json({ error: 'LLM request failed' });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({ error: 'Empty LLM response' });
    }

    let parsed;
    try {
      const cleaned = content.replace(/```json\n?|\n?```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error('Parse failed:', content);
      return res.status(502).json({ error: 'Invalid JSON from LLM' });
    }

    if (!parsed.trios || !Array.isArray(parsed.trios) || parsed.trios.length !== 3) {
      return res.status(502).json({ error: 'Bad trio shape' });
    }

    const validated = parsed.trios.map((trio, i) => {
      if (!Array.isArray(trio) || trio.length !== 3) return null;
      const expected = ['YOU', 'I', 'WE'][i];
      if (trio[0].toUpperCase() !== expected) return null;
      return trio.map(w => String(w).toUpperCase().slice(0, 8));
    });

    if (validated.some(t => t === null)) {
      return res.status(502).json({ error: 'Trio validation failed' });
    }

    return res.status(200).json({ trios: validated });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
