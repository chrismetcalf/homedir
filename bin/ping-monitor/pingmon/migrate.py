"""
Migration utility for ping-monitor

Migrates data from v1.x bash version to v2.0 Python version.
"""

import sys
import logging
import argparse
import shutil
from datetime import datetime
from pathlib import Path

from .config import Config
from .database import Database

logger = logging.getLogger(__name__)


def backup_database(db_path: Path) -> Path:
    """
    Create a backup of the database

    Args:
        db_path: Path to database

    Returns:
        Path to backup file
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = db_path.parent / f"{db_path.name}.backup-{timestamp}"

    logger.info(f"Creating backup: {backup_path}")
    shutil.copy2(db_path, backup_path)
    logger.info(f"Backup created successfully")

    return backup_path


def check_legacy_table(db: Database) -> bool:
    """Check if log_v1 table exists"""
    cursor = db.conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='log_v1'"
    )
    return cursor.fetchone() is not None


def count_records(db: Database, table: str) -> int:
    """Count records in a table"""
    cursor = db.conn.execute(f"SELECT COUNT(*) FROM {table}")
    return cursor.fetchone()[0]


def migrate_legacy_data(db: Database, target_id: int, batch_size: int = 100000) -> int:
    """
    Migrate data from log_v1 to new log table

    Args:
        db: Database instance
        target_id: Target ID to assign all legacy records to
        batch_size: Number of records to migrate per batch

    Returns:
        Number of records migrated
    """
    total_records = count_records(db, 'log_v1')
    logger.info(f"Found {total_records:,} records in log_v1 table")

    if total_records == 0:
        logger.warning("No records to migrate")
        return 0

    logger.info(f"Migrating in batches of {batch_size:,} records...")

    migrated = 0
    offset = 0

    while True:
        # Migrate batch
        cursor = db.conn.execute(
            f"""
            INSERT INTO log (timestamp, target_id, location_id, status, ping_ms)
            SELECT timestamp, ?, NULL, status, ping_ms
            FROM log_v1
            ORDER BY timestamp
            LIMIT ? OFFSET ?
            """,
            (target_id, batch_size, offset)
        )

        batch_count = cursor.rowcount
        if batch_count == 0:
            break

        migrated += batch_count
        offset += batch_size

        progress = (migrated / total_records) * 100
        logger.info(f"Migrated {migrated:,}/{total_records:,} records ({progress:.1f}%)")

    return migrated


def validate_migration(db: Database) -> bool:
    """
    Validate migration by comparing record counts

    Args:
        db: Database instance

    Returns:
        True if validation passed
    """
    logger.info("Validating migration...")

    old_count = count_records(db, 'log_v1')
    new_count = count_records(db, 'log')

    # New count should be at least old count (may have new records)
    if new_count < old_count:
        logger.error(f"Validation FAILED: log has {new_count:,} records but log_v1 has {old_count:,}")
        return False

    logger.info(f"Validation PASSED: {new_count:,} records in new log table")
    return True


def main():
    """Main entry point for migration utility"""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )

    parser = argparse.ArgumentParser(description='Migrate legacy ping-monitor data')
    parser.add_argument('--backup', action='store_true', help='Create backup before migration')
    parser.add_argument('--no-validate', action='store_true', help='Skip validation')
    parser.add_argument('--keep-old', action='store_true', help='Keep log_v1 table after migration')
    parser.add_argument('--batch-size', type=int, default=100000, help='Batch size for migration')
    args = parser.parse_args()

    try:
        # Load config
        config = Config.load()
        db_path = config.general.database_path

        if not db_path.exists():
            logger.error(f"Database not found: {db_path}")
            return 1

        # Create backup if requested
        if args.backup:
            backup_path = backup_database(db_path)
            logger.info(f"Backup saved to: {backup_path}")

        # Open database
        db = Database(db_path)

        # Check if log_v1 exists
        if not check_legacy_table(db):
            logger.error("No log_v1 table found. Nothing to migrate.")
            logger.info("The database may already be migrated, or no legacy data exists.")
            return 1

        logger.info("=" * 60)
        logger.info("Ping Monitor Migration Tool v2.0")
        logger.info("=" * 60)

        # Get default target ID
        target_id = db.get_target_id("default")
        if not target_id:
            logger.error("Default target not found. Please run the daemon first.")
            return 1

        logger.info(f"Migrating legacy data to target: default (ID={target_id})")

        # Migrate data
        migrated = migrate_legacy_data(db, target_id, batch_size=args.batch_size)

        if migrated == 0:
            logger.warning("No records were migrated")
            return 1

        logger.info(f"Successfully migrated {migrated:,} records")

        # Validate
        if not args.no_validate:
            if not validate_migration(db):
                logger.error("Migration validation failed!")
                return 1

        # Clean up old table if requested
        if not args.keep_old:
            logger.info("Removing log_v1 table...")
            db.conn.execute("DROP TABLE log_v1")
            logger.info("log_v1 table removed")
        else:
            logger.info("Keeping log_v1 table (use --keep-old=false to remove)")

        logger.info("=" * 60)
        logger.info("Migration completed successfully!")
        logger.info("=" * 60)

        return 0

    except Exception as e:
        logger.error(f"Migration failed: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
