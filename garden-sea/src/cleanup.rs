use std::path::Path;

use crate::log::debug;
use eyre::Result;
use std::path::PathBuf;

// background cleanup thread.
pub(crate) fn start_cleanup_thread(cleanup_dirs: Vec<PathBuf>, current_dir: PathBuf) {
    std::thread::spawn(move || {
        for dir in cleanup_dirs {
            if dir != current_dir {
                debug!("Determining if {:?} is currently used...", dir);
                let result = is_directory_used(&dir);
                if let Ok(is_in_use) = result {
                    if is_in_use {
                        debug!("Skipping {:?} as it is currently in use", dir);
                        continue;
                    }
                } else {
                    debug!(
                        "Failed to determine if {:?} is currently used: {:?}",
                        dir, result
                    );
                    continue;
                }

                debug!("Removing {:?}...", dir);
                let result = std::fs::remove_dir_all(&dir);
                if let Err(e) = result {
                    debug!("Failed to remove {:?}: {:?}", dir, e);
                } else {
                    debug!("Removed {:?}", dir);
                }
            }
        }
    });
}

// platform-specific code

#[cfg(unix)]
fn is_directory_used(path: &Path) -> Result<bool> {
    use sysinfo::{ProcessExt, System, SystemExt};

    let mut sys = System::new();
    sys.refresh_processes();

    let paths: Vec<PathBuf> = sys
        .processes()
        .iter()
        .map(|(_pid, process)| {
            return process.exe().to_owned();
        })
        .collect();

    for exe in paths {
        if exe.starts_with(path) {
            debug!(
                "is_directory_used: {:?} is in use by a running garden process.",
                path
            );
            return Ok(true);
        }
    }

    // Of course there is the possibility of races. Only way to exclude that possibility is using locks, which comes with it's own complexities.
    debug!("is_directory_used: Not used: Did not find any running process whose executable lives in {:?}.", path);
    Ok(false)
}

#[cfg(windows)]
fn is_directory_used(path: &Path) -> Result<bool> {
    match std::fs::rename(path, path) {
        Ok(()) => {
            // Of course there is the possibility of races. Only way to exclude that possibility is using locks, which comes with it's own complexities.
            debug!("is_directory_used: {:?} successfully renamed. Not in use by a running garden process.", path);
            return Ok(false);
        }
        Err(err) => {
            debug!("is_directory_used: {:?} could not be renamed. Likely in use by a running garden process. Error: {:?}", path, err);
            return Ok(true);
        }
    }
}
