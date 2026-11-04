"""Call-audio transcription for the extension: Whisper output cleanup, spelling hints, and the endpoint."""
import pytest
from fastapi.testclient import TestClient

import access
import auth_middleware
import transcription
from main import app
from routes import extension
from tests.fake_firestore import FakeDb

CO = 'co_1'
MGR = {'uid': 'mgr', 'name': 'Alan Alpha', 'role': 'manager', 'companyId': CO}
EMP = {'uid': 'emp', 'name': 'Anika Rao', 'role': 'employee', 'companyId': CO, 'managerId': 'mgr'}
OTHER = {'uid': 'x', 'name': 'Zed Outsider', 'role': 'employee', 'companyId': 'co_2'}


@pytest.fixture(autouse=True)
def fake_db(monkeypatch):
    fake = FakeDb({f"users/{u['uid']}": {k: v for k, v in u.items() if k != 'uid'} for u in (MGR, EMP, OTHER)}
                  | {f'companies/{CO}': {'name': 'Acme'}})
    for module in (extension, access, auth_middleware):
        monkeypatch.setattr(module, 'db', fake)
    monkeypatch.setattr(extension.limiter, 'enabled', False)
    extension._team_names.clear()
    yield fake
    app.dependency_overrides.clear()


client = TestClient(app)


def connect():
    app.dependency_overrides[auth_middleware.get_current_profile] = lambda: MGR
    token = client.post('/extension/token').json()['token']
    app.dependency_overrides.clear()
    return {'Authorization': f'Bearer {token}'}


def seg(text, start=0.0, end=2.0, no_speech=0.01, logprob=-0.2, compression=1.3):
    return {'text': text, 'start': start, 'end': end, 'no_speech_prob': no_speech,
            'avg_logprob': logprob, 'compression_ratio': compression}


# ── Cleanup ─────────────────────────────────────────────────────────────────

def test_keeps_real_speech_and_trims_fields():
    assert transcription.clean_segments([seg(' Ship the API by Friday. ', 1.234, 3.5)]) == \
        [{'start': 1.23, 'end': 3.5, 'text': 'Ship the API by Friday.'}]


def test_drops_what_whisper_invents_on_silence():
    out = transcription.clean_segments([
        seg('Thanks for watching!', no_speech=0.5),                 # classic silence hallucination
        seg('Some words', no_speech=0.9, logprob=-1.5),             # Whisper's own "this was silence" rule
        seg('the the the the the the', compression=3.1),            # stuck repeating itself
        seg('   '),
        seg('Thank you.', no_speech=0.05),                          # a real "thank you" stays
    ])
    assert [s['text'] for s in out] == ['Thank you.']


def test_prompt_lists_company_title_and_names_and_stays_short():
    p = transcription.build_prompt('Acme', ['Anika Rao', 'Alan Alpha'], 'Q4 sync')
    assert p == 'Meeting at Acme: Q4 sync. Attendees: Anika Rao, Alan Alpha.'
    assert len(transcription.build_prompt('Acme', [f'Person {i}' for i in range(200)])) <= transcription.MAX_PROMPT_CHARS


def test_near_miss_names_snap_to_the_roster():
    team = ['Anika Rao', 'Rahul Verma', 'Priya Shah']
    fixed = transcription.correct_names([
        {'start': 0, 'end': 1, 'text': 'Aneika, can you ship it? Rahu says Aneeka agreed.'},
        {'start': 1, 'end': 2, 'text': 'Okay. Prior to Friday, Priya and the Kubernetes team. Rahul is out.'},
    ], team)
    assert fixed[0]['text'] == 'Anika, can you ship it? Rahul says Anika agreed.'
    assert fixed[1]['text'] == 'Okay. Prior to Friday, Priya and the Kubernetes team. Rahul is out.'   # nothing else changes
    assert transcription.correct_names([{'text': 'Aneika'}], []) == [{'text': 'Aneika'}]


def test_missing_key_means_unavailable(monkeypatch):
    monkeypatch.delenv('GROQ_API_KEY', raising=False)
    with pytest.raises(transcription.TranscriptionUnavailable):
        transcription.transcribe(b'x', 'a.webm', 'audio/webm', '')


# ── Endpoint ────────────────────────────────────────────────────────────────

def test_transcribes_a_chunk_with_the_company_names_as_hints(monkeypatch):
    seen = {}
    def fake(audio, filename, content_type, prompt):
        seen.update(audio=audio, prompt=prompt, content_type=content_type)
        return [{'start': 0.5, 'end': 2.0, 'text': 'Anika will ship it.'}]
    monkeypatch.setattr(transcription, 'transcribe', fake)

    r = client.post('/extension/transcribe', headers=connect(), data={'title': 'Standup'},
                    files={'audio': ('chunk.webm', b'webm-bytes', 'audio/webm')})
    assert r.status_code == 200
    assert r.json() == {'segments': [{'start': 0.5, 'end': 2.0, 'text': 'Anika will ship it.'}]}
    assert seen['audio'] == b'webm-bytes' and seen['content_type'] == 'audio/webm'
    assert 'Acme: Standup' in seen['prompt'] and 'Anika Rao' in seen['prompt'] and 'Alan Alpha' in seen['prompt']
    assert 'Zed Outsider' not in seen['prompt']           # other companies' people never leak into hints


def test_provider_failure_is_a_503_so_the_extension_falls_back(monkeypatch):
    def boom(*a):
        raise transcription.TranscriptionUnavailable('Free transcription limit reached for now')
    monkeypatch.setattr(transcription, 'transcribe', boom)
    r = client.post('/extension/transcribe', headers=connect(), files={'audio': ('c.webm', b'x', 'audio/webm')})
    assert r.status_code == 503 and 'limit' in r.json()['detail']


def test_rejects_empty_audio_and_unconnected_callers(monkeypatch):
    monkeypatch.setattr(transcription, 'transcribe', lambda *a: [])
    assert client.post('/extension/transcribe', headers=connect(), files={'audio': ('c.webm', b'', 'audio/webm')}).status_code == 400
    assert client.post('/extension/transcribe', files={'audio': ('c.webm', b'x', 'audio/webm')}).status_code == 401
