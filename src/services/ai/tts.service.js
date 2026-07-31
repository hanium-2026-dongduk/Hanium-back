const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * 텍스트를 받아 Gemini TTS로 음성(PCM) 생성 후 Buffer 반환
 * @param {string} text - 낭독할 텍스트
 * @returns {Promise<Buffer>} 오디오 버퍼 (PCM raw, WAV 변환 필요)
 */

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
  header.writeUInt16LE(1, 20); // PCM
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
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-tts-preview', // 또는 gemini-2.5-flash-preview-tts
      contents: [{ parts: [{ text: `Read aloud in a warm, gentle storytelling voice: ${text}` }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }, // 원하는 보이스로 교체 가능
          },
        },
      },
    });

    const audioPart = response.candidates[0].content.parts.find((p) => p.inlineData);

    if (!audioPart) {
      throw new Error('응답에 오디오 데이터가 없습니다');
    }

    const pcmBuffer = Buffer.from(audioPart.inlineData.data, 'base64');
    return pcmToWav(pcmBuffer); // 24000Hz, mono, 16bit이 Gemini TTS 기본값

    // PCM raw 데이터 → 기존에 만들어둔 PCM-to-WAV 변환 함수에 넘기면 됩니다
    return Buffer.from(audioPart.inlineData.data, 'base64');
  } catch (error) {
    console.error('[Gemini TTS API Error]:', error);
    throw new Error('TTS 음성 생성 실패');
  }
}



module.exports = { generateAudio };