#!/usr/bin/env python3
"""Write a 3D LUT that maps SDR BT.709 graphics to HLG BT.2020 signal values.

    make_hlg_lut.py OUT.cube [--white 0.91] [--size 65] [--gamma 2.4]

SDR white lands at `--white` HLG signal. BT.2408 says 0.75; on bright phone selfies 0.75
reads as a grey filter over the text, 0.91 sits just above typical skin. The file is
generated rather than shipped because a 65^3 LUT is ~7 MB.
"""
import argparse
import numpy as np

M709_2020 = np.array([[0.6274, 0.3293, 0.0433],
                      [0.0691, 0.9195, 0.0114],
                      [0.0164, 0.0880, 0.8956]])
A, B, C = 0.17883277, 0.28466892, 0.55991073


def hlg_oetf(e):
    e = np.clip(e, 0, 1)
    return np.where(e <= 1 / 12, np.sqrt(3 * e), A * np.log(np.maximum(12 * e - B, 1e-12)) + C)


def hlg_inv(v):
    return np.where(v <= 0.5, v * v / 3, (np.exp((v - C) / A) + B) / 12)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--white", type=float, default=0.91)
    ap.add_argument("--size", type=int, default=65)
    ap.add_argument("--gamma", type=float, default=2.4)
    a = ap.parse_args()
    n = a.size
    g = np.linspace(0, 1, n)
    b, gg, r = np.meshgrid(g, g, g, indexing="ij")          # .cube order: red fastest
    rgb = np.stack([r, gg, b], -1).reshape(-1, 3)
    # Display light (BT.1886) in BT.2020, then the inverse HLG OOTF (system gamma 1.2,
    # on luminance) back to scene light, then the HLG OETF.
    with np.errstate(all="ignore"):
        disp = np.clip((rgb ** a.gamma) @ M709_2020.T, 0, None)
        y = disp @ np.array([0.2627, 0.6780, 0.0593])
        scene = np.where(y[:, None] > 0, disp * np.power(np.maximum(y, 1e-12), 1 / 1.2 - 1)[:, None], 0)
    out = hlg_oetf(scene * float(hlg_inv(np.array(a.white))))
    with open(a.out, "w") as fh:
        fh.write(f'TITLE "SDR709 graphics to HLG2020, white = {a.white} HLG"\n'
                 f"LUT_3D_SIZE {n}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n")
        fh.writelines(f"{x:.6f} {y:.6f} {z:.6f}\n" for x, y, z in out)


if __name__ == "__main__":
    main()
