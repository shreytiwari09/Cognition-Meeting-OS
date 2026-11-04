from datetime import datetime, timezone

from crew.pipeline import (
    assemble, confidence_score, quote_in_transcript, resolve_deadline, resolve_owner, task_doc_id,
)
from crew.schemas import Assignment, ExtractedItem, ExtractionResult, FollowUp, Review

MEETING = datetime(2026, 9, 30, 10, 0, tzinfo=timezone.utc)  # a Wednesday
TEAM = [
    {'uid': 'u1', 'name': 'Priya Sharma', 'role': 'pm'},
    {'uid': 'u2', 'name': 'Rahul Verma', 'role': 'employee'},
    {'uid': 'u3', 'name': 'Rahul Gupta', 'role': 'employee'},
    {'uid': 'u4', 'name': 'Anika Rao', 'role': 'employee'},
]
TRANSCRIPT = """Priya: Anika, can you finish the pricing page redesign by Friday?
Anika: Yes, I'll have the pricing page done by Friday.
Priya: We decided to launch the beta on October 15.
Rahul Verma: One risk is that the payments API might not be ready in time."""


def item(**kw):
    base = dict(type='task', title='Finish pricing page redesign', description='Complete and ship the new pricing page',
                owner_name='Anika', deadline_text='by Friday', evidence_quote="I'll have the pricing page done by Friday", speaker='Anika')
    return ExtractedItem(**{**base, **kw})


def test_quote_matches_verbatim_and_small_drift():
    assert quote_in_transcript("I'll have the pricing page done by Friday", TRANSCRIPT)
    assert quote_in_transcript("ill have the pricing page done by friday!", TRANSCRIPT)
    assert not quote_in_transcript("We agreed to hire three more engineers", TRANSCRIPT)
    assert not quote_in_transcript("yes", TRANSCRIPT)


def test_resolve_deadline_is_relative_to_meeting_date():
    assert resolve_deadline('by Friday', MEETING) == '2026-10-02'
    assert resolve_deadline('EOD', MEETING) == '2026-09-30'
    assert resolve_deadline('end of week', MEETING) == '2026-10-02'
    assert resolve_deadline('end of the month', MEETING) == '2026-09-30'
    assert resolve_deadline('October 15', MEETING) == '2026-10-15'
    assert resolve_deadline('in 2 weeks', MEETING) == '2026-10-14'
    assert resolve_deadline('not specified', MEETING) is None
    assert resolve_deadline('next sprint', MEETING) is None


def test_resolve_owner_exact_then_unique_first_name():
    assert resolve_owner('Priya Sharma', TEAM)['uid'] == 'u1'
    assert resolve_owner('anika', TEAM)['uid'] == 'u4'
    assert resolve_owner('Rahul', TEAM) is None  # ambiguous
    assert resolve_owner('Rahul Gupta', TEAM)['uid'] == 'u3'
    assert resolve_owner('unassigned', TEAM) is None
    assert resolve_owner('Someone Else', TEAM) is None


def test_confidence_rubric():
    full = confidence_score(title='Ship pricing page redesign', description='Complete and ship the new pricing page',
                            owner_resolved=True, owner_named=True, deadline_resolved=True, grounded=True)
    assert full == 100
    vague = confidence_score(title='Stuff', description='', owner_resolved=False, owner_named=False,
                             deadline_resolved=False, grounded=True)
    assert vague == 25


def test_task_ids_are_stable():
    assert task_doc_id('m1', 'Ship it') == task_doc_id('m1', '  ship it ')
    assert task_doc_id('m1', 'Ship it') != task_doc_id('m2', 'Ship it')


def run_assemble(items, reviews=None, assignments=None, followups=None):
    return assemble(meeting_id='m1', extraction=ExtractionResult(items=items),
                    assignments=assignments or [], reviews=reviews or [], followups=followups or [],
                    team=TEAM, meeting_date=MEETING, transcript=TRANSCRIPT)


def test_assemble_builds_complete_task_and_separates_decisions_and_risks():
    items = [
        item(),
        item(type='decision', title='Launch beta on October 15', evidence_quote='We decided to launch the beta on October 15'),
        item(type='risk', title='Payments API may slip', evidence_quote='the payments API might not be ready in time'),
    ]
    result = run_assemble(
        items,
        assignments=[Assignment(index=0, assigned_to='Anika Rao')],
        reviews=[Review(index=i, grounded=True, needs_review=False) for i in range(3)],
        followups=[FollowUp(index=0, followup_days=2, escalate_to='Priya Sharma')],
    )
    assert len(result['tasks']) == 1 and len(result['decisions']) == 1 and len(result['risks']) == 1
    task = result['tasks'][0]
    assert task['owner_uid'] == 'u4' and task['assigned_to'] == 'anika rao'
    assert task['deadline_date'] == '2026-10-02' and task['deadline_text'] == 'by Friday'
    assert task['followup_days'] == 2 and task['escalate_to'] == 'Priya Sharma'
    assert task['confidence'] == 100 and task['needs_review'] is False


def test_assemble_drops_item_only_when_agent_and_check_both_reject():
    fake = item(title='Hire three engineers', evidence_quote='We agreed to hire three more engineers')
    dropped = run_assemble([fake], reviews=[Review(index=0, grounded=False, needs_review=True)])
    assert dropped['tasks'] == [] and dropped['dropped_count'] == 1

    kept = run_assemble([fake], reviews=[Review(index=0, grounded=True, needs_review=False)])
    assert kept['tasks'][0]['needs_review'] is True
    assert 'not found in transcript' in kept['tasks'][0]['review_reason']


def test_assemble_flags_unknown_owner():
    result = run_assemble([item(owner_name='Someone Else')], assignments=[Assignment(index=0, assigned_to='Someone Else')])
    task = result['tasks'][0]
    assert task['owner_uid'] is None and task['needs_review'] is True
    assert result['flagged_count'] == 1


def test_grounding_guardrail_parses_raw_output_and_rejects_hallucinations():
    from types import SimpleNamespace
    from crew.tasks import grounding_guardrail
    check = grounding_guardrail(TRANSCRIPT)

    good = ExtractionResult(items=[item()]).model_dump_json()
    ok, value = check(SimpleNamespace(pydantic=None, raw=f"Here you go:\n{good}"))
    assert ok and ExtractionResult.model_validate_json(value).items[0].title == 'Finish pricing page redesign'

    fake = ExtractionResult(items=[item(evidence_quote='We agreed to hire three more engineers')]).model_dump_json()
    ok, error = check(SimpleNamespace(pydantic=None, raw=fake))
    assert not ok and 'does not appear in the transcript' in error

    ok, error = check(SimpleNamespace(pydantic=None, raw='not json at all'))
    assert not ok
