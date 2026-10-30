{
  description = "greenwolf-portfolio dev environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_22
            chromium
          ];

          # Puppeteer's bundled Chrome won't run on NixOS; use nixpkgs' chromium
          # for scripts/generate-pdf.mjs (npm run build).
          shellHook = ''
            export PUPPETEER_SKIP_DOWNLOAD=true
            export PUPPETEER_EXECUTABLE_PATH=${pkgs.chromium}/bin/chromium
          '';
        };
      });
}
