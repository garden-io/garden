require "language/node"

class GardenCli < Formula
  desc "{{description}}"
  homepage "{{{homepage}}}"
  url "{{{tarballUrl}}}"
  sha256 "{{sha256}}"

  depends_on "node"
  depends_on "rsync"
  depends_on "watchman"
  depends_on "python" => :build

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    # add a meaningful test here
  end
end
