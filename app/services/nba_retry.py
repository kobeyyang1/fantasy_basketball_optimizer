import time
from typing import Callable, TypeVar

from requests.exceptions import RequestException

T = TypeVar("T")


def run_with_nba_retries(
    fn: Callable[[], T],
    *,
    attempts: int = 5,
    initial_delay_seconds: float = 2.0,
    label: str = "nba_api_call",
) -> T:
    delay = initial_delay_seconds
    last_error: Exception | None = None

    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except (RequestException, ConnectionResetError, TimeoutError, OSError) as e:
            last_error = e
            if attempt == attempts:
                break

            print(
                f"[WARN] {label} failed on attempt {attempt}/{attempts}: "
                f"{type(e).__name__}. Retrying in {delay:.1f}s..."
            )
            time.sleep(delay)
            delay *= 2

    assert last_error is not None
    raise last_error
