mod artifacts;
mod cleanup;
mod extract;
mod log;
mod node;
mod signal;
mod terminate;

use eyre::{Result, WrapErr};
use std::process::exit;

use crate::extract::extract_archives_if_needed;

const EXIT_GARDEN_SEA_ERROR: i32 = 11;

fn main() -> Result<()> {
    let directories = directories::ProjectDirs::from("io", "garden", "garden")
        .expect("Failed to get temporary directory");

    let tmp_root = directories.data_dir();
    let extracted_root = extract_archives_if_needed(tmp_root).wrap_err("Failed self-extract")?;

    let child =
        node::spawn_garden(&extracted_root, std::env::args()).wrap_err("Failed to spawn garden")?;

    let pid = child.id();

    let exit_code =
        node::wait(child).wrap_err_with(|| format!("Failed waiting for garden (pid {})", pid))?;

    // we need to unwrap, as in case the child was terminated by a signal, we don't have an exit code
    exit(exit_code.unwrap_or(EXIT_GARDEN_SEA_ERROR))
}
