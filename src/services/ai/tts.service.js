const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const { retryWithBackoff } = require('../../utils/retry');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const AUDIO_DIR = path.join(__dirname, '../../../public/audio');
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

function pcmToWav(pcmBuffer, sampleRate = 24000, channels = 1, bitDepth = 16) {
  const byteRate = sampleRate * channels * (bitDepth / 8);
  const blockAlign = channels * (bitDepth / 8);
  const dataSize = pcmBuffer.length;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

async function generateAudio(text) {
  try {
    // API 호출 부분만 재시도 래퍼로 감싸기
    const response = await retryWithBackoff(() =>
      ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: `Read aloud in a warm, gentle storytelling voice: ${text}` }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      })
    );

    const audioPart = response.candidates[0].content.parts.find((p) => p.inlineData);
    if (!audioPart) {
      throw new Error('응답에 오디오 데이터가 없습니다');
    }

    const pcmBuffer = Buffer.from(audioPart.inlineData.data, 'base64');
    const wavBuffer = pcmToWav(pcmBuffer);

    const fileName = `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.wav`;
    const filePath = path.join(AUDIO_DIR, fileName);
    fs.writeFileSync(filePath, wavBuffer);

    return `/audio/${fileName}`;
  } catch (error) {
    console.error('[Gemini TTS API Error]:', error);
    throw new Error('TTS 음성 생성 실패');
  }
}

module.exports = { generateAudio };