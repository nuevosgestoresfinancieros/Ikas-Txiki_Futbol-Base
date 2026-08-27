"""Métricas acotadas y logs JSON sin cuerpos, cookies ni PII."""
from collections import Counter, deque
import json
import logging
import os
import resource
import threading
import time


class JsonFormatter(logging.Formatter):
    def format(self, record):
        data = {"timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%SZ"), "level": record.levelname,
                "logger": record.name, "message": record.getMessage()}
        for key in ("request_id", "method", "path", "status_code", "duration_ms"):
            if getattr(record, key, None) is not None:
                data[key] = getattr(record, key)
        return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def configure_structured_logging():
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper(), handlers=[handler], force=True)


class Metrics:
    def __init__(self):
        self.latencies, self.statuses, self.lock = deque(maxlen=10000), Counter(), threading.Lock()
        self.started, self.cpu_mark = time.monotonic(), (time.monotonic(), time.process_time())

    def record(self, status, duration):
        with self.lock:
            self.statuses[str(status)] += 1
            self.latencies.append(duration)

    def snapshot(self):
        with self.lock:
            values, statuses = sorted(self.latencies), dict(self.statuses)
            now, cpu = time.monotonic(), time.process_time()
            wall, prior_cpu = self.cpu_mark
            self.cpu_mark = (now, cpu)
        percentile = lambda p: round(values[max(0, min(len(values)-1, round((p / 100) * (len(values)-1))))], 2) if values else None
        usage = resource.getrusage(resource.RUSAGE_SELF)
        return {"uptime_seconds": round(now - self.started, 2),
                "process": {"cpu_percent_since_last_scrape": round(100 * (cpu-prior_cpu) / max(now-wall, .001), 2),
                            "rss_peak_bytes": int(usage.ru_maxrss) * (1024 if os.name != "darwin" else 1),
                            "cpu_user_seconds": round(usage.ru_utime, 3), "cpu_system_seconds": round(usage.ru_stime, 3)},
                "host": {"load_1m": os.getloadavg()[0] if hasattr(os, "getloadavg") else None},
                "http": {"requests_by_status": statuses, "latency_ms": {"sample_count": len(values), "p50": percentile(50), "p95": percentile(95), "p99": percentile(99)}}}


class RateLimiter:
    def __init__(self):
        self.windows, self.lock = {}, threading.Lock()

    def allow(self, key, maximum, seconds):
        now = time.monotonic()
        with self.lock:
            window = self.windows.setdefault(key, deque())
            while window and now - window[0] >= seconds:
                window.popleft()
            if len(window) >= maximum:
                return False
            window.append(now)
            return True
