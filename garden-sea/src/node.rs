use std::{
    env,
    ffi::OsString,
    fs,
    path::Path,
    process::{Child, Command},
    thread::JoinHandle,
};

use eyre::{Result, WrapErr};

use crate::{log::debug, signal};

pub(crate) fn spawn_garden<T>(path: &Path, sea_args: T) -> Result<Child>
where
    T: Iterator<Item = String>,
{
    #[cfg(unix)]
    let node = "bin/node";
    #[cfg(windows)]
    let node = "bin/node.exe";

    // We do allow users to set NODE_* variables and they are passed through to the underlying node by default.
    // Some users depend on this, e.g. for NODE_EXTRA_CA_CERTS.
    let mut command = Command::new(path.join(node));

    // Canonicalize resolves symlinks, which is important so self-update updates in the correct directory.
    let executable_path = fs::canonicalize(
        process_path::get_executable_path().expect("Failed to get executable path"),
    )?;
    command.env("GARDEN_SEA_EXTRACTED_ROOT", OsString::from(path));
    command.env("GARDEN_SEA_EXECUTABLE_PATH", executable_path);

    // Allow users to override the heap size if needed.
    let max_old_space_size = env::var("GARDEN_MAX_OLD_SPACE_SIZE").unwrap_or("4096".into());
    let max_semi_space_size = env::var("GARDEN_MAX_SEMI_SPACE_SIZE").unwrap_or("64".into());

    let mut node_args: Vec<OsString> = vec![
        // Allow larger heap size than default
        // TODO: consider what happens when users also set the NODE_OPTIONS env var
        format!("--max-semi-space-size={}", max_semi_space_size).into(),
        format!("--max-old-space-size={}", max_old_space_size).into(),
        // execute garden.mjs
        path.join("rollup").join("garden.mjs").into(),
    ];

    node_args.extend(sea_args.skip(1).map(|s| s.into()));

    debug!("Spawning {} with {:?}", node, node_args);
    for env in command.get_envs() {
        debug!("Environment variable: {:?}={:?}", env.0, env.1.unwrap());
    }
    command.args(node_args.clone());

    Command::spawn(&mut command)
        .wrap_err_with(|| format!("Failed to spawn {} with {:?}", node, node_args))
}

pub(crate) fn wait(mut child: Child) -> Result<Option<i32>> {
    let child_id: u32 = child.id();

    let thread: JoinHandle<Option<i32>> = std::thread::spawn(move || {
        let result = child
            .wait()
            // This should not happen, as we wait immediately after spawning
            .expect("Failed to wait for child process: Is the child process still running?");

        result.code()
    });

    signal::set_console_ctrl_handler(child_id)?;

    let result = thread
        .join()
        .expect("Failed to join thread waiting for child");

    if let Some(exit_status) = result {
        debug!("Child exited with status: {}", exit_status);
        return Ok(Some(exit_status));
    }

    debug!("Child exited due to signal");

    Ok(None)
}

#[cfg(test)]
mod tests {
    use std::env;

    use crate::{extract::extract_archives_if_needed, node::spawn_garden};

    use super::wait;

    #[test]
    #[ignore = "This test does not work in cross, because the git binary is missing in the container."]
    fn test_garden_version() {
        let directories = directories::ProjectDirs::from("io", "garden", "garden-test")
            .expect("Failed to get temporary directory");

        let root_path = directories.data_dir();

        // windows tests are running in wine, node doesn't like that.
        env::set_var("NODE_SKIP_PLATFORM_CHECK", "1");

        // This test mostly ensures that we have no panic due to corrupt archives in release builds.
        let result = extract_archives_if_needed(root_path).expect("Failed self-extract");

        let child = spawn_garden(&result, ["garden".into(), "version".into()].into_iter())
            .expect("Failed to spawn garden");
        let return_code = wait(child).expect("Failed waiting for garden").unwrap();
        assert!(return_code == 0);
    }
}
