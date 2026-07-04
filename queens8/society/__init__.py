"""queens8 agent society — blackboard gap loop over the shared brain."""
from __future__ import annotations

from queens8.society.blackboard import Gap, GapStatus
from queens8.society.loop import SocietyResult, run_society

__all__ = ["Gap", "GapStatus", "SocietyResult", "run_society"]
