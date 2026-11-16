import fs from 'fs';
import path from 'path';

// Generate a valid WAV audio file with pleasant retro warm cassette tone sequence
function generateWavFile(durationSec: number, frequencies: number[]): Buffer {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * durationSec);
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);

  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  const segmentLen = Math.floor(numSamples / frequencies.length);
  for (let i = 0; i < numSamples; i++) {
    const segIdx = Math.min(frequencies.length - 1, Math.floor(i / segmentLen));
    const freq = frequencies[segIdx];
    const t = i / sampleRate;

    const envelope = Math.sin((Math.PI * (i % segmentLen)) / segmentLen);
    const wave = Math.sin(2 * Math.PI * freq * t) * 0.7 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.2;
    const sampleVal = Math.floor(wave * envelope * 0.4 * 32767);
    buffer.writeInt16LE(sampleVal, 44 + i * 2);
  }

  return buffer;
}

const audioDir = path.resolve(process.cwd(), 'public/audio');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

const files = [
  { name: 'a1_01_greetings.mp3', tones: [440, 523.25, 659.25, 587.33, 523.25], sec: 4 },
  { name: 'a1_02_nationality.mp3', tones: [392, 440, 523.25, 440, 392], sec: 4 },
  { name: 'a1_03_time.mp3', tones: [523.25, 587.33, 659.25, 783.99], sec: 4 },
  { name: 'a2_01_restaurant.mp3', tones: [349.23, 392, 440, 523.25, 440], sec: 5 },
  { name: 'b1_01_shopping.mp3', tones: [440, 493.88, 523.25, 587.33], sec: 5 },
  { name: 'b1_02_directions.mp3', tones: [523.25, 659.25, 783.99, 659.25], sec: 6 },
  { name: 'b1_03_weather.mp3', tones: [392, 440, 523.25, 587.33, 659.25], sec: 6 },
  { name: 'b2_01_train.mp3', tones: [440, 554.37, 659.25, 830.61], sec: 6 },
  { name: 'b2_02_study.mp3', tones: [523.25, 587.33, 659.25, 783.99, 880], sec: 7 },
  { name: 'c1_01_tea_culture.mp3', tones: [329.63, 392, 440, 493.88, 587.33], sec: 7 },
  { name: 'c1_02_technology.mp3', tones: [440, 523.25, 587.33, 659.25, 783.99], sec: 7 },
  { name: 'c2_01_ecology.mp3', tones: [392, 440, 523.25, 659.25, 783.99, 880], sec: 8 },
  { name: 'b1_04_london_weekend.mp3', tones: [440, 523.25, 659.25, 783.99], sec: 7 },
  { name: 'c2_02_reading.mp3', tones: [440, 523.25, 659.25, 783.99, 880, 987.77], sec: 8 },
];

for (const f of files) {
  const filePath = path.join(audioDir, f.name);
  if (!fs.existsSync(filePath)) {
    const buf = generateWavFile(f.sec, f.tones);
    fs.writeFileSync(filePath, buf);
    console.log(`Generated sample audio: ${f.name}`);
  }
}

console.log('English sample audio initialized.');
