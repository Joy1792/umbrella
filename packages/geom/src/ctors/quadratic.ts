import { Attribs } from "@thi.ng/geom-api";
import { quadraticFromLine as _line } from "@thi.ng/geom-splines";
import { Vec } from "@thi.ng/vectors";
import { Quadratic } from "../api/quadratic";
import { pclike } from "../internal/pclike";

export function quadratic(a: Vec, b: Vec, c: Vec, attribs?: Attribs): Quadratic;
export function quadratic(pts: Vec[], attribs?: Attribs): Quadratic;
export function quadratic(...args: any[]) {
    return pclike(Quadratic, args);
}

export const quadraticFromLine = (a: Vec, b: Vec, attribs?: Attribs) =>
    new Quadratic(_line(a, b), attribs);
