use rand::distributions::Alphanumeric;
use rand::{thread_rng, Rng};
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use std::{fs, io::Write};

use eyre::{Result, WrapErr};

use crate::artifacts::{GardenArtifact, NATIVE_MODULES, NODE_BINARY, SOURCE, STATIC};
use crate::cleanup::start_cleanup_thread;
use crate::log::debug;

pub(crate) fn extract_archives_if_needed(root_path: &Path) -> Result<PathBuf> {
    fs::create_dir_all(root_path)?;

    let (latest_dir, older_dirs) = find_existing_extract_dirs(root_path)?;

    if let Some(p) = latest_dir {
        if !extracts_needed(&p)? {
            // cleanup happens in the background to avoid users waiting for it
            start_cleanup_thread(older_dirs, p.clone());

            return Ok(p);
        }
    }

    // generate a random directory name, ending with "r"
    let mut rng = thread_rng();
    let s: String = (0..7).map(|_| rng.sample(Alphanumeric) as char).collect();
    let current_time = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap();
    let dirname = format!("{}-{}.r", current_time.as_secs(), s);
    let extract_path = root_path.join(OsString::from(dirname.clone()));

    if extract_path.exists() {
        debug!("{}: already exists", extract_path.display());

        // Just try again in the unlikely case that the randomly generated path already exists.
        return extract_archives_if_needed(root_path);
    }

    fs::create_dir_all(extract_path.clone())?;

    extract_archive(&extract_path, NODE_BINARY)?;
    extract_archive(&extract_path, NATIVE_MODULES)?;
    extract_archive(&extract_path, STATIC)?;
    extract_archive(&extract_path, SOURCE)?;

    // cleanup happens in the background to avoid users waiting for it
    start_cleanup_thread(older_dirs, extract_path.clone());

    Ok(extract_path)
}

fn extracts_needed(path: &Path) -> Result<bool> {
    Ok(is_extract_needed(path, NODE_BINARY)?
        || is_extract_needed(path, NATIVE_MODULES)?
        || is_extract_needed(path, STATIC)?
        || is_extract_needed(path, SOURCE)?)
}

fn find_existing_extract_dirs(root_path: &Path) -> Result<(Option<PathBuf>, Vec<PathBuf>)> {
    // list all Garden extraction directories in the temporary directory root_path
    let mut directories: Vec<PathBuf> = fs::read_dir(root_path)
        .wrap_err_with(|| format!("Failed to read directory {:?}", root_path))?
        .flatten() // remove failed directories, e.g. where permissions are not sufficient
        .map(|entry| entry.path())
        .filter(|path| {
            if !path.is_dir() {
                return false;
            }

            // match only directories ending with ".r" for root
            // This allows us to add other files or directories to the temp directory in the future, without interfering with the extraction process
            let ext = path.extension().unwrap_or_default();
            if ext == "r" {
                return true;
            }

            false
        })
        .collect();

    // sort by filename. The names contain the seconds since unix epoch, so they will be sorted by creation time.
    directories.sort();

    let latest_entry = directories.pop();
    let cleanup_dirs: Vec<PathBuf> = directories;

    Ok((latest_entry, cleanup_dirs))
}

// extract needed check

fn is_extract_needed(path: &Path, artifact: GardenArtifact) -> Result<bool> {
    let checksum_file = path.join(format!("{}.sha256sum", artifact.name));

    if !checksum_file.exists() {
        debug!(
            "{}: checksum file does not exist: {:?}",
            artifact.name, checksum_file
        );
        return Ok(true);
    }

    if checksum_file.exists()
        && fs::read(checksum_file.clone())
            .wrap_err_with(|| format!("Failed read {:?}", checksum_file))?
            == artifact.sha256.to_vec()
    {
        debug!(
            "{}: already extracted (checksum file: {:?})",
            artifact.name, checksum_file
        );
        return Ok(false);
    }

    debug!("{}: Needs extraction", artifact.name);

    Ok(true)
}

// extraction

fn extract_archive(path: &Path, artifact: GardenArtifact) -> Result<()> {
    debug!(
        "{}: extracting {:?} bytes...",
        artifact.name,
        artifact.archive.len()
    );

    // if not match, extract the NODE_BINARY_ARCHIVE
    unpack(path, artifact.archive).wrap_err_with(|| {
        format!(
            "Failed to extract archive {} into {:?}",
            artifact.name, path
        )
    })?;

    debug!("{}: Successfully extracted to {:?}", artifact.name, path);

    let checksum_file = path.join(format!("{}.sha256sum", artifact.name));

    // write the checksum file
    fs::File::create(checksum_file.clone())
        .wrap_err_with(|| format!("Failed to create checksum file {:?}", checksum_file))?
        .write_all(artifact.sha256)
        .wrap_err_with(|| format!("Failed to write checksum file {:?}", checksum_file))?;

    Ok(())
}

fn unpack(path: &Path, archive: &[u8]) -> Result<(), std::io::Error> {
    // extract the NODE_BINARY_ARCHIVE
    let decoder = flate2::read::GzDecoder::new(archive);
    let mut archive = tar::Archive::new(decoder);

    archive.unpack(path)?;

    Ok(())
}

// #[cfg(test)]
// mod tests {
//     use std::{fs, path::PathBuf};
//
//     use super::extract_archives_if_needed;
//
//     #[test]
//     fn test_extract_smoke() {
//         let dir: PathBuf = "/tmp/garden-sea-test".into();
//
//         if dir.exists() {
//             fs::remove_dir_all(&dir).expect("Failed to delete temporary directory");
//         }
//
//         // This test mostly ensures that we have no panic due to corrupt archives in release builds.
//         extract_archives_if_needed(&dir).expect("Failed self-extract");
//     }
// }
