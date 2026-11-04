"""Speech-to-text for audio recorded by the Chrome extension.

Meet's live captions are tuned for speed, so they garble names, jargon and accents. The extension can
record the call audio instead and send it here in short chunks; Whisper (free tier on Groq) transcribes
each chunk, and the extension still uses the captions only to know who was speaking when.
"""
import difflib
import os
import re

import httpx

GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
MODEL = os.getenv('TRANSCRIBE_MODEL', 'whisper-large-v3-turbo')
MAX_PROMPT_CHARS = 600            # Whisper reads only the last ~224 tokens of the prompt

# Whisper's own defaults for "this was silence, not speech"
NO_SPEECH_PROB = 0.6
LOW_LOGPROB = -1.0
MAX_COMPRESSION = 2.4             # higher means the model got stuck repeating itself
# What Whisper tends to invent on near-silence (it was trained on a lot of subtitled video)
SILENCE_PHRASES = {'thank you', 'thank you.', 'thanks for watching', 'thanks for watching!',
                   'thank you for watching', 'thank you for watching.', 'you', 'bye', 'bye.', '.'}


class TranscriptionUnavailable(Exception):
    """No speech-to-text provider is configured, or it failed; the extension falls back to captions."""


def build_prompt(company: str, names: list[str], title: str = '') -> str:
    """Whisper uses the prompt as preceding context, which mostly helps it spell names and terms right."""
    parts = [f"Meeting at {company}" if company else 'Work meeting']
    if title:
        parts[0] += f": {title}"
    if names:
        parts.append('Attendees: ' + ', '.join(names))
    return ('. '.join(parts) + '.')[:MAX_PROMPT_CHARS]


def clean_segments(segments: list[dict]) -> list[dict]:
    """Drop segments Whisper made up on silence or got stuck repeating; keep start/end (seconds) and text."""
    kept = []
    for s in segments or []:
        text = (s.get('text') or '').strip()
        if not text:
            continue
        no_speech = s.get('no_speech_prob', 0) or 0
        if no_speech > NO_SPEECH_PROB and (s.get('avg_logprob', 0) or 0) < LOW_LOGPROB:
            continue
        if (s.get('compression_ratio', 0) or 0) > MAX_COMPRESSION:
            continue
        if text.lower() in SILENCE_PHRASES and no_speech > 0.3:
            continue
        kept.append({'start': round(float(s.get('start', 0)), 2), 'end': round(float(s.get('end', 0)), 2), 'text': text})
    return kept


def _squash(word: str) -> str:
    """Lowercase and collapse doubled letters, so 'Aneeka' and 'Anika' compare closely."""
    return re.sub(r'(.)\1+', r'\1', word.lower())


NAME_MATCH = 0.75


def correct_names(segments: list[dict], names: list[str]) -> list[dict]:
    """Snap capitalised words that are a near-miss of a team member's name ('Aneika', 'Rahu') to that name.
    Only fixes a word when exactly one name part is close, and never touches words that already are a name."""
    parts = {p for n in names for p in n.split() if len(p) >= 3}
    if not parts:
        return segments
    exact = {p.lower() for p in parts}

    def fix(match):
        word = match.group(0)
        if word.lower() in exact:
            return word
        scores = [(difflib.SequenceMatcher(None, _squash(word), _squash(p)).ratio(), p) for p in parts]
        close = [p for score, p in scores if score >= NAME_MATCH]
        return close[0] if len(set(close)) == 1 else word

    return [{**s, 'text': re.sub(r"\b[A-Z][a-z]{2,}\b", fix, s['text'])} for s in segments]


def transcribe(audio: bytes, filename: str, content_type: str, prompt: str) -> list[dict]:
    """Send one chunk to Whisper and return its cleaned segments."""
    key = os.getenv('GROQ_API_KEY')
    if not key:
        raise TranscriptionUnavailable('Audio transcription is not set up on the server (GROQ_API_KEY).')
    try:
        res = httpx.post(
            GROQ_URL, headers={'Authorization': f'Bearer {key}'}, timeout=60,
            files={'file': (filename, audio, content_type)},
            data={'model': MODEL, 'response_format': 'verbose_json', 'temperature': '0', 'prompt': prompt},
        )
    except httpx.HTTPError as e:
        raise TranscriptionUnavailable(f'Could not reach the transcription service: {e.__class__.__name__}')
    if res.status_code == 429:
        raise TranscriptionUnavailable('Free transcription limit reached for now; captions are used instead.')
    if res.status_code >= 400:
        raise TranscriptionUnavailable(f'Transcription failed ({res.status_code}).')
    return clean_segments(res.json().get('segments') or [])
