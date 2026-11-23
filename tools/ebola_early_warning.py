"""Ebola early-warning alert system for the DRC Bundibugyo (BVD) outbreak.

Reads the per-zone cumulative time series the dashboard already maintains
(``data/zones_timeseries_full.csv``) and raises four alerts:

  1. First confirmed case in a new HEALTH ZONE.
  2. First confirmed case in a new PROVINCE.
  3. A rise in confirmed cases beyond a threshold (7-day rolling, by zone/province).
  4. Cases return in a previously affected zone after >= 42 quiet days.

It never modifies the raw data. Cleaned data and all outputs are written to a
separate folder (default ``early_warning/``).

Run
---
    uv run --with openpyxl --python 3.12 python -I tools/ebola_early_warning.py
    uv run --with openpyxl --python 3.12 python -I tools/ebola_early_warning.py --scan
    uv run --python 3.12 python -I tools/ebola_early_warning.py --no-excel   # CSV only, no deps

Options
-------
    --source PATH          per-zone cumulative CSV (default data/zones_timeseries_full.csv)
    --outdir DIR           output folder (default early_warning)
    --config PATH          JSON file overriding any key in CONFIG below
    --zone-threshold N     Alert 3 active zone threshold (7-day new cases)
    --province-threshold N Alert 3 active province threshold (7-day new cases)
    --scan                 print how many Alert-3 episodes each candidate threshold produces
    --no-excel             skip the .xlsx (write the CSVs only; no openpyxl needed)

The inputs this reads are REPORT dates, and only CONFIRMED cases (the source has
no probable-case column). See the README section and the caveats printed at the end.
"""
import argparse, csv, datetime as dt, json, os, unicodedata
from collections import defaultdict

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------
# Parameters. Every tunable the brief asks to keep configurable lives here and
# can be overridden with --config <json> or the matching CLI flags.
# ---------------------------------------------------------------------------
CONFIG = {
    "source_csv": "data/zones_timeseries_full.csv",
    "outdir": "early_warning",

    # Step 1.1 — pseudo-zones to drop entirely (matched case/accent-insensitively).
    "excluded_zones": ["A ventiler"],

    # Alert 3 — rolling window and thresholds (absolute NEW cases in the window).
    "alert3_window_days": 7,
    "alert3_zone_threshold": 25,
    "alert3_zone_threshold_candidates": [10, 25, 50],
    "alert3_province_threshold": 50,
    "alert3_province_threshold_candidates": [25, 50, 100],

    # Alert 4 — official end-of-outbreak quiet period and the confirmation window.
    "alert4_quiet_days": 42,
    "alert4_confirm_days": 7,

    # A reporting gap longer than this (calendar days with no report in between)
    # makes an Alert-3 window or an Alert-4 quiet span "can't be assessed".
    "max_assessable_gap_days": 7,

    # A report whose interval since the previous report is >= this many days is
    # "post-gap": the cases it carries are a lump of the whole missing period, so
    # an alert dated on it is flagged "date uncertain".
    "post_gap_min_interval_days": 2,
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _ascii(s):
    """Lower-case, accent-stripped form for robust name matching."""
    return "".join(c for c in unicodedata.normalize("NFKD", s or "")
                   if not unicodedata.combining(c)).strip().lower()


def canon_province(p):
    """Canonicalise province spellings (e.g. 'Haut-Uele' -> 'Haut-Uélé')."""
    return (p or "").strip().replace("Uele", "Uélé")


def _int(x):
    x = (x or "").strip()
    if x.lstrip("-").isdigit():
        return int(x)
    return None


def _d(s):
    return dt.date.fromisoformat(s)


# ---------------------------------------------------------------------------
# Step 1 — load and clean (in code; the raw file is never touched)
# ---------------------------------------------------------------------------
def load_clean(cfg):
    """Return (observations, report_dates, step_gap, global_gaps, zone_gaps, corrections).

    observations: dict[zone] -> list of per-report dicts sorted by date, carrying
      derived NEW cases/deaths, the post-gap flag and a correction flag.
    """
    path = os.path.join(REPO, cfg["source_csv"])
    excluded = {_ascii(z) for z in cfg["excluded_zones"]}
    raw = list(csv.DictReader(open(path, newline="", encoding="utf-8")))

    # Keep one row per (zone, report_date); exclude the pseudo-zones.
    recs = []
    zone_prov = {}
    for r in raw:
        zone = (r["zone"] or "").strip()
        if _ascii(zone) in excluded:
            continue
        prov = canon_province(r["province"])
        recs.append({
            "sitrep": r["sitrep"], "date": r["report_date"], "zone": zone,
            "province": prov, "cum_cases": _int(r["confirmed_cases"]),
            "cum_deaths": _int(r["confirmed_deaths"]),
        })
        zone_prov[zone] = prov

    # Global reporting calendar + per-report step gap and post-gap flag (Step 1.4/1.5).
    report_dates = sorted({x["date"] for x in recs})
    step_gap = {}
    post_gap = {}
    prev = None
    for d in report_dates:
        g = (_d(d) - prev).days if prev else 0
        step_gap[d] = g
        post_gap[d] = bool(prev) and g >= cfg["post_gap_min_interval_days"]
        prev = _d(d)

    # Global gaps: calendar dates between first and last report with no rows at all,
    # grouped into runs so each gap episode carries a length.
    d0, d1 = _d(report_dates[0]), _d(report_dates[-1])
    have = set(report_dates)
    missing = [(d0 + dt.timedelta(days=i)).isoformat()
               for i in range((d1 - d0).days + 1)
               if (d0 + dt.timedelta(days=i)).isoformat() not in have]
    global_gaps = []  # (start_missing, end_missing, missing_days, span_days, after_report, next_report)
    run = []
    for d in missing + [None]:
        if run and (d is None or _d(d) != _d(run[-1]) + dt.timedelta(days=1)):
            start, end = run[0], run[-1]
            after = max(x for x in report_dates if _d(x) < _d(start))
            nxt = min(x for x in report_dates if _d(x) > _d(end))
            global_gaps.append({
                "start_missing": start, "end_missing": end,
                "missing_days": (_d(end) - _d(start)).days + 1,
                "span_days": (_d(nxt) - _d(after)).days,
                "after_report": after, "next_report": nxt,
            })
            run = []
        if d is not None:
            run.append(d)

    # Per-zone series with derived NEW counts and corrections (Step 1.2/1.3).
    by_zone = defaultdict(list)
    for x in recs:
        by_zone[x["zone"]].append(x)
    corrections = []
    observations = {}
    for zone, rows in by_zone.items():
        rows.sort(key=lambda r: (r["date"], int(r["sitrep"])))
        prev_c = prev_d = None
        out = []
        for r in rows:
            c, d_ = r["cum_cases"], r["cum_deaths"]
            new_c = is_corr = None
            if c is not None:
                if prev_c is None:
                    new_c = c                      # first appearance: the lump is the new cases
                elif c < prev_c:                   # Step 1.3 — a correction, never a decline
                    is_corr = True
                    new_c = 0
                    corrections.append({"zone": zone, "province": r["province"],
                                        "date": r["date"], "sitrep": r["sitrep"],
                                        "field": "confirmed_cases", "from": prev_c, "to": c})
                else:
                    new_c = c - prev_c
            new_d = None
            if d_ is not None and prev_d is not None:
                new_d = max(0, d_ - prev_d)
                if d_ < prev_d:
                    corrections.append({"zone": zone, "province": r["province"],
                                        "date": r["date"], "sitrep": r["sitrep"],
                                        "field": "confirmed_deaths", "from": prev_d, "to": d_})
            elif d_ is not None and prev_d is None:
                new_d = d_
            out.append({**r, "new_cases": new_c, "new_deaths": new_d,
                        "is_correction": bool(is_corr),
                        "post_gap": post_gap[r["date"]], "step_gap": step_gap[r["date"]]})
            if c is not None:
                prev_c = c
            if d_ is not None:
                prev_d = d_
        observations[zone] = out

    # Zone gaps: a report date between a zone's first and last appearance where the
    # zone has no row but others reported (Step 1.4). (Structurally rare here.)
    zone_gaps = []
    for zone, out in observations.items():
        seen = {o["date"] for o in out}
        lo, hi = _d(out[0]["date"]), _d(out[-1]["date"])
        for d in report_dates:
            if lo < _d(d) < hi and d not in seen:
                zone_gaps.append({"zone": zone, "province": zone_prov[zone], "date": d})

    return {
        "observations": observations, "zone_prov": zone_prov,
        "report_dates": report_dates, "step_gap": step_gap, "post_gap": post_gap,
        "global_gaps": global_gaps, "zone_gaps": zone_gaps, "corrections": corrections,
    }


# ---------------------------------------------------------------------------
# Window / gap utilities
# ---------------------------------------------------------------------------
def rolling_new(series, end_date, window_days):
    """Sum of NEW cases on reports whose date is in (end-window+1 .. end], and
    the part of that sum that landed on a report following a long gap."""
    lo = _d(end_date) - dt.timedelta(days=window_days - 1)
    total = lump = 0
    for o in series:
        od = _d(o["date"])
        if lo <= od <= _d(end_date) and o["new_cases"]:
            total += o["new_cases"]
    return total, lump


def gap_in_span(global_gaps, start_date, end_date, max_gap):
    """Is there a global reporting gap longer than max_gap overlapping [start,end]?"""
    s, e = _d(start_date), _d(end_date)
    for g in global_gaps:
        if g["span_days"] > max_gap and not (_d(g["next_report"]) <= s or _d(g["after_report"]) >= e):
            return g
    return None


# ---------------------------------------------------------------------------
# Step 2 — the four alerts
# ---------------------------------------------------------------------------
def alert1_new_zone(data, cfg):
    out = []
    for zone, series in data["observations"].items():
        fired = False
        returned_to_zero = False
        was_positive = False
        for o in series:
            c = o["cum_cases"]
            if c is None:
                continue
            if c > 0 and not fired:
                out.append({
                    "alert": "A1 new zone", "date": o["date"], "province": o["province"],
                    "zone": zone, "new_cases": o["new_cases"], "quiet_days": "",
                    "post_gap": "Y" if o["post_gap"] else "N",
                    "reversed": "N",
                    "status": "Confirmed",
                    "date_uncertain": o["post_gap"],
                    "note": ("date uncertain: first case fell somewhere in the %d-day gap"
                             % o["step_gap"]) if o["post_gap"] else "",
                })
                fired = True
                was_positive = True
            elif fired and was_positive and c == 0:
                returned_to_zero = True
            elif fired and returned_to_zero and c > 0:
                # Step A1 — do NOT fire again; record a data-quality note on the first fire.
                out[-1]["note"] = ((out[-1]["note"] + "; ") if out[-1]["note"] else "") + \
                    ("data-quality: zone returned to 0 and rose again on %s (not re-fired)" % o["date"])
                returned_to_zero = False
    out.sort(key=lambda a: (a["date"], a["zone"]))
    return out


def alert2_new_province(data, cfg):
    # First date any zone in the province is > 0, and every zone crossing that day.
    first_pos = {}  # zone -> (date, new_cases)
    for zone, series in data["observations"].items():
        for o in series:
            if o["cum_cases"] and o["cum_cases"] > 0:
                first_pos[zone] = o
                break
    prov_date = {}
    for zone, o in first_pos.items():
        p = o["province"]
        if p not in prov_date or _d(o["date"]) < _d(prov_date[p]):
            prov_date[p] = o["date"]
    out = []
    for p, d in prov_date.items():
        zones = sorted(z for z, o in first_pos.items() if o["province"] == p and o["date"] == d)
        new = sum(first_pos[z]["new_cases"] or 0 for z in zones)
        pg = data["post_gap"][d]
        out.append({
            "alert": "A2 new province", "date": d, "province": p,
            "zone": ", ".join(zones), "new_cases": new, "quiet_days": "",
            "post_gap": "Y" if pg else "N", "reversed": "N", "status": "Confirmed",
            "date_uncertain": pg,
            "note": (("date uncertain: first case fell somewhere in the %d-day gap; "
                      % data["step_gap"][d]) if pg else "") + "triggering zones: " + ", ".join(zones),
        })
    out.sort(key=lambda a: (a["date"], a["province"]))
    return out


def _alert3_episodes(series, threshold, window, global_gaps, max_gap):
    """Rising-edge episodes where the rolling new-case sum crosses >= threshold."""
    fires = []
    armed = True  # below threshold, ready to fire
    for o in series:
        if o["cum_cases"] is None:
            continue
        total, _ = rolling_new(series, o["date"], window)
        if total >= threshold and armed:
            # Is the crossing driven only by a post-gap lump? (Step A3)
            lo = _d(o["date"]) - dt.timedelta(days=window - 1)
            lump = sum(x["new_cases"] or 0 for x in series
                       if lo <= _d(x["date"]) <= _d(o["date"])
                       and x["post_gap"] and x["step_gap"] > max_gap)
            cant = lump > 0 and (total - lump) < threshold
            fires.append({"date": o["date"], "total": total, "lump": lump, "cant_assess": cant})
            armed = False
        elif total < threshold:
            armed = True
    return fires


def alert3_rise(data, cfg):
    window = cfg["alert3_window_days"]
    max_gap = cfg["max_assessable_gap_days"]
    out = []
    # Zone level
    for zone, series in data["observations"].items():
        for f in _alert3_episodes(series, cfg["alert3_zone_threshold"], window,
                                  data["global_gaps"], max_gap):
            out.append({
                "alert": "A3 rise (zone)", "date": f["date"],
                "province": data["zone_prov"][zone], "zone": zone,
                "new_cases": f["total"], "quiet_days": "",
                "post_gap": "Y" if data["post_gap"][f["date"]] else "N", "reversed": "N",
                "status": "Can't be assessed" if f["cant_assess"] else "Confirmed",
                "date_uncertain": data["post_gap"][f["date"]],
                "note": ("rise is only a post-gap lump (%d of %d new cases after a long gap)"
                         % (f["lump"], f["total"])) if f["cant_assess"]
                        else ("7-day new cases >= %d" % cfg["alert3_zone_threshold"]),
            })
    # Province level — build a province rolling series from zone new-cases.
    prov_series = defaultdict(lambda: defaultdict(int))
    for zone, series in data["observations"].items():
        for o in series:
            if o["new_cases"]:
                prov_series[o["province"]][o["date"]] += o["new_cases"]
    for p, perday in prov_series.items():
        pseudo = [{"date": d, "cum_cases": 1, "new_cases": perday[d],
                   "post_gap": data["post_gap"][d], "step_gap": data["step_gap"][d]}
                  for d in sorted(perday)]
        for f in _alert3_episodes(pseudo, cfg["alert3_province_threshold"], window,
                                  data["global_gaps"], max_gap):
            out.append({
                "alert": "A3 rise (province)", "date": f["date"], "province": p, "zone": "",
                "new_cases": f["total"], "quiet_days": "",
                "post_gap": "Y" if data["post_gap"][f["date"]] else "N", "reversed": "N",
                "status": "Can't be assessed" if f["cant_assess"] else "Confirmed",
                "date_uncertain": data["post_gap"][f["date"]],
                "note": ("rise is only a post-gap lump (%d of %d)" % (f["lump"], f["total"]))
                        if f["cant_assess"] else ("province 7-day new cases >= %d"
                                                  % cfg["alert3_province_threshold"]),
            })
    out.sort(key=lambda a: (a["date"], a["alert"], a["province"], a["zone"]))
    return out


def alert4_resurgence(data, cfg):
    quiet_days = cfg["alert4_quiet_days"]
    confirm = cfg["alert4_confirm_days"]
    max_gap = cfg["max_assessable_gap_days"]
    last_report = _d(data["report_dates"][-1])
    out = []
    for zone, series in data["observations"].items():
        last_inc = None
        prev_c = None
        for o in series:
            c = o["cum_cases"]
            if c is None:
                continue
            is_increase = (prev_c is None and c > 0) or (prev_c is not None and c > prev_c)
            if is_increase:
                if last_inc is not None:
                    quiet = (_d(o["date"]) - _d(last_inc)).days
                    if quiet >= quiet_days:
                        g = gap_in_span(data["global_gaps"], last_inc, o["date"], max_gap)
                        if g:
                            status, reversed_, note = ("Can't be assessed", "N",
                                "quiet span overlaps a %d-day reporting gap (%s..%s)"
                                % (g["span_days"], g["after_report"], g["next_report"]))
                        else:
                            # Step A4 — confirm the new case is still in the cumulative 7 days later.
                            later = [x for x in series if _d(x["date"]) >= _d(o["date"]) + dt.timedelta(days=confirm)
                                     and x["cum_cases"] is not None]
                            if not later:
                                status, reversed_, note = ("Pending confirmation", "N",
                                    "less than %d days of follow-up since %s" % (confirm, o["date"]))
                            elif later[0]["cum_cases"] >= c:
                                status, reversed_, note = ("Confirmed", "N",
                                    "still present %d days later" % confirm)
                            else:
                                status, reversed_, note = ("Reversed by correction", "Y",
                                    "cumulative fell to %d within %d days" % (later[0]["cum_cases"], confirm))
                        out.append({
                            "alert": "A4 resurgence", "date": o["date"],
                            "province": o["province"], "zone": zone,
                            "new_cases": o["new_cases"], "quiet_days": quiet,
                            "post_gap": "Y" if o["post_gap"] else "N",
                            "reversed": reversed_, "status": status,
                            "date_uncertain": o["post_gap"], "note": note,
                        })
                last_inc = o["date"]
            prev_c = c
    out.sort(key=lambda a: (a["date"], a["zone"]))
    return out


# ---------------------------------------------------------------------------
# Step 4 — outputs
# ---------------------------------------------------------------------------
ALERT_COLS = [("alert", "Alert"), ("date", "Date"), ("province", "Province"),
              ("zone", "Health Zone"), ("new_cases", "New cases"),
              ("quiet_days", "Quiet days"), ("post_gap", "Post-gap / date uncertain"),
              ("reversed", "Reversed by correction"), ("status", "Status"), ("note", "Note")]


def write_csv(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def write_outputs(data, alerts, cfg, outdir, want_excel=True):
    os.makedirs(outdir, exist_ok=True)

    # Cleaned per-zone daily data (derived from the raw file, raw file untouched).
    clean_rows = []
    for zone, series in sorted(data["observations"].items()):
        for o in series:
            clean_rows.append([o["date"], o["sitrep"], o["province"], zone,
                               o["cum_cases"], o["cum_deaths"], o["new_cases"], o["new_deaths"],
                               o["step_gap"], "Y" if o["post_gap"] else "N",
                               "Y" if o["is_correction"] else "N"])
    write_csv(os.path.join(outdir, "cleaned_zone_daily.csv"),
              ["report_date", "sitrep", "province", "zone", "cum_cases", "cum_deaths",
               "new_cases", "new_deaths", "step_gap_days", "post_gap", "is_correction"],
              clean_rows)

    gap_rows = [["global", g["after_report"], g["next_report"], g["missing_days"],
                 g["span_days"], ""] for g in data["global_gaps"]]
    gap_rows += [["zone", z["date"], z["date"], 1, "", z["zone"]] for z in data["zone_gaps"]]
    write_csv(os.path.join(outdir, "reporting_gaps.csv"),
              ["scope", "after_report", "next_report", "missing_days", "span_days", "zone"], gap_rows)

    corr_rows = [[c["zone"], c["province"], c["date"], c["sitrep"], c["field"], c["from"], c["to"]]
                 for c in data["corrections"]]
    write_csv(os.path.join(outdir, "corrections.csv"),
              ["zone", "province", "report_date", "sitrep", "field", "from", "to"], corr_rows)

    def arows(items):
        return [[a.get(k, "") for k, _ in ALERT_COLS] for a in items]

    all_alerts = alerts["A1"] + alerts["A2"] + alerts["A3"] + alerts["A4"]
    write_csv(os.path.join(outdir, "alerts.csv"), [h for _, h in ALERT_COLS], arows(all_alerts))

    if want_excel:
        try:
            _write_excel(os.path.join(outdir, "alerts.xlsx"), data, alerts, cfg)
        except ModuleNotFoundError:
            print("  (openpyxl not installed — wrote CSVs only; re-run with "
                  "`uv run --with openpyxl ...` for the .xlsx)")


def _write_excel(path, data, alerts, cfg):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment

    wb = Workbook()
    head_font = Font(bold=True, color="FFFFFF")
    head_fill = PatternFill("solid", fgColor="1F3A5F")
    wrap = Alignment(vertical="top", wrap_text=True)

    def sheet(title, header, rows, widths=None):
        ws = wb.create_sheet(title)
        ws.append(header)
        for c in ws[1]:
            c.font = head_font
            c.fill = head_fill
        for r in rows:
            ws.append(r)
        ws.freeze_panes = "A2"
        for i, h in enumerate(header, 1):
            from openpyxl.utils import get_column_letter
            ws.column_dimensions[get_column_letter(i)].width = (widths or {}).get(h, 16)
        for row in ws.iter_rows(min_row=2):
            for c in row:
                c.alignment = wrap
        return ws

    # Summary sheet first.
    ws = wb.active
    ws.title = "Summary"
    for c in ws[1]:
        pass
    summ = summary_lines(data, alerts, cfg)
    ws.append(["Ebola early-warning alerts — summary"])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([])
    for line in summ:
        ws.append([line])
    ws.column_dimensions["A"].width = 110

    awidths = {"Alert": 16, "Date": 12, "Province": 14, "Health Zone": 24,
               "New cases": 10, "Quiet days": 11, "Post-gap / date uncertain": 14,
               "Reversed by correction": 14, "Status": 20, "Note": 60}
    hdr = [h for _, h in ALERT_COLS]

    def arows(items):
        return [[a.get(k, "") for k, _ in ALERT_COLS] for a in items]

    sheet("Alert 1 - new zone", hdr, arows(alerts["A1"]), awidths)
    sheet("Alert 2 - new province", hdr, arows(alerts["A2"]), awidths)
    sheet("Alert 3 - rise", hdr, arows(alerts["A3"]), awidths)
    sheet("Alert 4 - resurgence", hdr, arows(alerts["A4"]), awidths)
    sheet("Reporting gaps",
          ["Scope", "After report", "Next report", "Missing days", "Span days", "Zone"],
          [["global", g["after_report"], g["next_report"], g["missing_days"], g["span_days"], ""]
           for g in data["global_gaps"]]
          + [["zone", z["date"], z["date"], 1, "", z["zone"]] for z in data["zone_gaps"]],
          {"Scope": 10, "After report": 14, "Next report": 14, "Zone": 20})
    sheet("Corrections",
          ["Zone", "Province", "Report date", "SitRep", "Field", "From", "To"],
          [[c["zone"], c["province"], c["date"], c["sitrep"], c["field"], c["from"], c["to"]]
           for c in data["corrections"]],
          {"Zone": 18, "Province": 14, "Field": 18})
    wb.save(path)


# ---------------------------------------------------------------------------
# Threshold scan + summary
# ---------------------------------------------------------------------------
def scan_thresholds(data, cfg):
    window = cfg["alert3_window_days"]
    max_gap = cfg["max_assessable_gap_days"]
    lines = ["Alert 3 threshold scan (episodes = rising-edge crossings; "
             "'can't assess' excluded):"]
    for t in cfg["alert3_zone_threshold_candidates"]:
        n = cant = 0
        for zone, series in data["observations"].items():
            for f in _alert3_episodes(series, t, window, data["global_gaps"], max_gap):
                n += 1
                cant += f["cant_assess"]
        lines.append("  zone threshold >= %-4d 7-day new cases : %3d episodes (%d can't assess)"
                     % (t, n, cant))
    prov_series = defaultdict(lambda: defaultdict(int))
    for zone, series in data["observations"].items():
        for o in series:
            if o["new_cases"]:
                prov_series[o["province"]][o["date"]] += o["new_cases"]
    for t in cfg["alert3_province_threshold_candidates"]:
        n = 0
        for p, perday in prov_series.items():
            pseudo = [{"date": d, "cum_cases": 1, "new_cases": perday[d],
                       "post_gap": data["post_gap"][d], "step_gap": data["step_gap"][d]}
                      for d in sorted(perday)]
            n += len(_alert3_episodes(pseudo, t, window, data["global_gaps"], max_gap))
        lines.append("  province threshold >= %-4d 7-day new cases : %3d episodes" % (t, n))
    return lines


def summary_lines(data, alerts, cfg):
    rd = data["report_dates"]
    provs = sorted(set(data["zone_prov"].values()))
    big_gaps = [g for g in data["global_gaps"] if g["span_days"] > cfg["max_assessable_gap_days"]]
    L = []
    L.append("Period: %s .. %s (%d reports)." % (rd[0], rd[-1], len(rd)))
    L.append("Zones: %d health zones across %d provinces (%s)."
             % (len(data["observations"]), len(provs), ", ".join(provs)))
    L.append("Reporting gaps: %d global (%d longer than %d days: %s); %d zone-level; %d corrections."
             % (len(data["global_gaps"]), len(big_gaps), cfg["max_assessable_gap_days"],
                "; ".join("%s->%s %dd" % (g["after_report"], g["next_report"], g["span_days"])
                          for g in big_gaps) or "none",
                len(data["zone_gaps"]), len(data["corrections"])))
    for key, name in [("A1", "Alert 1 new zone"), ("A2", "Alert 2 new province"),
                      ("A3", "Alert 3 rise"), ("A4", "Alert 4 resurgence")]:
        items = alerts[key]
        conf = sum(1 for a in items if a["status"] == "Confirmed")
        cant = sum(1 for a in items if a["status"] == "Can't be assessed")
        rev = sum(1 for a in items if a["status"] == "Reversed by correction")
        pend = sum(1 for a in items if a["status"] == "Pending confirmation")
        unc = sum(1 for a in items if a.get("date_uncertain"))
        L.append("%s: %d fired — %d confirmed, %d can't-assess, %d reversed, %d pending; %d date-uncertain (post-gap)."
                 % (name, len(items), conf, cant, rev, pend, unc))
    return L


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def run(cfg, outdir, want_excel=True):
    data = load_clean(cfg)
    alerts = {"A1": alert1_new_zone(data, cfg), "A2": alert2_new_province(data, cfg),
              "A3": alert3_rise(data, cfg), "A4": alert4_resurgence(data, cfg)}
    write_outputs(data, alerts, cfg, outdir, want_excel=want_excel)
    return data, alerts


def main():
    ap = argparse.ArgumentParser(description="DRC Ebola early-warning alert system.")
    ap.add_argument("--source")
    ap.add_argument("--outdir")
    ap.add_argument("--config")
    ap.add_argument("--zone-threshold", type=int)
    ap.add_argument("--province-threshold", type=int)
    ap.add_argument("--scan", action="store_true")
    ap.add_argument("--no-excel", action="store_true")
    args = ap.parse_args()

    cfg = dict(CONFIG)
    if args.config:
        cfg.update(json.load(open(args.config)))
    if args.source:
        cfg["source_csv"] = args.source
    if args.zone_threshold is not None:
        cfg["alert3_zone_threshold"] = args.zone_threshold
    if args.province_threshold is not None:
        cfg["alert3_province_threshold"] = args.province_threshold
    outdir = os.path.join(REPO, args.outdir or cfg["outdir"])

    data, alerts = run(cfg, outdir, want_excel=not args.no_excel)

    print("\n".join(summary_lines(data, alerts, cfg)))
    print()
    if args.scan:
        print("\n".join(scan_thresholds(data, cfg)))
        print()
    print("Active Alert-3 thresholds: zone >= %d, province >= %d new cases in %d days."
          % (cfg["alert3_zone_threshold"], cfg["alert3_province_threshold"], cfg["alert3_window_days"]))
    print("Outputs written to %s/ : alerts.xlsx, alerts.csv, cleaned_zone_daily.csv, "
          "reporting_gaps.csv, corrections.csv" % os.path.relpath(outdir, REPO))
    print("\nCaveats: dates are REPORT dates, not symptom-onset or sample dates. "
          "Only confirmed cases are used (the source has no probable-case column). "
          "Zones appear in the data only from their first case, so Alert 1 depends on the "
          "series being complete.")


if __name__ == "__main__":
    main()
