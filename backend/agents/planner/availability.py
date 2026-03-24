"""Build a per-user availability matrix.

The matrix is a list of available time slots for N days.
Each slot is a (date, start_hour, end_hour) tuple.

This is PURE PYTHON — no LLM.
"""

from datetime import datetime, timedelta, date, time, timezone
from typing import Any

from shared.models.user import UserProfile
from shared.models.constraint import ConstraintType


# Slot granularity: 30-minute increments
SLOT_MINUTES = 30


def _is_slot_in_recurring_window(slot_date: date, slot_hour: int, days_of_week: list[int], start_hour: int, end_hour: int) -> bool:
    if start_hour < end_hour:
        return slot_date.weekday() in days_of_week and start_hour <= slot_hour < end_hour
    else:
        # Overnight window
        is_start_evening = slot_date.weekday() in days_of_week and slot_hour >= start_hour
        prev_day = slot_date - timedelta(days=1)
        is_next_morning = prev_day.weekday() in days_of_week and slot_hour < end_hour
        return is_start_evening or is_next_morning


class TimeSlot:
    """A 30-minute slot on a specific date."""

    def __init__(self, dt: date, hour: int, minute: int):
        self.date = dt
        self.hour = hour
        self.minute = minute
        self.available = True

    @property
    def start_datetime(self) -> datetime:
        return datetime.combine(self.date, time(self.hour, self.minute))

    def __repr__(self) -> str:
        return f"Slot({self.date} {self.hour:02d}:{self.minute:02d} {'✓' if self.available else '✗'})"


class AvailabilityMatrix:
    """Grid of 30-min slots over N days."""

    def __init__(self, start_date: date, days: int):
        self.start_date = start_date
        self.days = days
        self.slots: list[TimeSlot] = []
        self._build_empty()

    def _build_empty(self):
        for d in range(self.days):
            dt = self.start_date + timedelta(days=d)
            for hour in range(24):
                for minute in (0, 30):
                    self.slots.append(TimeSlot(dt, hour, minute))

    def block_range(self, dt: date, start_hour: int, end_hour: int):
        """Mark slots as unavailable (integer-hour granularity)."""
        for slot in self.slots:
            if slot.date == dt and start_hour <= slot.hour < end_hour:
                slot.available = False

    def block_slot_range(self, dt: date, start_hour: int, start_min: int, duration_min: int):
        """Mark slots as unavailable with minute-precise start and duration.

        Unlike block_range, this respects :30 starts so a block at 9:30 does not
        accidentally block the 9:00 slot.
        """
        start_total = start_hour * 60 + start_min
        end_total = start_total + duration_min
        for slot in self.slots:
            if slot.date != dt:
                continue
            slot_total = slot.hour * 60 + slot.minute
            if start_total <= slot_total < end_total:
                slot.available = False

    def block_recurring(self, days_of_week: list[int], start_hour: int, end_hour: int):
        """Block recurring slots (e.g., Mon/Wed 9-10)."""
        for slot in self.slots:
            if _is_slot_in_recurring_window(slot.date, slot.hour, days_of_week, start_hour, end_hour):
                slot.available = False

    def temporarily_block_recurring(
        self, days_of_week: list[int], start_hour: int, end_hour: int
    ) -> list[TimeSlot]:
        """Block recurring slots and return the ones that were newly blocked (for undo)."""
        newly_blocked: list[TimeSlot] = []
        for slot in self.slots:
            if slot.available and _is_slot_in_recurring_window(slot.date, slot.hour, days_of_week, start_hour, end_hour):
                slot.available = False
                newly_blocked.append(slot)
        return newly_blocked

    @staticmethod
    def restore_slots(slots: list["TimeSlot"]):
        """Undo a temporary block by re-enabling the given slots."""
        for slot in slots:
            slot.available = True

    def get_available_slots(self, dt: date | None = None) -> list[TimeSlot]:
        if dt:
            return [s for s in self.slots if s.date == dt and s.available]
        return [s for s in self.slots if s.available]

    def get_contiguous_blocks(self, min_slots: int = 2) -> list[list[TimeSlot]]:
        """Find contiguous available blocks of at least min_slots (default 1h)."""
        blocks: list[list[TimeSlot]] = []
        current: list[TimeSlot] = []

        for slot in self.slots:
            if slot.available:
                if current and (
                    slot.date != current[-1].date
                    or (slot.hour * 60 + slot.minute) - (current[-1].hour * 60 + current[-1].minute) > SLOT_MINUTES
                ):
                    if len(current) >= min_slots:
                        blocks.append(current)
                    current = []
                current.append(slot)
            else:
                if len(current) >= min_slots:
                    blocks.append(current)
                current = []

        if len(current) >= min_slots:
            blocks.append(current)

        return blocks


def build_availability_matrix(
    user: UserProfile,
    constraints: list[dict[str, Any]],
    window_days: int = 7,
) -> AvailabilityMatrix:
    """Build the availability matrix for a user."""
    today = datetime.now(timezone.utc).date()
    matrix = AvailabilityMatrix(today, window_days)

    # Block sleep window
    if user.sleep_window:
        sw = user.sleep_window
        matrix.block_recurring(sw.days, sw.start_hour, sw.end_hour)
    else:
        # Default: 11 PM - 7 AM
        matrix.block_recurring(list(range(7)), 23, 24)
        matrix.block_recurring(list(range(7)), 0, 7)

    # Block time constraints
    for c in constraints:
        c_type = c.get("type", "")

        if c_type == ConstraintType.FIXED:
            # One-time fixed block with minute precision.
            start = c.get("start_time")
            end = c.get("end_time")
            if start and end:
                if isinstance(start, str):
                    start = datetime.fromisoformat(start.replace("Z", "+00:00"))
                    if start.tzinfo is None:
                        start = start.replace(tzinfo=timezone.utc)
                if isinstance(end, str):
                    end = datetime.fromisoformat(end.replace("Z", "+00:00"))
                    if end.tzinfo is None:
                        end = end.replace(tzinfo=timezone.utc)
                if isinstance(start, datetime) and isinstance(end, datetime):
                    duration_min = int((end - start).total_seconds() // 60)
                    if duration_min > 0:
                        matrix.block_slot_range(
                            start.date(),
                            start.hour,
                            start.minute,
                            duration_min,
                        )

        elif c_type == ConstraintType.RECURRING:
            # Recurring block
            days = c.get("recurring_days", [])
            r_start = c.get("recurring_start")
            r_end = c.get("recurring_end")
            if days and r_start and r_end:
                start_h = r_start if isinstance(r_start, int) else r_start.hour
                end_h = r_end if isinstance(r_end, int) else r_end.hour
                matrix.block_recurring(days, start_h, end_h)

    # Respect preferred study windows from user settings.
    # If windows are provided, only those windows are schedulable.
    if user.preferred_time_windows:
        for slot in matrix.slots:
            in_preferred = False
            for window in user.preferred_time_windows:
                if _is_slot_in_recurring_window(slot.date, slot.hour, window.days, window.start_hour, window.end_hour):
                    in_preferred = True
                    break
            slot._preferred = in_preferred  # type: ignore
            if slot.available and not in_preferred:
                slot.available = False
    else:
        for slot in matrix.slots:
            slot._preferred = True  # type: ignore

    return matrix
