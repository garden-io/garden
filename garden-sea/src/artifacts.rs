#[derive(Copy, Clone)]
pub struct GardenArtifact {
    pub name: &'static str,
    pub archive: &'static [u8],
    pub sha256: &'static [u8],
}

// source

pub static SOURCE: GardenArtifact = GardenArtifact {
    name: "source",
    archive: include_bytes!("../tmp/source.tar.gz"),
    sha256: include_bytes!("../tmp/source.sha256"),
};

// static

pub static STATIC: GardenArtifact = GardenArtifact {
    name: "static",
    archive: include_bytes!("../tmp/static.tar.gz"),
    sha256: include_bytes!("../tmp/static.sha256"),
};

// bin

#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
pub static NODE_BINARY: GardenArtifact = GardenArtifact {
    name: "bin",
    archive: include_bytes!("../tmp/node/windows-amd64/node.tar.gz"),
    sha256: include_bytes!("../tmp/node/windows-amd64/node.sha256"),
};

#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
pub static NODE_BINARY: GardenArtifact = GardenArtifact {
    name: "bin",
    archive: include_bytes!("../tmp/node/macos-amd64/node.tar.gz"),
    sha256: include_bytes!("../tmp/node/macos-amd64/node.sha256"),
};

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
pub static NODE_BINARY: GardenArtifact = GardenArtifact {
    name: "bin",
    archive: include_bytes!("../tmp/node/macos-arm64/node.tar.gz"),
    sha256: include_bytes!("../tmp/node/macos-arm64/node.sha256"),
};

#[cfg(all(target_os = "linux", target_arch = "x86_64", target_env = "gnu"))]
pub static NODE_BINARY: GardenArtifact = GardenArtifact {
    name: "bin",
    archive: include_bytes!("../tmp/node/linux-amd64/node.tar.gz"),
    sha256: include_bytes!("../tmp/node/linux-amd64/node.sha256"),
};

#[cfg(all(target_os = "linux", target_arch = "aarch64", target_env = "gnu"))]
pub static NODE_BINARY: GardenArtifact = GardenArtifact {
    name: "bin",
    archive: include_bytes!("../tmp/node/linux-arm64/node.tar.gz"),
    sha256: include_bytes!("../tmp/node/linux-arm64/node.sha256"),
};

#[cfg(all(target_os = "linux", target_arch = "x86_64", target_env = "musl"))]
pub static NODE_BINARY: GardenArtifact = GardenArtifact {
    name: "bin",
    archive: include_bytes!("../tmp/node/alpine-amd64/node.tar.gz"),
    sha256: include_bytes!("../tmp/node/alpine-amd64/node.sha256"),
};

// native

#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
pub static NATIVE_MODULES: GardenArtifact = GardenArtifact {
    name: "native",
    archive: include_bytes!("../tmp/windows-amd64-native.tar.gz"),
    sha256: include_bytes!("../tmp/windows-amd64-native.sha256"),
};

#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
pub static NATIVE_MODULES: GardenArtifact = GardenArtifact {
    name: "native",
    archive: include_bytes!("../tmp/macos-amd64-native.tar.gz"),
    sha256: include_bytes!("../tmp/macos-amd64-native.sha256"),
};

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
pub static NATIVE_MODULES: GardenArtifact = GardenArtifact {
    name: "native",
    archive: include_bytes!("../tmp/macos-arm64-native.tar.gz"),
    sha256: include_bytes!("../tmp/macos-arm64-native.sha256"),
};

#[cfg(all(target_os = "linux", target_arch = "x86_64", target_env = "gnu"))]
pub static NATIVE_MODULES: GardenArtifact = GardenArtifact {
    name: "native",
    archive: include_bytes!("../tmp/linux-amd64-native.tar.gz"),
    sha256: include_bytes!("../tmp/linux-amd64-native.sha256"),
};

#[cfg(all(target_os = "linux", target_arch = "aarch64", target_env = "gnu"))]
pub static NATIVE_MODULES: GardenArtifact = GardenArtifact {
    name: "native",
    archive: include_bytes!("../tmp/linux-arm64-native.tar.gz"),
    sha256: include_bytes!("../tmp/linux-arm64-native.sha256"),
};

#[cfg(all(target_os = "linux", target_arch = "x86_64", target_env = "musl"))]
pub static NATIVE_MODULES: GardenArtifact = GardenArtifact {
    name: "native",
    archive: include_bytes!("../tmp/alpine-amd64-native.tar.gz"),
    sha256: include_bytes!("../tmp/alpine-amd64-native.sha256"),
};
