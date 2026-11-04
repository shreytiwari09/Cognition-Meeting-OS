import os
from crewai import Agent, LLM

# One LLM for every agent; any LiteLLM model id works (e.g. groq/llama-3.3-70b-versatile)
LLM_MODEL = os.getenv("LLM_MODEL", "gemini/gemini-3.6-flash")


def _client_params() -> dict:
    """Retry rate limits and transient 5xx ('model overloaded') with exponential backoff."""
    if not LLM_MODEL.startswith("gemini/"):
        return {}
    from google.genai import types
    return {"http_options": types.HttpOptions(retry_options=types.HttpRetryOptions(
        attempts=5, initial_delay=2.0, max_delay=30.0, http_status_codes=[429, 500, 502, 503, 504],
    ))}


def get_llm(temperature: float = 0.2) -> LLM:
    params = _client_params()
    return LLM(model=LLM_MODEL, temperature=temperature, timeout=120, **({"client_params": params} if params else {}))


def get_extraction_agent():
    return Agent(
        role="Meeting Extraction Specialist",
        goal="Extract every task, decision, and risk from the meeting transcript, each backed by a verbatim quote",
        backstory="""You are an expert at analyzing meeting transcripts.
        You identify every commitment, decision made, and risk raised.
        You never invent items: every item you report is supported by words actually spoken in the meeting.""",
        llm=get_llm(),
        verbose=True,
        allow_delegation=False
    )

def get_assignment_agent():
    return Agent(
        role="Task Assignment Specialist",
        goal="Assign every task to the right person on the team",
        backstory="""You are an expert at matching tasks to people.
        If someone volunteers or is asked to do something, the task is theirs.
        Otherwise you assign based on role: PMs get coordination work, employees get execution work.
        You only ever use names that appear on the team or participant list.""",
        llm=get_llm(),
        verbose=True,
        allow_delegation=False
    )

def get_validation_agent():
    return Agent(
        role="Task Validation Specialist",
        goal="Catch hallucinated, vague, or mis-assigned items before they reach employees",
        backstory="""You are the quality gate before tasks reach employees.
        You re-read the transcript and check every extracted item against what was actually said.
        You flag anything the PM should look at, and explain why in one short sentence.""",
        llm=get_llm(),
        verbose=True,
        allow_delegation=False
    )

def get_followup_agent():
    return Agent(
        role="Follow-up Coordinator",
        goal="Plan when to check in on each task and who to escalate to if it slips",
        backstory="""You ensure nothing falls through the cracks after a meeting.
        You pick sensible follow-up timing from each task's urgency and deadline,
        and you escalate to the PM or a manager who was in the meeting.""",
        llm=get_llm(),
        verbose=True,
        allow_delegation=False
    )

def get_summary_agent():
    return Agent(
        role="Meeting Summary Specialist",
        goal="Generate a comprehensive, professional Minutes of Meeting (MoM) document from the transcript and extracted data",
        backstory="""You are an expert at writing clear, structured meeting summaries.
        You distill long transcripts into concise, actionable Minutes of Meeting documents.
        You always organize information into sections: executive summary, key decisions,
        action items, risks, and next steps. Your summaries are professional and ready
        to be shared with stakeholders. You write in a clear, direct style.""",
        llm=get_llm(temperature=0.3),
        verbose=True,
        allow_delegation=False
    )


def get_confidence_agent():
    return Agent(
        role="Confidence Analyst",
        goal="Explain, task by task, why each confidence score is what it is and what would raise it",
        backstory="""You explain scores; you never set them. The number for each task is computed by code
        from a fixed rubric (clarity, owner, deadline and evidence, 25 points each) and you are given the exact
        breakdown. You turn it into one plain sentence a busy PM understands, and, when points are missing,
        the single most useful next step (for example who to ask, or what detail is absent).""",
        llm=get_llm(),
        verbose=True,
        allow_delegation=False
    )

def get_audit_agent():
    return Agent(
        role="Audit & Compliance Reviewer",
        goal="Cross-check the final result for contradictions, duplicates, gaps and unrealistic plans before humans rely on it",
        backstory="""You are the last line of defence and the reason every AI result is auditable.
        You read the transcript next to the final tasks, decisions and risks and look for what the earlier agents
        could not see on their own: a task that contradicts a decision, two tasks that overlap, a decision nobody
        owns, a deadline that conflicts with something said in the meeting, or someone assigned work they said
        they could not do. You report only real problems, each with a severity and a fix a PM can act on, and you
        never invent issues to look thorough.""",
        llm=get_llm(),
        verbose=True,
        allow_delegation=False
    )
