"""Edge-case tests for tools/ebola_early_warning.py.

Each test builds a tiny synthetic per-zone cumulative CSV (same columns as
data/zones_timeseries_full.csv) in a temp file and checks one behaviour the
brief calls out:

  * a correction back to 0 (Alert 1 must not re-fire; logged as a correction);
  * a post-gap lump (Alert 3 must say "can't be assessed");
  * a quiet period that overlaps a gap (Alert 4 must say "can't be assessed"),
    plus a clean resurgence that IS confirmed;
  * a zone missing from a single report (zone-gap detection).

Run:  uv run --python 3.12 python -I tools/test_ebola_early_warning.py
"""
import csv, os, sys, tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ebola_early_warning as ew

COLS = ["sitrep", "report_date", "publication_date", "status", "zone", "province",
        "confirmed_cases", "confirmed_deaths", "population_2024", "zone_cfr_pct", "cases_per_100k"]


def _write(rows):
    """rows: (sitrep, date, zone, province, cases, deaths) -> temp csv path, and a cfg pointing at it."""
    fd, path = tempfile.mkstemp(suffix=".csv")
    os.close(fd)
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(COLS)
        for sr, d, z, p, c, dd in rows:
            w.writerow([sr, d, d, "final", z, p, c, dd, "", "", ""])
    cfg = dict(ew.CONFIG)
    cfg["source_csv"] = path
    return path, cfg


def _daterange(start, n):
    import datetime as dt
    d0 = dt.date.fromisoformat(start)
    return [(d0 + dt.timedelta(days=i)).isoformat() for i in range(n)]


def test_correction_to_zero():
    # Zone X: first case (A1 fires), correction back to 0, then rises again.
    rows = [("001", "2026-05-01", "X", "Ituri", 2, 0),
            ("002", "2026-05-02", "X", "Ituri", 0, 0),   # correction 2 -> 0
            ("003", "2026-05-03", "X", "Ituri", 3, 0)]   # rises again
    path, cfg = _write(rows)
    try:
        data, alerts = ew.run(cfg, tempfile.mkdtemp(), want_excel=False)
        a1 = [a for a in alerts["A1"] if a["zone"] == "X"]
        assert len(a1) == 1, "Alert 1 must fire exactly once per zone"
        assert a1[0]["date"] == "2026-05-01"
        assert "returned to 0" in a1[0]["note"], "the re-rise must be a data-quality note, not a 2nd fire"
        corr = [c for c in data["corrections"] if c["zone"] == "X" and c["field"] == "confirmed_cases"]
        assert corr and corr[0]["from"] == 2 and corr[0]["to"] == 0, "the drop must be logged as a correction"
    finally:
        os.remove(path)
    print("PASS test_correction_to_zero")


def test_post_gap_lump():
    # Small daily rises (7-day sum < 25), a 10-day gap, then a lump of +40.
    ds = _daterange("2026-05-01", 5)
    rows = [("0%02d" % (i + 1), d, "Y", "Ituri", (i + 1) * 2, 0) for i, d in enumerate(ds)]  # cum 2..10
    rows.append(("020", "2026-05-20", "Y", "Ituri", 50, 0))  # +40 after a 10-day gap
    path, cfg = _write(rows)
    try:
        data, alerts = ew.run(cfg, tempfile.mkdtemp(), want_excel=False)
        fire = [a for a in alerts["A3"] if a["zone"] == "Y" and a["date"] == "2026-05-20"]
        assert fire, "Alert 3 should register the post-gap crossing"
        assert fire[0]["status"] == "Can't be assessed", "a rise that is only a post-gap lump can't be assessed"
        # and nothing fired before the gap (7-day sums stayed under 25)
        assert not [a for a in alerts["A3"] if a["zone"] == "Y" and a["date"] in ds]
    finally:
        os.remove(path)
    print("PASS test_post_gap_lump")


def test_quiet_overlaps_gap_vs_clean():
    # Z1: increase, 20-day gap, then an increase 50 quiet days later -> can't assess.
    rows = [("001", "2026-01-01", "Z1", "Ituri", 1, 0),
            ("002", "2026-01-05", "Z1", "Ituri", 1, 0),
            ("020", "2026-02-20", "Z1", "Ituri", 2, 0)]   # quiet 50d, span covers a 46-day gap
    path, cfg = _write(rows)
    try:
        _, alerts = ew.run(cfg, tempfile.mkdtemp(), want_excel=False)
        a = [x for x in alerts["A4"] if x["zone"] == "Z1"]
        assert a and a[0]["status"] == "Can't be assessed", "quiet span over a long gap can't be assessed"
        assert "reporting gap" in a[0]["note"]
    finally:
        os.remove(path)

    # Z2: daily reporting (no gaps), stays 1 for 50 days, +1, then persists 7 days -> Confirmed.
    ds = _daterange("2026-03-01", 60)
    rows = []
    for i, d in enumerate(ds):
        c = 1 if i < 50 else 2
        rows.append(("1%03d" % i, d, "Z2", "Ituri", c, 0))
    path, cfg = _write(rows)
    try:
        _, alerts = ew.run(cfg, tempfile.mkdtemp(), want_excel=False)
        a = [x for x in alerts["A4"] if x["zone"] == "Z2"]
        assert a and a[0]["quiet_days"] == 50 and a[0]["status"] == "Confirmed", \
            "a clean 50-day quiet then a lasting new case is a confirmed resurgence"
    finally:
        os.remove(path)
    print("PASS test_quiet_overlaps_gap_vs_clean")


def test_zone_missing_single_report():
    # A reports d1,d2,d3; B reports d1 and d3 but not d2 -> B has a zone gap on d2.
    rows = [("001", "2026-06-01", "A", "Ituri", 1, 0),
            ("002", "2026-06-02", "A", "Ituri", 2, 0),
            ("003", "2026-06-03", "A", "Ituri", 3, 0),
            ("001", "2026-06-01", "B", "Ituri", 1, 0),
            ("003", "2026-06-03", "B", "Ituri", 2, 0)]
    path, cfg = _write(rows)
    try:
        data, _ = ew.run(cfg, tempfile.mkdtemp(), want_excel=False)
        zg = [g for g in data["zone_gaps"] if g["zone"] == "B"]
        assert zg and zg[0]["date"] == "2026-06-02", "B missing from the d2 report is a zone gap"
        # d2 is NOT a global gap (A reported), so there should be no global gap row.
        assert not data["global_gaps"], "d2 is a zone gap, not a global gap"
    finally:
        os.remove(path)
    print("PASS test_zone_missing_single_report")


if __name__ == "__main__":
    test_correction_to_zero()
    test_post_gap_lump()
    test_quiet_overlaps_gap_vs_clean()
    test_zone_missing_single_report()
    print("\nAll tests passed.")
