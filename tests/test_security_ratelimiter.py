"""ME-050 (security cascade C3, pre-existing): RateLimiter one-shot-key
eviction.

The leak: ``acquire`` did ``setdefault(key, deque())`` but nothing ever
deleted an emptied entry, so ``_events`` grew linearly with the number of
unique keys — for the per-IP limiters that is unique client IPs, i.e.
unbounded on a public bind. The fix sweeps fully-expired keys at most
once per window inside ``acquire``; sliding-window semantics must not
move (that is the regression pin below). Deterministic: the clock is a
monkeypatched ``server.security.time`` — no real sleeps.
"""

from __future__ import annotations

import types

import server.security as security
from server.security import RateLimiter


class FakeClock:
    """Replaces server.security.time (auto-restored by monkeypatch) —
    monotonic() under direct test control."""

    def __init__(self, monkeypatch, start: float = 1000.0) -> None:
        self.now = start
        monkeypatch.setattr(
            security, "time", types.SimpleNamespace(monotonic=lambda: self.now))

    def advance(self, seconds: float) -> None:
        self.now += seconds


def test_one_shot_keys_are_evicted_after_window(monkeypatch):
    """The ME-050 acceptance: N keys acquired once, window passes, one
    more acquire triggers the sweep — no emptied slots stay behind."""
    clock = FakeClock(monkeypatch)
    rl = RateLimiter(limit=5, window=60.0)
    for i in range(100):
        assert rl.acquire(f"ip-{i}") is True
    assert len(rl._events) == 100  # all live: nothing expired yet

    clock.advance(61.0)  # past the window: every ip-* event is expired
    assert rl.acquire("ip-next") is True  # trips the once-per-window sweep
    assert len(rl._events) == 1, \
        "one-shot keys must not occupy _events after their window"
    assert "ip-0" not in rl._events
    assert "ip-99" not in rl._events


def test_active_keys_survive_the_sweep(monkeypatch):
    """Eviction removes only FULLY expired keys: a key whose NEWEST event
    is in-window keeps its deque (and its slot count) across a sweep."""
    clock = FakeClock(monkeypatch)
    rl = RateLimiter(limit=2, window=60.0)
    assert rl.acquire("hot") is True          # t0: first acquire sweeps
    clock.advance(30.0)
    assert rl.acquire("hot") is True          # t0+30: hot's newest event
    assert rl.acquire("stranger-1") is True   # t0+30: no sweep yet
    clock.advance(31.0)                       # t0+61: sweep runs
    assert rl.acquire("stranger-2") is True
    assert "hot" in rl._events, "an in-window key must survive the sweep"
    assert rl.acquire("hot") is True   # the t0 event slid out → slot free
    assert rl.acquire("hot") is False  # limit intact — sweep did not reset


def test_sliding_window_semantics_unchanged(monkeypatch):
    """Regression pin (ME-050 'do not change the window semantics'):
    limit N passes, N+1 blocks, retry_after > 0 while blocked, and the
    counter frees up only after the window passes."""
    clock = FakeClock(monkeypatch)
    rl = RateLimiter(limit=3, window=60.0)
    assert [rl.acquire("u") for _ in range(3)] == [True, True, True]
    assert rl.acquire("u") is False
    assert rl.retry_after("u") >= 1
    clock.advance(61.0)
    assert rl.acquire("u") is True  # window slid: slots are free again


def test_blocked_key_state_survives_other_keys_traffic(monkeypatch):
    """A blocked key's fresh events must not be reset by sweeps caused
    by OTHER keys' traffic within the same window."""
    clock = FakeClock(monkeypatch)
    rl = RateLimiter(limit=1, window=60.0)
    assert rl.acquire("flooded") is True
    clock.advance(10.0)
    for i in range(20):  # other-key traffic; 10s < window → no sweep
        assert rl.acquire(f"other-{i}") is True
    assert rl.acquire("flooded") is False  # still blocked, deque intact
    assert "flooded" in rl._events


def test_sweep_drops_only_empty_or_expired(monkeypatch):
    """White-box pin on the staleness predicate: a key stays iff its
    NEWEST event is inside the window (empty deques go too)."""
    clock = FakeClock(monkeypatch)
    rl = RateLimiter(limit=10, window=60.0)
    rl.acquire("gone")       # t0
    clock.advance(59.0)
    rl.acquire("stays")      # t0+59: newest event in window
    clock.advance(2.0)       # t0+61: "gone" expired (61 > 60), "stays" not
    rl._sweep(clock.now)
    assert "gone" not in rl._events
    assert "stays" in rl._events
