import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

// Export libraries
import { Document, Packer, Paragraph } from 'docx';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

import OpenAI from 'openai';

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
  console.error('❌ ERROR: Set OPENAI_API_KEY in a .env file');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_KEY });

// helper: fetch wikipedia summary (built-in fetch in Node v22)
async function fetchWikipediaSummary(term) {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json.extract || null;
  } catch (e) {
    console.error('Wiki fetch error', e);
    return null;
  }
}

// --- CHAT ENDPOINT ---
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, wikiQuery } = req.body;
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages must be an array' });
    }

    const systemMessages = [
      {
        role: 'system',
        content:
          'You are a friendly helpful assistant. Answer clearly and conversationally. If Wikipedia info is provided, use it in your explanation.',
      },
    ];

    if (wikiQuery && typeof wikiQuery === 'string' && wikiQuery.trim()) {
      const wiki = await fetchWikipediaSummary(wikiQuery);
      systemMessages.push({
        role: 'system',
        content: wiki
          ? `WIKIPEDIA_SUMMARY_FOR:${wikiQuery}\n\n${wiki}\n\nEND_WIKIPEDIA_SUMMARY`
          : `WIKIPEDIA_SUMMARY_FOR:${wikiQuery}\n\n(NO SUMMARY FOUND)\n\nEND_WIKIPEDIA_SUMMARY`,
      });
    }

    const payloadMessages = [
      ...systemMessages,
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: payloadMessages,
      max_tokens: 800,
      temperature: 0.4,
    });

    const reply =
      completion.choices?.[0]?.message?.content ||
      'Sorry, I could not get a response from the AI.';

    res.json({ reply });
  } catch (err) {
    console.error('Server error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- IMAGE DESCRIPTION ENDPOINT ---
app.post('/api/describe', async (req, res) => {
  try {
    const { image } = req.body;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini', // or gpt-4o-mini
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image in detail.' },
            { type: 'image_url', image_url: { url: image } },
          ],
        },
      ],
    });

    res.json({ description: completion.choices[0].message.content });
  } catch (err) {
    console.error('Image description error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Single listen
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
