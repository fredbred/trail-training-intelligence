"""Module entrypoint for `python -m trail_data_pipeline`."""

from .cli import main


if __name__ == "__main__":
    raise SystemExit(main())
