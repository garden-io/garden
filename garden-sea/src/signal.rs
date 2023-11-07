#[cfg(windows)]
use crossbeam::channel::{bounded, select, Receiver, Sender};

#[cfg(windows)]
use lazy_static::lazy_static;
#[cfg(windows)]
use windows::Win32::Foundation::BOOL;
#[cfg(windows)]
use windows::Win32::System::Console::{
    SetConsoleCtrlHandler, CTRL_BREAK_EVENT, CTRL_CLOSE_EVENT, CTRL_C_EVENT, CTRL_LOGOFF_EVENT,
    CTRL_SHUTDOWN_EVENT,
};

use crate::log::debug;
use crate::terminate;

#[cfg(windows)]
#[derive(Debug)]
enum Signal {
    CtrlC,
}

#[cfg(windows)]
lazy_static! {
    static ref _C: (Sender<Signal>, Receiver<Signal>) = bounded(100);
    static ref SEND: Sender<Signal> = _C.0;
    static ref RECEIVE: Receiver<Signal> = _C.1;
}

#[cfg(windows)]
extern "system" fn console_ctrl_handler(ctrl_type: u32) -> BOOL {
    match ctrl_type {
        CTRL_C_EVENT | CTRL_BREAK_EVENT | CTRL_CLOSE_EVENT | CTRL_SHUTDOWN_EVENT
        | CTRL_LOGOFF_EVENT => {
            debug!("Control event received: {}", ctrl_type);
            SEND.send(Signal::CtrlC)
                .expect("Failed to send CtrlC signal");
            BOOL(1) // Indicate that the event has been handled
        }
        _ => BOOL(0), // Event has not been handled
    }
}

#[cfg(windows)]
pub fn set_console_ctrl_handler(pid: u32) -> windows::core::Result<()> {
    unsafe {
        SetConsoleCtrlHandler(Some(console_ctrl_handler), true)?;
    }

    std::thread::spawn(move || {
        select! {
          recv(RECEIVE) -> msg => {
            if let Ok(signal) = msg {
              debug!("Received signal {:?}", signal);
              if !terminate::interrupt(pid).is_ok() {
                debug!("Failed to forward signal {:?} to process: {:?}", signal, pid);
              }
            } else {
              debug!("Receive error: ${:?}", msg);
            }
          },
        }
    });

    Ok(())
}

#[cfg(unix)]
pub fn set_console_ctrl_handler(pid: u32) -> Result<(), nix::errno::Errno> {
    ctrlc::set_handler(move || {
        debug!("Received Ctrl+C / SIGINT!");
        let result = terminate::interrupt(pid);
        match result {
            Ok(_) => debug!("Successfully forwarded ctrlc to process: {:?}", pid),
            Err(e) => debug!("Failed to forward ctrlc to process: {:?}", e),
        }
    })
    .expect("Error setting Ctrl-C handler");

    Ok(())
}
