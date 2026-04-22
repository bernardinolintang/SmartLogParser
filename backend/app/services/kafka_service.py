"""Kafka consumer and producer adapter.

Provides two public functions:
  - consume_and_parse: reads raw log messages from a Kafka topic and runs them
    through the existing parse_file() pipeline.
  - produce_events: publishes a list of normalized event dicts to a Kafka topic.

Both functions fail gracefully when no broker is reachable — they return a
structured dict with status="kafka_unavailable" rather than raising.
"""
from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

_CONNECT_TIMEOUT_MS = 5_000


def _make_consumer(topic: str, bootstrap_servers: str):
    from kafka import KafkaConsumer  # type: ignore
    from kafka.errors import NoBrokersAvailable  # type: ignore

    return KafkaConsumer(
        topic,
        bootstrap_servers=bootstrap_servers,
        auto_offset_reset="earliest",
        consumer_timeout_ms=3_000,
        value_deserializer=lambda m: m.decode("utf-8", errors="replace"),
        request_timeout_ms=_CONNECT_TIMEOUT_MS,
    )


def _make_producer(bootstrap_servers: str):
    from kafka import KafkaProducer  # type: ignore

    return KafkaProducer(
        bootstrap_servers=bootstrap_servers,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        request_timeout_ms=_CONNECT_TIMEOUT_MS,
    )


def consume_and_parse(
    topic: str,
    bootstrap_servers: str,
    db: Any,
    max_messages: int = 100,
) -> dict:
    """Consume up to max_messages from a Kafka topic and parse each one.

    Each message value is treated as a raw log string and passed through
    parse_file(). Returns a summary dict.
    """
    try:
        from kafka.errors import NoBrokersAvailable, KafkaError  # type: ignore
        from app.services.parser_service import parse_file

        consumer = _make_consumer(topic, bootstrap_servers)
        consumed = 0
        parsed = 0
        failed = 0
        run_ids: list[str] = []

        try:
            for msg in consumer:
                if consumed >= max_messages:
                    break
                consumed += 1
                raw_log: str = msg.value or ""
                if not raw_log.strip():
                    continue
                try:
                    result = parse_file(raw_log, f"kafka_{topic}_{consumed}.log", db)
                    run_ids.append(result.get("run_id", ""))
                    parsed += 1
                except Exception as parse_err:
                    logger.warning("Kafka parse error on message %d: %s", consumed, parse_err)
                    failed += 1
        finally:
            consumer.close()

        return {
            "status": "ok",
            "topic": topic,
            "bootstrap_servers": bootstrap_servers,
            "consumed": consumed,
            "parsed": parsed,
            "failed": failed,
            "run_ids": run_ids,
        }

    except ImportError:
        return {
            "status": "kafka_unavailable",
            "reason": "kafka-python not installed",
            "topic": topic,
        }
    except Exception as exc:
        # NoBrokersAvailable, KafkaError, timeout — all gracefully handled
        logger.warning("Kafka consume failed (%s): %s", type(exc).__name__, exc)
        return {
            "status": "kafka_unavailable",
            "reason": str(exc),
            "topic": topic,
            "bootstrap_servers": bootstrap_servers,
        }


def produce_events(
    events: list[dict],
    topic: str,
    bootstrap_servers: str,
) -> dict:
    """Publish normalized event dicts to a Kafka topic as JSON messages."""
    try:
        producer = _make_producer(bootstrap_servers)
        published = 0
        failed = 0

        try:
            for event in events:
                try:
                    producer.send(topic, value=event)
                    published += 1
                except Exception as send_err:
                    logger.warning("Kafka produce error: %s", send_err)
                    failed += 1
            producer.flush(timeout=5)
        finally:
            producer.close(timeout=5)

        return {
            "status": "ok",
            "topic": topic,
            "published": published,
            "failed": failed,
        }

    except ImportError:
        return {
            "status": "kafka_unavailable",
            "reason": "kafka-python not installed",
            "topic": topic,
        }
    except Exception as exc:
        logger.warning("Kafka produce failed (%s): %s", type(exc).__name__, exc)
        return {
            "status": "kafka_unavailable",
            "reason": str(exc),
            "topic": topic,
        }


def check_broker(bootstrap_servers: str) -> dict:
    """Test broker reachability without consuming any messages."""
    try:
        from kafka import KafkaAdminClient  # type: ignore
        client = KafkaAdminClient(
            bootstrap_servers=bootstrap_servers,
            request_timeout_ms=_CONNECT_TIMEOUT_MS,
        )
        topics = client.list_topics()
        client.close()
        return {"status": "connected", "bootstrap_servers": bootstrap_servers, "topics": topics}
    except ImportError:
        return {"status": "kafka_unavailable", "reason": "kafka-python not installed"}
    except Exception as exc:
        return {
            "status": "kafka_unavailable",
            "reason": str(exc),
            "bootstrap_servers": bootstrap_servers,
        }
