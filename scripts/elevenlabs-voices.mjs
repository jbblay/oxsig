import { loadOxsigEnvFiles } from './env-loader.mjs';
import { listElevenLabsVoices } from './elevenlabs-voices-lib.mjs';

await loadOxsigEnvFiles();

const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
const search = process.argv.slice(2).join(' ').trim();

try {
  const voices = await listElevenLabsVoices({ apiKey, search });
  if (!voices.length) {
    console.log(search ? `No ElevenLabs voices matched "${search}".` : 'No ElevenLabs voices are available for this API key.');
    process.exit(0);
  }

  console.log(search ? `ElevenLabs voices matching "${search}":` : 'ElevenLabs voices available to this account:');
  for (const voice of voices) {
    console.log(`\n${voice.name}\n  Voice ID: ${voice.voiceId}\n  Category: ${voice.category}`);
  }
  console.log(`\nFound ${voices.length} voice${voices.length === 1 ? '' : 's'}.`);
  console.log('Set your chosen value in .env.local as ELEVENLABS_VOICE_ID=<voice-id>.');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[oxsig] Could not list ElevenLabs voices: ${message}`);
  process.exitCode = 1;
}
