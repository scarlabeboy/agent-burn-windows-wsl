//! "Keep WSL awake": one `wsl.exe -d <distro> --exec sleep infinity` per distribution, as long
//! as the app runs. Stopping that process lets WSL go to sleep by itself once nothing else uses
//! it; the app never runs `wsl --shutdown`, which would also stop what the user started.

use std::{
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};

use crate::{cli::hide_window, sources};

static KEEPERS: Mutex<Vec<(String, Child)>> = Mutex::new(Vec::new());
/// The latest wish, recorded in the order the requests arrive, before any slow work starts.
static WANTED: AtomicBool = AtomicBool::new(false);

fn spawn(distro: &str) -> Option<Child> {
    let mut command = Command::new(sources::wsl_program());
    hide_window(&mut command);
    let mut child = command
        .args(["-d", distro, "--exec", "sleep", "infinity"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    // Outside the job, the process would outlive an app that is killed and keep WSL awake for
    // good: better not to keep the distribution awake at all.
    #[cfg(windows)]
    if !crate::job::app_job().is_some_and(|job| job.adopt(&child)) {
        stop(&mut child);
        return None;
    }
    Some(child)
}

fn stop(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

/// Records whether WSL should be kept awake. Call it before `ensure`, in the order the requests
/// arrive: `ensure` may run later on another thread, and the latest wish must win.
pub fn want(enabled: bool) {
    WANTED.store(enabled, Ordering::SeqCst);
}

/// Makes the keeping processes match the latest wish: none when it is off, otherwise one per
/// installed distribution, started again if one ended (WSL was shut down, the process died).
/// Starting one wakes its distribution, which is the point of this mode.
pub fn ensure() {
    let wish = WANTED.load(Ordering::SeqCst);
    let names = if wish { sources::distribution_names() } else { Vec::new() };
    apply(wish, names);
}

fn apply(wish: bool, wanted: Vec<String>) {
    let mut keepers = KEEPERS.lock().unwrap_or_else(|error| error.into_inner());
    // The wish changed while WSL was being listed: the request that changed it runs after this
    // one and does the work, so a stale renewal never starts a keeper after "off".
    if WANTED.load(Ordering::SeqCst) != wish {
        return;
    }

    let mut kept = Vec::new();
    for (name, mut child) in keepers.drain(..) {
        let alive = matches!(child.try_wait(), Ok(None));
        if alive && wanted.contains(&name) {
            kept.push((name, child));
        } else if alive {
            stop(&mut child);
        }
    }
    for name in wanted {
        if !kept.iter().any(|(existing, _)| *existing == name) {
            if let Some(child) = spawn(&name) {
                kept.push((name, child));
            }
        }
    }
    *keepers = kept;
}

#[cfg(test)]
mod tests {
    use std::{env, fs, time::Duration};

    use super::*;

    /// A fake `wsl.exe`: lists one distribution and keeps running when asked to keep it awake.
    const FAKE: &str = "@echo off\r\nif \"%1\"==\"-l\" goto list\r\nif \"%1\"==\"--list\" goto running\r\n\
        if \"%1\"==\"-d\" goto keep\r\nexit /b 2\r\n:list\r\necho Ubuntu\r\nexit /b 0\r\n\
        :running\r\nexit /b 0\r\n:keep\r\nping -n 30 127.0.0.1 >nul\r\nexit /b 0\r\n";

    fn count() -> usize {
        KEEPERS.lock().unwrap_or_else(|error| error.into_inner()).len()
    }

    fn alive() -> bool {
        let mut keepers = KEEPERS.lock().unwrap_or_else(|error| error.into_inner());
        keepers.iter_mut().any(|(_, child)| matches!(child.try_wait(), Ok(None)))
    }

    /// What the command does: record the wish, then act on it.
    fn set(enabled: bool) {
        want(enabled);
        ensure();
    }

    #[test]
    fn keeps_a_distribution_awake_and_stops_on_request() {
        let _turn = crate::sources::TEST_ENVIRONMENT.lock().unwrap_or_else(|error| error.into_inner());
        let dir = env::temp_dir().join(format!("abf-keep-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let script = dir.join("wsl.cmd");
        fs::write(&script, FAKE).unwrap();
        env::set_var("ABF_WSL_EXE", &script);
        env::set_var("LOCALAPPDATA", dir.join("data"));

        set(true);
        assert_eq!(count(), 1, "one keeper for the one distribution");
        std::thread::sleep(Duration::from_millis(500));
        assert!(alive());
        set(true);
        assert_eq!(count(), 1, "a keeper that is alive is not started twice");

        set(false);
        assert_eq!(count(), 0);
        assert!(!alive());

        env::remove_var("ABF_WSL_EXE");
        env::remove_var("LOCALAPPDATA");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn a_keeper_that_ended_is_started_again() {
        let _turn = crate::sources::TEST_ENVIRONMENT.lock().unwrap_or_else(|error| error.into_inner());
        let dir = env::temp_dir().join(format!("abf-rekeep-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        // The keeping process ends at once, as it does after a `wsl --shutdown`.
        let quick = FAKE.replace("ping -n 30 127.0.0.1 >nul", "rem");
        let script = dir.join("wsl.cmd");
        fs::write(&script, quick).unwrap();
        env::set_var("ABF_WSL_EXE", &script);
        env::set_var("LOCALAPPDATA", dir.join("data"));

        set(true);
        std::thread::sleep(Duration::from_millis(800));
        assert!(!alive(), "the keeper has ended");
        set(true);
        assert_eq!(count(), 1, "a new keeper replaced the one that ended");

        set(false);
        env::remove_var("ABF_WSL_EXE");
        env::remove_var("LOCALAPPDATA");
        let _ = fs::remove_dir_all(dir);
    }

    /// A renewal that listed WSL while "off" was requested must not start a keeper afterwards.
    #[test]
    fn a_stale_renewal_does_not_undo_off() {
        let _turn = crate::sources::TEST_ENVIRONMENT.lock().unwrap_or_else(|error| error.into_inner());
        let dir = env::temp_dir().join(format!("abf-stale-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let script = dir.join("wsl.cmd");
        fs::write(&script, FAKE).unwrap();
        env::set_var("ABF_WSL_EXE", &script);
        env::set_var("LOCALAPPDATA", dir.join("data"));

        set(true);
        assert_eq!(count(), 1);
        // The renewal read "on" and listed Ubuntu; meanwhile "off" arrived and was carried out.
        set(false);
        apply(true, vec!["Ubuntu".to_string()]);
        assert_eq!(count(), 0, "the stale renewal changed nothing");
        assert!(!alive());

        env::remove_var("ABF_WSL_EXE");
        env::remove_var("LOCALAPPDATA");
        let _ = fs::remove_dir_all(dir);
    }
}
