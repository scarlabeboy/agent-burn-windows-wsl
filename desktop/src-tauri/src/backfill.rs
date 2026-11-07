use std::{
    collections::{BTreeMap, BTreeSet},
    env,
    fs::{self, File},
    io::{self, BufRead, BufReader, Read},
    path::{Path, PathBuf},
    sync::{mpsc, Mutex},
    thread,
    time::{Duration, UNIX_EPOCH},
};

use memchr::memmem;
use serde::Serialize;
use serde_json::Value;

use crate::sources;

const MAX_LINE_BYTES: usize = 256 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackfillSeries {
    pub window_minutes: u64,
    /// End of the window cycle, in minutes since the Unix epoch.
    pub end_minute: i64,
    /// `(timestamp in ms, used percent)`, oldest first, one point per change.
    pub samples: Vec<(i64, f64)>,
}

/// A frozen WSL share can block a read forever: past this, the backfill gives up for this run.
const BACKFILL_TIMEOUT: Duration = Duration::from_secs(120);

/// Sources with a backfill under way, until its reads really end (even after a timeout).
static RUNNING: Mutex<BTreeSet<String>> = Mutex::new(BTreeSet::new());

fn codex_home(distro: Option<&str>) -> Result<PathBuf, String> {
    Ok(match distro {
        None => match env::var_os("CODEX_HOME") {
            Some(codex_home) => PathBuf::from(codex_home),
            None => PathBuf::from(env::var_os("USERPROFILE").ok_or("USERPROFILE is not set")?)
                .join(".codex"),
        },
        Some(distro) => {
            let user = sources::running_user(distro)?;
            PathBuf::from(sources::wsl_home_unc(distro, &user)).join(".codex")
        }
    })
}

/// `codex_rate_limits` bounded in time, one run per source at a time. The reads go on in their
/// own thread after a timeout (a blocked read cannot be interrupted), and the source stays busy
/// until they end, so a frozen share never piles up reads.
pub fn codex_rate_limits_bounded(
    distro: Option<String>,
    since_ms: i64,
) -> Result<Vec<BackfillSeries>, String> {
    let source = distro.clone().unwrap_or_default();
    {
        let mut running = RUNNING.lock().map_err(|error| error.to_string())?;
        if !running.insert(source.clone()) {
            return Err("a backfill of this source is already running".into());
        }
    }
    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        let result = codex_rate_limits(distro.as_deref(), since_ms);
        if let Ok(mut running) = RUNNING.lock() {
            running.remove(&source);
        }
        let _ = sender.send(result);
    });
    receiver
        .recv_timeout(BACKFILL_TIMEOUT)
        .unwrap_or_else(|_| Err("the backfill took too long".into()))
}

fn collect(dir: &Path, cutoff_ms: i64, files: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_dir() {
            collect(&path, cutoff_ms, files);
        } else if path
            .extension()
            .is_some_and(|extension| extension == "jsonl")
        {
            let modified = entry
                .metadata()
                .and_then(|metadata| metadata.modified())
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |elapsed| elapsed.as_millis() as i64);
            if modified >= cutoff_ms {
                files.push(path);
            }
        }
    }
}

/// `2026-10-31T05:15:20.510Z` to milliseconds since the Unix epoch.
fn parse_timestamp(text: &str) -> Option<i64> {
    let (date, time) = text.trim_end_matches('Z').split_once('T')?;
    let mut date = date.split('-');
    let year: i64 = date.next()?.parse().ok()?;
    let month: i64 = date.next()?.parse().ok()?;
    let day: i64 = date.next()?.parse().ok()?;
    let (clock, fraction) = time.split_once('.').unwrap_or((time, "0"));
    if fraction.is_empty() || !fraction.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let mut clock = clock.split(':');
    let hour: i64 = clock.next()?.parse().ok()?;
    let minute: i64 = clock.next()?.parse().ok()?;
    let second: i64 = clock.next()?.parse().ok()?;
    let millis = fraction
        .bytes()
        .chain(std::iter::repeat(b'0'))
        .take(3)
        .fold(0_i64, |value, digit| value * 10 + i64::from(digit - b'0'));
    // Days from civil date (Howard Hinnant's algorithm).
    let y = if month <= 2 { year - 1 } else { year };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (month + if month > 2 { -3 } else { 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    Some(((days * 24 + hour) * 60 + minute) * 60_000 + second * 1000 + millis)
}

/// Keep at most one byte beyond the limit, then discard the rest without allocating it.
fn read_line_bounded(reader: &mut impl BufRead, line: &mut Vec<u8>) -> io::Result<usize> {
    line.clear();
    let read = reader
        .by_ref()
        .take((MAX_LINE_BYTES + 1) as u64)
        .read_until(b'\n', line)?;
    if line.len() > MAX_LINE_BYTES && !line.ends_with(b"\n") {
        reader.skip_until(b'\n')?;
    }
    Ok(read)
}

type Key = (u64, i64);

fn record(value: &Value, timestamp: i64, found: &mut BTreeMap<Key, Vec<(i64, f64)>>) {
    let Some(limits) = value.pointer("/payload/rate_limits") else {
        return;
    };
    // Only the account's limit, as the CLI reads it (`is_account_limit` in codex/plan.rs): a
    // model's own meter (`codex_bengalfox`…) has other figures and would break the series.
    let limit_id = limits.get("limit_id").and_then(Value::as_str).unwrap_or("codex");
    if limit_id != "codex" {
        return;
    }
    for name in ["primary", "secondary"] {
        let Some(window) = limits.get(name) else {
            continue;
        };
        let (Some(minutes), Some(used), Some(resets_at)) = (
            window.get("window_minutes").and_then(Value::as_u64),
            window.get("used_percent").and_then(Value::as_f64),
            window.get("resets_at").and_then(Value::as_i64),
        ) else {
            continue;
        };
        let end_minute = (resets_at as f64 / 60.0).round() as i64;
        found
            .entry((minutes, end_minute))
            .or_default()
            .push((timestamp, used));
    }
}

/// Rebuilds Codex limit history from the rate-limit snapshots Codex logs with each turn.
/// Only files modified since `since_ms` are read.
pub fn codex_rate_limits(
    distro: Option<&str>,
    since_ms: i64,
) -> Result<Vec<BackfillSeries>, String> {
    let home = codex_home(distro)?;
    let mut files = Vec::new();
    // Codex moves the sessions archived from its interface to their own folder.
    collect(&home.join("sessions"), since_ms, &mut files);
    collect(&home.join("archived_sessions"), since_ms, &mut files);

    let finder = memmem::Finder::new(b"\"rate_limits\"");
    let mut found: BTreeMap<Key, Vec<(i64, f64)>> = BTreeMap::new();
    let mut line = Vec::new();
    for path in files {
        let Ok(file) = File::open(&path) else {
            continue;
        };
        let mut reader = BufReader::new(file);
        loop {
            match read_line_bounded(&mut reader, &mut line) {
                Ok(0) | Err(_) => break,
                Ok(_) => {}
            }
            if line.len() > MAX_LINE_BYTES || finder.find(&line).is_none() {
                continue;
            }
            let Ok(value) = serde_json::from_slice::<Value>(&line) else {
                continue;
            };
            let Some(timestamp) = value
                .get("timestamp")
                .and_then(Value::as_str)
                .and_then(parse_timestamp)
            else {
                continue;
            };
            record(&value, timestamp, &mut found);
        }
    }

    Ok(found
        .into_iter()
        .map(|((window_minutes, end_minute), mut samples)| {
            samples.sort_by(|a, b| a.0.cmp(&b.0));
            // One point per change keeps the archive small.
            samples.dedup_by(|next, previous| next.1 == previous.1);
            BackfillSeries {
                window_minutes,
                end_minute,
                samples,
            }
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_log_timestamps() {
        assert_eq!(parse_timestamp("1970-01-01T00:00:00.000Z"), Some(0));
        assert_eq!(
            parse_timestamp("2026-10-31T05:15:20.510Z"),
            Some(1_793_423_720_510)
        );
        assert_eq!(
            parse_timestamp("2026-10-31T05:15:20Z"),
            Some(1_793_423_720_000)
        );
        assert_eq!(parse_timestamp("nonsense"), None);
    }

    #[test]
    fn rejects_non_ascii_timestamp_fractions() {
        assert_eq!(parse_timestamp("2026-10-31T05:15:20.ééZ"), None);
        assert_eq!(parse_timestamp("2026-10-31T05:15:20.510éZ"), None);
        assert_eq!(parse_timestamp("2026-10-31T05:15:20.Z"), None);
    }

    #[test]
    fn pads_and_truncates_ascii_timestamp_fractions() {
        assert_eq!(parse_timestamp("2026-10-31T05:15:20.5Z"), Some(1_793_423_720_500));
        assert_eq!(parse_timestamp("2026-10-31T05:15:20.5109Z"), Some(1_793_423_720_510));
    }

    #[test]
    fn skips_an_oversized_line_without_losing_the_next_record() {
        let valid = br#"{"timestamp":"2026-10-31T05:15:20.510Z","payload":{"rate_limits":{}}}"#;
        let mut input = vec![b'x'; MAX_LINE_BYTES * 3];
        input.push(b'\n');
        input.extend_from_slice(valid);
        input.push(b'\n');
        let mut reader = BufReader::with_capacity(32, input.as_slice());
        let mut line = Vec::new();

        assert_eq!(read_line_bounded(&mut reader, &mut line).unwrap(), MAX_LINE_BYTES + 1);
        assert_eq!(line.len(), MAX_LINE_BYTES + 1);
        assert_eq!(read_line_bounded(&mut reader, &mut line).unwrap(), valid.len() + 1);
        assert_eq!(line.strip_suffix(b"\n").unwrap(), valid);
        assert!(serde_json::from_slice::<Value>(&line).is_ok());
        assert_eq!(read_line_bounded(&mut reader, &mut line).unwrap(), 0);
    }

    #[test]
    fn an_oversized_line_ending_at_the_read_limit_keeps_the_next_line() {
        let mut input = vec![b'x'; MAX_LINE_BYTES];
        input.extend_from_slice(b"\n{}\n");
        let mut reader = BufReader::new(input.as_slice());
        let mut line = Vec::new();

        assert_eq!(read_line_bounded(&mut reader, &mut line).unwrap(), MAX_LINE_BYTES + 1);
        assert_eq!(read_line_bounded(&mut reader, &mut line).unwrap(), 3);
        assert_eq!(line, b"{}\n");
    }

    #[test]
    fn groups_snapshots_by_window_cycle() {
        let line = r#"{"timestamp":"2026-10-31T05:15:20.510Z","payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":25.0,"window_minutes":300,"resets_at":1793418063},"secondary":{"used_percent":26.0,"window_minutes":10080,"resets_at":1793778274}}}}"#;
        let value: Value = serde_json::from_str(line).unwrap();
        let mut found = BTreeMap::new();
        record(&value, 1, &mut found);
        record(&value, 2, &mut found);
        assert_eq!(found.len(), 2);
        assert_eq!(found[&(300, 29_890_301)].len(), 2);
    }

    #[test]
    fn keeps_the_account_limit_only() {
        let line = |limit_id: &str| {
            format!(
                r#"{{"payload":{{"rate_limits":{{{limit_id}"secondary":{{"used_percent":100.0,"window_minutes":10080,"resets_at":1793778274}}}}}}}}"#
            )
        };
        let mut found = BTreeMap::new();
        for (limit_id, timestamp) in [
            (r#""limit_id":"codex_bengalfox","#, 1),
            (r#""limit_id":"codex","#, 2),
            ("", 3),
            (r#""limit_id":null,"#, 4),
        ] {
            let value: Value = serde_json::from_str(&line(limit_id)).unwrap();
            record(&value, timestamp, &mut found);
        }
        let samples: Vec<i64> = found.values().flatten().map(|(timestamp, _)| *timestamp).collect();
        assert_eq!(samples, [2, 3, 4], "a model's own meter is left out");
    }
}
