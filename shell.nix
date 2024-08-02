{
  nixpkgs ? import <nixpkgs> { },
  toolVersions ? import ./nix/tool-versions.nix,
  nodejs ? nixpkgs.${"nodejs_" + toString toolVersions.nodejs},
}:
nixpkgs.mkShell {
  env = {
    GARDEN_DISABLE_ANALYTICS = true;
    GARDEN_DISABLE_VERSION_CHECK = true;
    ANALYTICS_DEV = true;
  };

  packages = [
    nodejs
    nixpkgs.jq
    nixpkgs.kubectl
    nixpkgs.kubernetes-helm
  ];
}
