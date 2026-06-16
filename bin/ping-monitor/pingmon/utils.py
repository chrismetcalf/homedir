"""
Utility functions for ping-monitor

Common helpers for SQL queries, formatting, etc.
"""

from typing import Tuple, Optional


def build_target_filter(target_id: Optional[int]) -> Tuple[str, tuple]:
    """
    Build SQL WHERE clause and parameters for optional target filtering

    Args:
        target_id: Optional target ID to filter by (from db.get_target_id())

    Returns:
        Tuple of (where_clause, params) for use in SQL queries

    Example:
        where_clause, params = build_target_filter(target_id)
        query = f"SELECT * FROM log WHERE timestamp > ? {where_clause}"
        cursor.execute(query, (cutoff,) + params)
    """
    if target_id:
        return "AND target_id = ?", (target_id,)
    else:
        return "", ()


def build_target_filter_aliased(target_id: Optional[int], alias: str = "l") -> Tuple[str, tuple]:
    """
    Build SQL WHERE clause and parameters for optional target filtering with table alias

    Args:
        target_id: Optional target ID to filter by
        alias: Table alias (default: "l")

    Returns:
        Tuple of (where_clause, params) for use in SQL queries

    Example:
        where_clause, params = build_target_filter_aliased(target_id, "l")
        query = f"SELECT * FROM log l WHERE l.timestamp > ? {where_clause}"
        cursor.execute(query, (cutoff,) + params)
    """
    if target_id:
        return f"AND {alias}.target_id = ?", (target_id,)
    else:
        return "", ()
