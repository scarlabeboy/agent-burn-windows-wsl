//! "Keep WSL awake": one `wsl.exe -d <distro> --exec sleep infinity` per distribution, as long
//! as the app runs. Stopping that process lets WSL go to sleep by itself once nothing else uses
//! it; the app never runs `wsl --shutdown`, which would also stop what the user started.

use std::{
    process::{Child, Command, Stdio},
    sync::Mutex,
};

use crate::{cli::hide_window, sources};

static KEEPERS: Mutex<Vec<(String, Child)>> = Mutex::new(Vec::new());

/// A Windows job whose processes are all ended when its handle closes, that is when this
/// process ends, normally or not. The keeping processes live in it.
#[cfg(windows)]
mod job {
    use std::{
        ffi::c_void,
        mem::{size_of, zeroed},
        os::windows::io::AsRawHandle,
        process::Child,
    };

    use windows_sys::Win32::{
        Foundation::{CloseHandle, HANDLE},
        System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        },
    };

    pub struct Job(HANDLE);

    // SAFETY: a job handle is only an identifier the system resolves; any thread may use it.
    unsafe impl Send for Job {}
    unsafe impl Sync for Job {}

    impl Job {
        pub fn new() -> Option<Job> {
            // SAFETY: plain system calls; the handle is closed if the setup fails.
            unsafe {
                let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if handle.is_null() {
                    return None;
                }
                let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = zeroed();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let done = SetInformationJobObject(
                    handle,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const c_void,
                    size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                );
                if done == 0 {
                    CloseHandle(handle);
                    return None;
                }
                Some(Job(handle))
            }
        }

        pub fn adopt(&self, child: &Child) -> bool {
            // SAFETY: both handles are valid for the duration of the call.
            unsafe { AssignProcessToJobObject(self.0, child.as_raw_handle() as HANDLE) != 0 }
        }
    }

    impl Drop for Job {
        fn drop(&mut self) {
            // SAFETY: the handle is owned by this value and closed once.
            unsafe { CloseHandle(self.0) };
        }
    }

    /// The job of the app, never dropped: it closes when the process ends.
    pub fn app_job() -> Option<&'static Job> {
        static JOB: std::sync::OnceLock<Option<Job>> = std::sync::OnceLock::new();
        JOB.get_or_init(Job::new).as_ref()
    }
}

fn spawn(distro: &str) -> Option<Child> {
    let mut command = Command::new(sources::wsl_program());
    hide_window(&mut command);
    let child = command
        .args(["-d", distro, "--exec", "sleep", "infinity"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    #[cfg(windows)]
    if let Some(job) = job::app_job() {
        job.adopt(&child);
    }
    Some(child)
}

fn stop(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

/// Makes the keeping processes match the wish: none when `enabled` is false, otherwise one per
/// installed distribution, started again if one ended (WSL was shut down, the process died).
/// Starting one wakes its distribution, which is the point of this mode.
pub fn ensure(enabled: bool) {
    let wanted = if enabled { sources::distribution_names() } else { Vec::new() };
    let mut keepers = KEEPERS.lock().unwrap_or_else(|error| error.into_inner());

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

    #[test]
    fn keeps_a_distribution_awake_and_stops_on_request() {
        let _turn = crate::sources::TEST_ENVIRONMENT.lock().unwrap_or_else(|error| error.into_inner());
        let dir = env::temp_dir().join(format!("abf-keep-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let script = dir.join("wsl.cmd");
        fs::write(&script, FAKE).unwrap();
        env::set_var("ABF_WSL_EXE", &script);
        env::set_var("LOCALAPPDATA", dir.join("data"));

        ensure(true);
        assert_eq!(count(), 1, "one keeper for the one distribution");
        std::thread::sleep(Duration::from_millis(500));
        assert!(alive());
        ensure(true);
        assert_eq!(count(), 1, "a keeper that is alive is not started twice");

        ensure(false);
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

        ensure(true);
        std::thread::sleep(Duration::from_millis(800));
        assert!(!alive(), "the keeper has ended");
        ensure(true);
        assert_eq!(count(), 1, "a new keeper replaced the one that ended");

        ensure(false);
        env::remove_var("ABF_WSL_EXE");
        env::remove_var("LOCALAPPDATA");
        let _ = fs::remove_dir_all(dir);
    }

    #[cfg(windows)]
    #[test]
    fn a_process_in_the_job_ends_when_the_job_closes() {
        let mut child = Command::new("cmd")
            .args(["/c", "ping -n 30 127.0.0.1 >nul"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .spawn()
            .unwrap();
        let job = job::Job::new().expect("a job can be created");
        assert!(job.adopt(&child), "the process joins the job");
        assert!(matches!(child.try_wait(), Ok(None)), "it runs while the job is open");
        drop(job);
        std::thread::sleep(Duration::from_millis(800));
        assert!(
            matches!(child.try_wait(), Ok(Some(_))),
            "closing the job ended the process"
        );
    }
}
