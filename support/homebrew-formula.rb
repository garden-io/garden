class GardenCli < Formula
  desc "Development engine for Kubernetes"
  homepage "https://garden.io"
  url "{{{tarballUrl}}}"
  version "{{version}}"
  sha256 "{{sha256}}"

  depends_on "rsync"

  def install
    libexec.install "garden", "*.node", "static"
    bin.install_symlink libexec/"garden"
  end

  test do
    # just make sure the command works
    system bin/"garden", "--help"
  end
end
