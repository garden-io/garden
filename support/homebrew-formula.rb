class GardenCli < Formula
  desc "{{description}}"
  homepage "{{{homepage}}}"
  url "{{{tarballUrl}}}"
  version "{{version}}"
  sha256 "{{sha256}}"

  depends_on "rsync"

  def install
    libexec.install "garden", "fse.node", "static"
    bin.install_symlink libexec/"garden"
  end

  test do
    # just make sure the command works
    system bin/"garden", "--help"
  end
end
