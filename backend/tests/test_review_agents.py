from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from crew import crew as crew_module
from crew.pipeline import (
    apply_audit, apply_confidence_notes, assemble, automated_audit_checks, confidence_breakdown, confidence_score,
)
from crew.schemas import (
    Assignment, AssignmentResult, AuditFinding, AuditReport, ConfidenceNote, ConfidenceNotes, ExtractedItem,
    ExtractionResult, FollowUp, FollowUpPlan, Review, ReviewResult,
)
from crew.tasks import indexed_guardrail

MEETING = datetime(2026, 9, 30, 10, 0, tzinfo=timezone.utc)
TEAM = [{'uid': 'u1', 'name': 'Priya Sharma', 'role': 'pm'}, {'uid': 'u4', 'name': 'Anika Rao', 'role': 'employee'}]
TRANSCRIPT = "Priya: Anika, please finish the pricing page redesign by Friday.\nAnika: Yes, I'll have the pricing page done by Friday."


def task(title='Finish pricing page redesign', **kw):
    base = {'title': title, 'assigned_to': 'anika rao', 'owner_uid': 'u4', 'deadline_date': '2026-10-02',
            'deadline_text': 'by Friday', 'confidence': 100.0, 'needs_review': False, 'review_reason': ''}
    return {**base, **kw}


def test_breakdown_sums_to_score_and_shows_what_is_missing():
    kw = dict(title='Ship pricing page', description='Complete and ship the pricing page', owner_resolved=True,
              owner_named=True, deadline_resolved=False, grounded=True)
    breakdown = confidence_breakdown(**kw)
    assert breakdown == {'clarity': 25, 'owner': 25, 'deadline': 0, 'evidence': 25}
    assert confidence_score(**kw) == 75


def test_owner_points_depend_on_whether_the_meeting_named_them():
    common = dict(title='Ship pricing page', description='Complete and ship the pricing page',
                  owner_resolved=True, owner_named=True, deadline_resolved=True, grounded=True)
    assert confidence_breakdown(**common)['owner'] == 25                       # named in the meeting
    assert confidence_breakdown(**common, owner_stated=False)['owner'] == 15   # inferred by the AI
    assert confidence_breakdown(**{**common, 'owner_resolved': False})['owner'] == 10  # not on the team
    assert confidence_breakdown(**{**common, 'owner_resolved': False, 'owner_named': False})['owner'] == 0


def test_inferred_owner_scores_lower_in_assembly():
    named = ExtractedItem(type='task', title='Finish pricing page redesign', description='Complete and ship the new pricing page',
                          owner_name='Anika', deadline_text='by Friday', evidence_quote="I'll have the pricing page done by Friday")
    guessed = named.model_copy(update={'owner_name': 'unknown', 'title': 'Someone update the docs'})
    result = assemble(meeting_id='m1', extraction=ExtractionResult(items=[named, guessed]),
                      assignments=[Assignment(index=0, assigned_to='Anika Rao'), Assignment(index=1, assigned_to='Priya Sharma')],
                      reviews=[], followups=[], team=TEAM, meeting_date=MEETING, transcript=TRANSCRIPT)
    assert [t['confidence_breakdown']['owner'] for t in result['tasks']] == [25, 15]


def test_assemble_stores_the_breakdown():
    extraction = ExtractionResult(items=[ExtractedItem(
        type='task', title='Finish pricing page redesign', description='Complete and ship the new pricing page',
        owner_name='Anika', deadline_text='by Friday', evidence_quote="I'll have the pricing page done by Friday")])
    result = assemble(meeting_id='m1', extraction=extraction, assignments=[], reviews=[], followups=[],
                      team=TEAM, meeting_date=MEETING, transcript=TRANSCRIPT)
    assert result['tasks'][0]['confidence_breakdown'] == {'clarity': 25, 'owner': 25, 'deadline': 25, 'evidence': 25}


def test_automated_checks_find_past_deadlines_and_duplicates():
    tasks = [task(), task('Finish the pricing page redesign!'), task('Write docs', deadline_date='2026-09-01')]
    findings = automated_audit_checks(tasks, MEETING)
    assert {(f['category'], f['task_index']) for f in findings} == {('duplicate', 1), ('deadline', 2)}
    assert all(f['source'] == 'automated' for f in findings)


def test_automated_checks_note_overloaded_owner():
    titles = ['Draft budget', 'Book venue', 'Email vendors', 'Update roadmap', 'Review contracts', 'Plan offsite']
    tasks = [task(t) for t in titles]
    findings = automated_audit_checks(tasks, MEETING)
    assert [f['category'] for f in findings] == ['ownership'] and findings[0]['severity'] == 'info'


def test_confidence_notes_are_attached_and_bad_indexes_ignored():
    tasks = [task()]
    apply_confidence_notes(tasks, [ConfidenceNote(index=0, explanation=' All four criteria met. ', next_step=''),
                                   ConfidenceNote(index=7, explanation='ghost')])
    assert tasks[0]['confidence_note'] == 'All four criteria met.'
    assert 'confidence_note' not in tasks[0] or len(tasks) == 1


def test_warnings_flag_the_task_but_info_does_not():
    tasks = [task(), task('Other work')]
    apply_audit(tasks, [
        {'severity': 'warning', 'category': 'conflict', 'task_index': 0, 'message': 'Contradicts the decision to pause.'},
        {'severity': 'info', 'category': 'ownership', 'task_index': 1, 'message': 'Busy owner.'},
        {'severity': 'critical', 'category': 'other', 'task_index': None, 'message': 'Meeting-wide issue.'},
    ])
    assert tasks[0]['needs_review'] and 'Contradicts the decision' in tasks[0]['review_reason']
    assert not tasks[1]['needs_review']
    apply_audit(tasks, [{'severity': 'warning', 'category': 'conflict', 'task_index': 0, 'message': 'Contradicts the decision to pause.'}])
    assert tasks[0]['review_reason'].count('Contradicts') == 1  # not duplicated


def test_indexed_guardrail_rejects_nonexistent_task_numbers():
    check = indexed_guardrail(AuditReport, 'findings', task_count=2)
    good = AuditReport(findings=[AuditFinding(severity='info', category='other', task_index=1, message='ok')], summary='fine')
    assert check(SimpleNamespace(pydantic=None, raw=good.model_dump_json()))[0]
    bad = AuditReport(findings=[AuditFinding(severity='info', category='other', task_index=5, message='ok')], summary='fine')
    ok, error = check(SimpleNamespace(pydantic=None, raw=bad.model_dump_json()))
    assert not ok and '0 to 1' in error
    assert check(SimpleNamespace(pydantic=None, raw='nonsense'))[0] is False


# ── Whole two-crew flow with stubbed LLM crews ────────────────────────────────

def fake_task(pydantic=None, raw=''):
    return SimpleNamespace(agent='agent', output=SimpleNamespace(pydantic=pydantic, raw=raw) if pydantic or raw else None)


class StubCrew:
    """Stands in for crewai.Crew: 'runs' by doing nothing, or raises for the crew flagged to fail."""
    fail_second = False
    calls = 0

    def __init__(self, **kw):
        StubCrew.calls += 1
        self.is_second = StubCrew.calls == 2

    def kickoff(self):
        if self.is_second and StubCrew.fail_second:
            raise RuntimeError('429 quota exceeded')


@pytest.fixture
def wired(monkeypatch):
    extraction = ExtractionResult(items=[
        ExtractedItem(type='task', title='Finish pricing page redesign', description='Complete and ship the new pricing page',
                      owner_name='Anika', deadline_text='by Friday',
                      evidence_quote="I'll have the pricing page done by Friday", speaker='Anika'),
        ExtractedItem(type='task', title='Finish the pricing page redesign', description='Complete and ship the new pricing page',
                      owner_name='Anika', deadline_text='by Friday',
                      evidence_quote="please finish the pricing page redesign by Friday", speaker='Priya')])
    crew1 = [fake_task(extraction),
             fake_task(AssignmentResult(assignments=[Assignment(index=0, assigned_to='Anika Rao'), Assignment(index=1, assigned_to='Anika Rao')])),
             fake_task(ReviewResult(reviews=[Review(index=0, grounded=True, needs_review=False), Review(index=1, grounded=True, needs_review=False)],
                                    validation_summary='Looks fine.')),
             fake_task(FollowUpPlan(followups=[FollowUp(index=0, followup_days=2, escalate_to='Priya Sharma')]))]
    crew2 = [fake_task(ConfidenceNotes(notes=[ConfidenceNote(index=0, explanation='Fully specified.')])),
             fake_task(AuditReport(findings=[AuditFinding(severity='warning', category='conflict', task_index=0, message='Overlaps task #1.')],
                                   summary='Fix the overlap.')),
             fake_task(raw='## Executive Summary\nAll good.')]
    StubCrew.calls, StubCrew.fail_second = 0, False
    monkeypatch.setattr(crew_module, 'Crew', StubCrew)
    monkeypatch.setattr(crew_module, 'get_crew_tasks', lambda *a: (crew1, TEAM))
    monkeypatch.setattr(crew_module, 'get_review_tasks', lambda *a: crew2)
    return crew2


def run():
    return crew_module.run_meeting_crew('m1', TRANSCRIPT, [], TEAM, MEETING)


def test_full_flow_combines_both_crews(wired):
    result = run()
    assert len(result['tasks']) == 2
    first = result['tasks'][0]
    assert first['confidence_note'] == 'Fully specified.'
    assert first['needs_review'] and 'Overlaps task #1.' in first['review_reason']
    assert result['tasks'][1]['needs_review']  # flagged by the automated duplicate check
    assert result['audit']['completed'] and not result['audit']['passed']
    sources = {f['source'] for f in result['audit']['findings']}
    assert sources == {'automated', 'agent'}
    assert result['mom'].startswith('## Executive Summary')
    assert result['flagged_count'] == 2 and result['warnings'] == []


def test_crew_two_failure_keeps_tasks_and_reports_a_warning(wired):
    StubCrew.fail_second = True
    for t in wired:            # nothing in crew 2 completed
        t.output = None
    result = run()
    assert len(result['tasks']) == 2 and result['mom'] == ''
    assert result['audit']['completed'] is False
    assert 'quota exceeded' in result['warnings'][0] and 'Regenerate' in result['warnings'][0]


def test_partial_crew_two_progress_is_kept(wired):
    StubCrew.fail_second = True
    wired[1].output = None     # audit and summary never finished, confidence did
    wired[2].output = None
    result = run()
    assert result['tasks'][0]['confidence_note'] == 'Fully specified.'
    assert result['audit']['completed'] is False and result['warnings']
