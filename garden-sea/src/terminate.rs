#[cfg(unix)]
use nix::unistd::Pid;

#[cfg(unix)]
use nix::sys::signal::{self, Signal};

#[cfg(windows)]
use windows::Win32::System::Console::{
    AttachConsole, FreeConsole, GenerateConsoleCtrlEvent, SetConsoleCtrlHandler, CTRL_C_EVENT,
};

#[cfg(unix)]
pub fn interrupt(pid: u32) -> Result<(), nix::errno::Errno> {
    signal::kill(Pid::from_raw(pid.try_into().unwrap()), Signal::SIGINT)?;
    Ok(())
}

#[cfg(windows)]
pub fn interrupt(pid: u32) -> windows::core::Result<()> {
    unsafe {
        FreeConsole()?;
        AttachConsole(pid)?;
        SetConsoleCtrlHandler(None, true)?;
        GenerateConsoleCtrlEvent(CTRL_C_EVENT, 0)?;
    }
    Ok(())
}
