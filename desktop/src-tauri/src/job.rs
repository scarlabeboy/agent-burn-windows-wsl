//! A Windows job whose processes are all ended when its handle closes, that is when this
//! process ends, normally or not. The processes the app starts live in it: the CLI runs and
//! the processes that keep WSL awake. Without it, a CLI run still going when the app closes
//! (for example to install an update) would keep `agent-burn.exe` locked.

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

#[cfg(test)]
mod tests {
    use std::{
        process::{Command, Stdio},
        time::Duration,
    };

    use super::*;

    #[test]
    fn a_process_in_the_job_ends_when_the_job_closes() {
        let mut child = Command::new("cmd")
            .args(["/c", "ping -n 30 127.0.0.1 >nul"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .spawn()
            .unwrap();
        let job = Job::new().expect("a job can be created");
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
